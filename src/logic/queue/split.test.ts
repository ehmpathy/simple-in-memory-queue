import { QueueOrder } from '../../domain/constants';
import { split } from './split';

describe('split', () => {
  it('should correctly define the selection and remainder for a fifo queue', () => {
    const data = ['a', 'b', 'c', 'd', 'e'];
    const { selection, remainder } = split({
      data,
      order: QueueOrder.FIRST_IN_FIRST_OUT,
      slice: { start: 1, end: 3 },
    });
    expect(selection).toEqual(['b', 'c']);
    expect(remainder).toEqual(['a', 'd', 'e']);
  });
  it('should correctly define the selection and remainder for a lifo queue', () => {
    const data = ['a', 'b', 'c', 'd', 'e'];
    const { selection, remainder } = split({
      data,
      order: QueueOrder.LAST_IN_FIRST_OUT,
      slice: { start: 1, end: 3 },
    });
    expect(selection).toEqual(['d', 'c']);
    expect(remainder).toEqual(['a', 'b', 'e']);
  });
});
