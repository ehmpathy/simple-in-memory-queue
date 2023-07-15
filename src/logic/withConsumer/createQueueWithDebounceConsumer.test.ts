import { sleep } from '../../../../../utils/sleep';
import { createQueueWithDebounceConsumer } from './createQueueWithDebounceConsumer';

describe('createQueueWithDebounceConsumer', () => {
  beforeEach(() => jest.resetAllMocks());
  it('should invoke the consumer only after the gap between events has passed the threshold', async () => {
    const mockedConsumer = jest.fn();
    const queue = createQueueWithDebounceConsumer<string>({
      gap: { milliseconds: 100 },
      consumer: mockedConsumer,
    });

    // add to queue
    queue.push('a');

    // prove not invoked yet
    expect(mockedConsumer).not.toHaveBeenCalled();

    // add to queue again
    queue.push('b');

    // prove not invoked yet
    expect(mockedConsumer).not.toHaveBeenCalled();

    // wait 100ms
    await sleep(110);

    // prove invoked
    expect(mockedConsumer).toHaveBeenCalled();
    expect(mockedConsumer).toHaveBeenCalledTimes(1);
    expect(mockedConsumer).toHaveBeenCalledWith({ items: ['a', 'b'] });
  });
  it('should invoke the consumer with only the events from the new batch, when more than one successive batch', async () => {
    const mockedConsumer = jest.fn();
    const queue = createQueueWithDebounceConsumer<string>({
      gap: { milliseconds: 100 },
      consumer: mockedConsumer,
    });

    // add to queue
    queue.push('a');
    queue.push('b');

    // wait 100ms to allow it to be invoked
    await sleep(110);

    // prove invoked
    expect(mockedConsumer).toHaveBeenCalled();
    expect(mockedConsumer).toHaveBeenCalledTimes(1);
    expect(mockedConsumer).toHaveBeenLastCalledWith({ items: ['a', 'b'] });

    // add more to the queue
    queue.push('c');
    queue.push('d');
    queue.push('e');

    // prove not invoked again yet
    expect(mockedConsumer).toHaveBeenCalledTimes(1); // still only once

    // wait 100ms to allow it to be invoked
    await sleep(110);

    // prove invoked with only the new batch of data
    expect(mockedConsumer).toHaveBeenCalledTimes(2);
    expect(mockedConsumer).toHaveBeenLastCalledWith({ items: ['c', 'd', 'e'] });
  });
});
