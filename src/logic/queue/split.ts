import { QueueOrder } from '../../domain/constants';

/**
 * split the queued data into the selected and remainder data
 *
 * note
 * - this is the base function called by peek and pop
 * - this should not be called by users directly
 */
export const split = <T>({
  data,
  order,
  slice,
}: {
  data: T[];
  order: QueueOrder;
  slice: { start: number; end: number };
}): { selection: T[]; remainder: T[] } => {
  // handle fifo
  if (order === QueueOrder.FIRST_IN_FIRST_OUT) {
    const selection = data.slice(slice.start, slice.end);
    const remainder = [
      ...data.slice(0, slice.start), // all before the slice
      ...data.slice(slice.end), // all after the slice
    ];
    return { selection, remainder };
  }

  // handle lifo
  if (order === QueueOrder.LAST_IN_FIRST_OUT) {
    const selection = data
      .slice(
        slice.end * -1,
        slice.start * -1 === 0 ? undefined : slice.start * -1,
      )
      .reverse();
    const remainder = [
      ...data.slice(0, slice.end * -1), // all before the slice
      ...(slice.start > 0 ? data.slice(slice.start * -1) : []), // all after the slice
    ];
    return { selection, remainder };
  }

  // if the above didn't handle it, probably an error
  throw new Error('unexpected queue type');
};
