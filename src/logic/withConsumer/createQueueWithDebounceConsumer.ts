import { QueueOrder } from '../../domain/constants';
import { createQueue } from '../queue/createQueue';

/**
 * creates a queue with a consumer that consumes all items from it as soon as new items stop being added
 *
 * note
 * - produces one call to the consumer for all pushes to the queue that occurred within the delay period of eachother
 *
 * usecases
 * - waiting until all rapid activity stops to summarize the activity, before processing it
 *   - for example: scroll events, mouse movements, typing, etc
 */
export const createQueueWithDebounceConsumer = <T>({
  consumer,
  gap,
}: {
  /**
   * the consumer to invoke with all of the events added to the queue queue, after debounce delay has expired
   */
  consumer: ({ items }: { items: T[] }) => void | Promise<void>;

  /**
   * the gap in time to wait between new events before calling the consumer
   */
  gap: { milliseconds: number };
}) => {
  // create the queue
  const queue = createQueue<T>({ order: QueueOrder.FIRST_IN_FIRST_OUT });

  // subscribe to the queue, calling the consumer, with debouncing

  let priorTimeoutHandle: NodeJS.Timeout | null = null;
  queue.on.push.subscribe({
    consumer: () => {
      // if a timeout already exists, remove it
      if (priorTimeoutHandle) clearTimeout(priorTimeoutHandle);

      // set a new timeout of 100ms to capture the screen changes
      priorTimeoutHandle = setTimeout(async () => {
        // define the current length of the queue
        const length = queue.length + 0; // +0 to ensure its a copy, and not a reference

        // grab all of the items currently from the queue, without removing them from the queue yet
        const items = queue.peek(length);

        // wait for the consumer to successfully process the items
        await consumer({ items });

        // dequeue the items from the queue, now that they're all processed
        queue.pop(length);
      }, gap.milliseconds);
    },
  });

  // return the queue
  return queue;
};
