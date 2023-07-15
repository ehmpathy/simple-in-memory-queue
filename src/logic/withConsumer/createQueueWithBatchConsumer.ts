import { QueueOrder } from '../../domain/constants';
import { createQueue } from '../queue/createQueue';

/**
 * creates a queue with a consumer that consumes batches of items
 *
 * note
 * - batches are created when either batchSize is met or delayThreshold is exceeded
 *
 * usecases
 * - sending batches of events to another source, without waiting too long between event creation and event submission
 */
export const createQueueWithBatchConsumer = <T>({
  consumer,
  threshold,
}: {
  /**
   * the consumer to invoke with batches of items
   */
  consumer: ({ items }: { items: T[] }) => void | Promise<void>;

  /**
   * the thresholds which will trigger a batch to be consumed
   */
  threshold: {
    /**
     * the milliseconds delay between when an event was added and it is consumed
     *
     * note
     * - this defines the max delay for a batch
     */
    milliseconds: number;

    /**
     * the number of items that are available for consumption
     *
     * note
     * - this will also define the max size for a batch
     */
    size: number;
  };
}) => {
  // create the queue
  const queue = createQueue<T>({ order: QueueOrder.FIRST_IN_FIRST_OUT });

  // define what to do when a threshold is crossed
  let priorTimeoutHandle: NodeJS.Timeout | null = null;
  const onThresholdExceeded = async () => {
    // clear the timeout, to ensure that if size threshold fires the timeout threshold wont cause a duplicate trigger
    if (priorTimeoutHandle) {
      clearTimeout(priorTimeoutHandle);
      priorTimeoutHandle = null;
    }

    // define the size of the batch to pull
    const size =
      queue.length > threshold.size
        ? threshold.size // if queue has more items than threshold, use threshold size as batch size -> sets max size
        : queue.length + 0; //otherwise, batch size is all available items; (+0 to ensure its a copy, and not a reference)

    // grab the batch of items
    const items = queue.peek(size);

    // wait for the consumer to successfully process the items
    await consumer({ items });

    // dequeue the items from the queue, now that they're all processed
    queue.pop(size);
  };

  // and set checks for whether the threshold is exceeded, on each push
  queue.on.push.subscribe({
    consumer: () => {
      // if a timeout does not exist, start it
      if (!priorTimeoutHandle)
        priorTimeoutHandle = setTimeout(
          onThresholdExceeded,
          threshold.milliseconds,
        );

      // if size has been exceeded, trigger now
      if (queue.length >= threshold.size) void onThresholdExceeded();
    },
  });

  // return the queue
  return queue;
};
