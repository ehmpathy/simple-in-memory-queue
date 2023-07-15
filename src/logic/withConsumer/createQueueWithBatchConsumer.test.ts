import { sleep } from '../../utils/sleep';
import { createQueueWithBatchConsumer } from './createQueueWithBatchConsumer';

describe('createQueueWithBatchConsumer', () => {
  beforeEach(() => jest.resetAllMocks());
  it('should invoke the consumer after time threshold exceeded', async () => {
    const mockedConsumer = jest.fn();
    const queue = createQueueWithBatchConsumer<string>({
      threshold: { milliseconds: 100, size: 5 },
      consumer: mockedConsumer,
    });

    // add to queue
    queue.push('a');

    // prove not invoked yet
    expect(mockedConsumer).not.toHaveBeenCalled();

    // add to queue again
    queue.push(['b', 'c', 'd']);

    // prove not invoked yet
    expect(mockedConsumer).not.toHaveBeenCalled();

    // wait 100ms
    await sleep(110);

    // prove invoked
    expect(mockedConsumer).toHaveBeenCalled();
    expect(mockedConsumer).toHaveBeenCalledTimes(1);
    expect(mockedConsumer).toHaveBeenCalledWith({
      items: ['a', 'b', 'c', 'd'],
    });

    // prove not invoked again redundantly, if 3 more items added, for a total historical add of 7
    queue.push(['e', 'f', 'g']);
    expect(mockedConsumer).toHaveBeenCalledTimes(1); // still only 1 call

    // wait 100ms more
    await sleep(110);

    // prove invoked again
    expect(mockedConsumer).toHaveBeenCalled();
    expect(mockedConsumer).toHaveBeenCalledTimes(2);
    expect(mockedConsumer).toHaveBeenCalledWith({
      items: ['e', 'f', 'g'],
    });
  });
  it('should invoke the consumer after size threshold exceeded', async () => {
    const mockedConsumer = jest.fn();
    const queue = createQueueWithBatchConsumer<string>({
      threshold: { milliseconds: 100, size: 5 },
      consumer: mockedConsumer,
    });

    // add to queue
    queue.push(['a', 'b', 'c', 'd']);

    // prove not invoked yet
    expect(mockedConsumer).not.toHaveBeenCalled();

    // add to queue again
    queue.push('e');

    // prove invoked now
    expect(mockedConsumer).toHaveBeenCalled();
    expect(mockedConsumer).toHaveBeenCalledTimes(1);
    expect(mockedConsumer).toHaveBeenCalledWith({
      items: ['a', 'b', 'c', 'd', 'e'],
    });

    // wait 100ms
    await sleep(110);

    // prove not invoked again redundantly
    expect(mockedConsumer).toHaveBeenCalledTimes(1);
  });
});
