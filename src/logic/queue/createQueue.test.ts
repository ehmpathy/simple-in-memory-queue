import { QueueOrder } from '../../domain/constants';
import { createQueue } from './createQueue';

describe('createQueue', () => {
  it('should correctly peek - fifo', () => {
    const queue = createQueue<string>({ order: QueueOrder.FIRST_IN_FIRST_OUT });
    const data = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
    queue.push(data);
    const peek1 = queue.peek();
    expect(peek1).toEqual(['a']);
    const peek2 = queue.peek(5);
    expect(peek2).toEqual(['a', 'b', 'c', 'd', 'e']);
    const peek3 = queue.peek(3, 7);
    expect(peek3).toEqual(['d', 'e', 'f', 'g']);
    const peekAll = queue.peek(0, queue.length);
    expect(peekAll).toEqual(data);
  });
  it('should correctly peek - lifo', () => {
    const queue = createQueue<string>({ order: QueueOrder.LAST_IN_FIRST_OUT });
    const data = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
    queue.push(data);
    const peek1 = queue.peek();
    expect(peek1).toEqual(['i']);
    const peek2 = queue.peek(5);
    expect(peek2).toEqual(['i', 'h', 'g', 'f', 'e']);
    const peek3 = queue.peek(3, 7);
    expect(peek3).toEqual(['f', 'e', 'd', 'c']);
    const peekAll = queue.peek(0, queue.length);
    expect(peekAll).toEqual(data.reverse());
  });
  it('should correctly pop - fifo', () => {
    const queue = createQueue<string>({ order: QueueOrder.FIRST_IN_FIRST_OUT });
    queue.push([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
      'h',
      'i',
      'j',
      'k',
      'l',
      'm',
      'n',
      'o',
    ]);
    const pop1 = queue.pop();
    expect(pop1).toEqual(['a']);
    const pop2 = queue.pop();
    expect(pop2).toEqual(['b']);
    const pop3 = queue.pop(5);
    expect(pop3).toEqual(['c', 'd', 'e', 'f', 'g']);
    const pop4 = queue.pop(3, 7);
    expect(pop4).toEqual(['k', 'l', 'm', 'n']);
  });
  it('should correctly pop - lifo', () => {
    const queue = createQueue<string>({ order: QueueOrder.LAST_IN_FIRST_OUT });
    queue.push([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
      'h',
      'i',
      'j',
      'k',
      'l',
      'm',
      'n',
      'o',
    ]);
    const pop1 = queue.pop();
    expect(pop1).toEqual(['o']);
    const pop2 = queue.pop();
    expect(pop2).toEqual(['n']);
    const pop3 = queue.pop(5);
    expect(pop3).toEqual(['m', 'l', 'k', 'j', 'i']);
    const pop4 = queue.pop(3, 7);
    expect(pop4).toEqual(['e', 'd', 'c', 'b']);
  });
});
