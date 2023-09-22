import { EventStream } from 'event-stream-pubsub';

import { QueueOrder } from '../../domain/constants';
import { split } from './split';

export interface Queue<T> {
  /**
   * add one or more items into the queue
   */
  push: (item: T | T[]) => void;

  /**
   * view the top items from the queue, without removing them
   *
   * note
   * - `.peek() === .peek(1) === .peek(0, 1)` -> view the top item
   * - `.peek(2) === .peek(0, 2)` -> view the top 2 items
   * - `.peek(2, 3)` -> view the top 2nd and 3rd items
   */
  peek: (start?: number, end?: number) => T[];

  /**
   * remove the top items from the queue
   *
   * note
   * - `.pop() === .pop(1) === .pop(0, 1)` -> remove the top item
   * - `.pop(2) === .pop(0, 2)` -> remove the top 2 items
   * - `.pop(2, 3)` -> remove the top 2nd and 3rd items
   */
  pop: (start?: number, end?: number) => T[];

  /**
   * the current number of items in the queue
   */
  length: number;

  /**
   * event streams that can be subscribed to
   */
  on: {
    push: Omit<EventStream<{ items: T[] }>, 'publish'>;
    peek: EventStream<{ items: T[] }>;
    pop: EventStream<{ items: T[] }>;
  };
}

const castOptionalStartEndToSlice = (
  start?: number,
  end?: number,
): { start: number; end: number } =>
  end !== undefined && start !== undefined
    ? { start, end }
    : start
    ? { start: 0, end: start }
    : { start: 0, end: 1 };

export const createQueue = <T>({ order }: { order: QueueOrder }): Queue<T> => {
  // instantiate the in memory data store
  let data: T[] = [];

  // instantiate the event streams
  const on = {
    push: new EventStream<{ items: T[] }>(),
    peek: new EventStream<{ items: T[] }>(),
    pop: new EventStream<{ items: T[] }>(),
  };

  // define the methods for interacting with the data store
  return {
    push: (item: T | T[]) => {
      const items = Array.isArray(item) ? item : [item];
      data.push(...items);
      on.push.publish({ items });
    },
    peek: (start?: number, end?: number) => {
      const slice = castOptionalStartEndToSlice(start, end);
      const { selection } = split({ data, order, slice });
      on.peek.publish({ items: selection });
      return selection;
    },
    pop: (start?: number, end?: number) => {
      const slice = castOptionalStartEndToSlice(start, end);
      const { selection, remainder } = split({ data, order, slice });
      on.pop.publish({ items: selection });
      data = remainder; // update the data to remove the selection
      return selection;
    },
    get length() {
      return data.length;
    },
    on,
  };
};
