import { UnexpectedCodePathError } from '../../utils/errors/UnexpectedCodePathError';
import { sleep } from '../../utils/sleep';
import { createQueueWithResilientRemoteConsumer } from './createQueueWithResilientRemoteConsumer';

const waitUntil = async (
  check: () => boolean,
  options: {
    debugName?: string;
    timeoutMilliseconds: number;
    granularityMilliseconds: number;
  } = {
    timeoutMilliseconds: 3_000,
    granularityMilliseconds: 90,
  },
) => {
  const beganCheckingAtMse = new Date().getTime();
  while (true) {
    const hasTimeoutExpired =
      beganCheckingAtMse + options.timeoutMilliseconds < new Date().getTime();
    if (hasTimeoutExpired)
      throw new UnexpectedCodePathError('timeout expired', {
        debugName: options.debugName,
      });
    if (check()) return;
    await sleep(options.granularityMilliseconds);
  }
};

// TODO: unskip once we figure out why the setTimeout is so flakey. Do we need to just start promises instead?
describe.skip('createQueueWithResilientRemoteConsumer', () => {
  beforeEach(() => jest.resetAllMocks());
  it('should invoke the consumer as soon as an item is added to the queue', async () => {
    const mockedConsumer = jest.fn();
    const queue = createQueueWithResilientRemoteConsumer<string>({
      consumer: mockedConsumer,
      threshold: {
        concurrency: 1,
        retry: 3,
        pause: 5,
      },
      delay: {
        retry: 100,
      },
    });

    // add to queue
    queue.push('a');

    // prove the consumer was immediately called on the item
    expect(mockedConsumer).toHaveBeenCalled();
    expect(mockedConsumer).toHaveBeenCalledTimes(1);
    expect(mockedConsumer).toHaveBeenCalledWith({ item: 'a' });

    // wait some time
    await sleep(150);

    // ensure the consumer was not called again (due to some sort of internal loop)
    expect(mockedConsumer).toHaveBeenCalledTimes(1);
  });
  it('should retry the consumer up to the retry threshold until marking it as a permanent failure', async () => {
    const mockedConsumer = jest.fn();
    mockedConsumer.mockRejectedValue(new Error('__EXAMPLE_ERROR__'));
    const mockedOnFailureAttempt = jest.fn();
    const mockedOnFailurePermanent = jest.fn();

    const queue = createQueueWithResilientRemoteConsumer<string>({
      consumer: mockedConsumer,
      threshold: {
        concurrency: 1,
        retry: 3,
        pause: 5,
      },
      delay: {
        retry: 100,
      },
      on: {
        failureAttempt: mockedOnFailureAttempt,
        failurePermanent: mockedOnFailurePermanent,
      },
    });

    // add to queue
    queue.push('a');

    // prove the consumer was immediately called on the item
    expect(mockedConsumer).toHaveBeenCalled();
    expect(mockedConsumer).toHaveBeenCalledTimes(1);
    expect(mockedConsumer).toHaveBeenCalledWith({ item: 'a' });

    // prove that the failure attempt notification was emitted - but not the permanent failure one
    await waitUntil(() => mockedOnFailureAttempt.mock.calls.length === 1); // wait until failure was reported
    expect(mockedOnFailureAttempt).toHaveBeenCalledTimes(1);
    expect(mockedOnFailureAttempt).toHaveBeenLastCalledWith({
      item: 'a',
      error: expect.any(Error),
      attempt: 1,
    });
    expect(mockedOnFailurePermanent).toHaveBeenCalledTimes(0);

    // prove that after the delay, the consumer was called again with that same item, and again notified of failure
    await waitUntil(() => mockedOnFailureAttempt.mock.calls.length === 2); // wait until failure was reported again
    expect(mockedConsumer).toHaveBeenCalledTimes(2);
    expect(mockedConsumer).toHaveBeenLastCalledWith({ item: 'a' });
    expect(mockedOnFailureAttempt).toHaveBeenCalledTimes(2);
    expect(mockedOnFailureAttempt).toHaveBeenLastCalledWith({
      item: 'a',
      error: expect.any(Error),
      attempt: 2,
    });
    expect(mockedOnFailurePermanent).toHaveBeenCalledTimes(0);

    // prove that after the delay, the consumer was called again with that same item another time
    await waitUntil(() => mockedOnFailureAttempt.mock.calls.length === 3); // wait until failure was reported again
    expect(mockedConsumer).toHaveBeenCalledTimes(3);
    expect(mockedConsumer).toHaveBeenLastCalledWith({ item: 'a' });
    expect(mockedOnFailureAttempt).toHaveBeenCalledTimes(3);
    expect(mockedOnFailureAttempt).toHaveBeenLastCalledWith({
      item: 'a',
      error: expect.any(Error),
      attempt: 3,
    });
    await waitUntil(() => mockedOnFailurePermanent.mock.calls.length === 1); // wait until permanent failure was reported
    expect(mockedOnFailurePermanent).toHaveBeenCalledTimes(1);
    expect(mockedOnFailurePermanent).toHaveBeenLastCalledWith({
      item: 'a',
      error: expect.any(Error),
    });

    // prove that now since the retry threshold has been passed, the consumer is no longer called on the item
    await sleep(110);
    expect(mockedConsumer).toHaveBeenCalledTimes(3); // still 3

    // prove it again after waiting some more, too
    await sleep(110);
    expect(mockedConsumer).toHaveBeenCalledTimes(3); // still 3
  });

  // TODO: make this test not flakey... right now, the setTimeout is making this pretty flakey
  it.skip('should not pause the processing of other items while a retryable item is delayed', async () => {
    const mockedConsumer = jest.fn();
    mockedConsumer.mockImplementation(({ item }) => {
      if (item === 'a') throw new Error('__EXAMPLE_ERROR__'); // fail on a, but not the others
      return;
    });
    const mockedOnFailureAttempt = jest.fn();
    const queue = createQueueWithResilientRemoteConsumer<string>({
      consumer: mockedConsumer,
      threshold: {
        concurrency: 1,
        retry: 3,
        pause: 5,
      },
      delay: {
        retry: 100,
      },
      on: {
        failureAttempt: mockedOnFailureAttempt,
      },
    });

    // add to queue
    queue.push(['a', 'b', 'c']);

    // prove that each of the items was called in order, with no blocking
    console.log('log to progress timers'); // for some reason, the following never resolves in jest w/o a log here 🙃
    await waitUntil(() => mockedConsumer.mock.calls.length === 3); // wait until item was attempted again
    expect(mockedConsumer).toHaveBeenCalledTimes(3);
    expect(mockedConsumer).toHaveBeenNthCalledWith(1, { item: 'a' });
    expect(mockedConsumer).toHaveBeenNthCalledWith(2, { item: 'b' });
    expect(mockedConsumer).toHaveBeenNthCalledWith(3, { item: 'c' });

    // prove that the delayed item was eventually attempted again
    await waitUntil(() => mockedConsumer.mock.calls.length === 4); // wait until item was attempted again
    expect(mockedConsumer).toHaveBeenCalledTimes(4);
    expect(mockedConsumer).toHaveBeenLastCalledWith({ item: 'a' });
    expect(mockedOnFailureAttempt).toHaveBeenCalledTimes(2);
    expect(mockedOnFailureAttempt).toHaveBeenLastCalledWith({
      item: 'a',
      error: expect.any(Error),
      attempt: 2,
    });
  });
  it('should pause the consumption of items after the pause threshold is crossed', async () => {
    const mockedConsumer = jest.fn();
    mockedConsumer.mockRejectedValue(new Error('__EXAMPLE_ERROR__'));
    const mockedOnFailureAttempt = jest.fn();
    const mockedOnFailurePermanent = jest.fn();
    const mockedOnPause = jest.fn();

    const queue = createQueueWithResilientRemoteConsumer<string>({
      consumer: mockedConsumer,
      threshold: {
        concurrency: 1,
        retry: 3,
        pause: 5,
      },
      delay: {
        retry: 100,
      },
      on: {
        failureAttempt: mockedOnFailureAttempt,
        failurePermanent: mockedOnFailurePermanent,
        pause: mockedOnPause,
      },
    });

    // add to queue
    queue.push(['a', 'b', 'c', 'd', 'e', 'f']);

    // wait until the onPause hook has been called
    await waitUntil(() => mockedOnPause.mock.calls.length === 1);

    // now check that the consumer was only called 5 times, since each call would have failed
    expect(mockedConsumer).toHaveBeenCalled();
    expect(mockedConsumer).toHaveBeenCalledTimes(5);

    // prove that it tried consuming each of the first 5 items
    expect(mockedConsumer).toHaveBeenCalledWith({ item: 'a' });
    expect(mockedConsumer).toHaveBeenCalledWith({ item: 'b' });
    expect(mockedConsumer).toHaveBeenCalledWith({ item: 'c' });
    expect(mockedConsumer).toHaveBeenCalledWith({ item: 'd' });
    expect(mockedConsumer).toHaveBeenCalledWith({ item: 'e' });

    // prove that it never tried consuming the 6th item
    expect(mockedConsumer).not.toHaveBeenCalledWith({ item: 'f' });
  });
});
