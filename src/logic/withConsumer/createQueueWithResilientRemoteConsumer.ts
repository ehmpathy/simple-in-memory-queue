import { createCache } from 'simple-in-memory-cache';
import { withSimpleCaching } from 'with-simple-caching';

import { QueueOrder } from '../../domain/constants';
import { createQueue } from '../queue/createQueue';

const getMseNow = () => new Date().getTime();

/**
 * creates a queue with a consumer which consumes each item one at a time with a remote calls, resiliently
 *
 * features
 * - is event driven: processes items one at a time as soon as they are queued, w/ a `maxConcurrency`
 * - is resilient: retries the items up to `retryThreshold` times in a row, removing it from queue after threshold exceeded
 *   - calls "onFailureAttempt" method when an item's failure count is below the `retryThreshold`
 *   - calls "onFailurePermanent" method when an item's failure count exceeds the `retryThreshold`
 * - is intelligent: pauses consuming items if more than `pauseThreshold` errors in a row on different items
 *   - calls "onPause" method when the `pauseThreshold` is exceeded
 * - is efficient: supports concurrency and non-blocking processing of items while others are delayed
 *   - allows consuming items in parallel
 *   - allows consumption of items while other items that have had a failure are delayed in the background
 *
 * usecases
 * - make calls against a remote api for each item
 *   - automatically retry items to recover from intermittent networking errors
 *   - intelligently pause processing if all items are failing
 */
export const createQueueWithResilientRemoteConsumer = <T>({
  consumer,
  threshold,
  delay,
  on,
}: {
  /**
   * the consumer to invoke with each item, which may throw an error
   */
  consumer: ({ item }: { item: T }) => Promise<void>;

  /**
   * the thresholds which affect consumption
   */
  threshold: {
    /**
     * the max concurrency with which to consume items
     */
    concurrency: 1; // TODO: support concurrency > 1

    /**
     * how many times to retry an item before considering it as permanently failing, calling the onFailurePermanent hook, and removing it from the queue
     *
     * note
     * - this ensures that intermittent errors are resolved automatically while not blocking other items if only one item has an issue
     */
    retry: number;

    /**
     * how many items in a row can fail before we pause consumption of the items and call the onPause hook
     *
     * note
     * - this ensures that if there is a systematic issue causing all items to fail, the system wont keep wasting resources pointlessly
     */
    pause: number;
  };

  /**
   * the delays which affect consumption
   */
  delay: {
    /**
     * the number of milliseconds to delay retrying after experiencing an error
     */
    retry: number;

    /**
     * the number of milliseconds to wait before an item in the queue should be visible to the consume
     *
     * usecases
     * - e.g., wait a second for some other stores to be updated before attempting to process the event
     */
    visibility?: number;
  };

  /**
   * the hooks available to subscribe to
   */
  on?: {
    /**
     * a hook that is called when an item fails but will be retried
     */
    failureAttempt?: ({
      item,
      attempt,
      error,
    }: {
      item: T;
      attempt: number;
      error: unknown;
    }) => void;

    /**
     * a hook that is called when an item failed beyond the retry threshold and will be removed from the queue
     */
    failurePermanent?: ({ item, error }: { item: T; error: unknown }) => void;

    /**
     * a hook that is called when the pause threshold is exceeded and consumption has been paused
     */
    pause?: ({ failures }: { failures: { item: T; error: unknown }[] }) => void;
  };
}) => {
  // create the queue
  const queueSource = createQueue<T>({ order: QueueOrder.FIRST_IN_FIRST_OUT });

  // create a queue to track the delayed messages
  const queueDelayed = createQueue<{
    item: T;
    failedAttempts: number;
    delayedUntilMse: number;
  }>({ order: QueueOrder.FIRST_IN_FIRST_OUT });

  // define a method to find the next item to consume from the queues
  const getNextItemToConsume = (): {
    item: T;
    failedAttempts: number;
  } | null => {
    // see if any item in the delay queue is ready to process
    const oldestDelayedItem = queueDelayed.peek()[0]; // peek to not remove it from queue yet, if we cant process it
    const delayedItemReadyToConsume =
      oldestDelayedItem && oldestDelayedItem.delayedUntilMse < getMseNow();
    if (delayedItemReadyToConsume) {
      queueDelayed.pop(); // remove it from the queue, since we're going to process it now
      return oldestDelayedItem;
    }

    // otherwise, get the next item from the queue
    const oldestQueuedItem = queueSource.pop()[0]; // pop to remove it from the queue, since we're going to process it now; if there's a failure, it will be pushed to the delayed queue
    if (oldestQueuedItem) return { item: oldestQueuedItem, failedAttempts: 0 };

    // otherwise, return null - no item to process
    return null;
  };

  // start tracking the sequential failures we've experienced
  let sequentialFailures: { item: T; error: unknown }[] = [];

  // start tracking whether consumption is paused
  let isConsumptionPaused = false;

  // define the method with which we will ensure we are consuming items resiliently and intelligently
  const consume = withSimpleCaching(
    async (): Promise<void> => {
      // check that we are not paused
      if (isConsumptionPaused) return; // if consumption is paused, we can exit here

      // lookup the next item to consume
      const itemWithMetadata = getNextItemToConsume();
      if (!itemWithMetadata) return; // if no more items, we can exit here
      const { item, failedAttempts } = itemWithMetadata;

      // try to consume the item
      const thisAttemptNumber = failedAttempts + 1;
      try {
        // run the consumer
        await consumer({ item });

        // if it was successful, clear the sequential failures
        sequentialFailures = [];
      } catch (error) {
        // mark this failure in the set of sequential failures
        sequentialFailures.push({ item, error });

        // if this failure took us over the sequential failure pause threshold, pause consumption
        if (sequentialFailures.length >= threshold.pause) {
          isConsumptionPaused = true;
          on?.pause?.({ failures: sequentialFailures });
        }

        // report that it has failed
        on?.failureAttempt?.({ item, attempt: thisAttemptNumber, error });

        // if we can retry it, queue it for retry
        const canRetry = thisAttemptNumber < threshold.retry;
        if (canRetry) {
          // add it to the delayed queue
          queueDelayed.push({
            item,
            failedAttempts: thisAttemptNumber,
            delayedUntilMse: getMseNow() + delay.retry,
          });
        }

        // if we can't retry it, report permanent failure
        if (!canRetry) {
          // dont add it to any queues, since we're not going to try to process it again

          // call the hook, to notify subscribers
          on?.failurePermanent?.({ item, error });
        }
      }

      // now that this item has been consumed, try and consume more if possible
      return consume();
    },
    {
      cache: createCache({
        defaultSecondsUntilExpiration: 0, // expire the promise as soon as it resolves -> dont allow duplicate invocations
      }),
    },
  );

  // subscribe to the source queue, ensure the consumer is running, find or creating the promise each time an item is pushed
  queueSource.on.push.subscribe({
    consumer: async () => {
      // if no visibility delay, invoke the consumer immediately
      if (!delay.visibility) return consume();

      // otherwise, invoke the consumer after the visibility delay
      setTimeout(() => consume(), delay.visibility);
    },
  });

  // subscribe to the delay queue, ensuring a consumer will be invoked after each delay expires
  queueDelayed.on.push.subscribe({
    consumer: async ({ event: { items } }) => {
      items.forEach((item) => {
        const millisecondsUntilReady = item.delayedUntilMse - getMseNow();
        if (process.env.NODE_ENV === 'test')
          console.log({ millisecondsUntilReady }); // for some reason, jest never invokes the timeout unless we log here 🙃 // TODO: find a way to eliminate this
        setTimeout(() => consume(), millisecondsUntilReady);
      });
    },
  });

  // return the source queue
  return queueSource;
};
