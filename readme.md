# simple-in-memory-queue

easily create and consume in-memory queues, for nodejs and the browser

[![npm](https://img.shields.io/npm/v/simple-in-memory-queue.svg)](https://www.npmjs.com/package/simple-in-memory-queue)
[![ci](https://github.com/ehmpathy/simple-in-memory-queue/actions/workflows/test.yml/badge.svg)](https://github.com/ehmpathy/simple-in-memory-queue/actions/workflows/test.yml)
[![license](https://img.shields.io/npm/l/simple-in-memory-queue.svg)](https://github.com/ehmpathy/simple-in-memory-queue/blob/main/LICENSE)

# install

```sh
npm install simple-in-memory-queue
```

# use

### create a queue

```ts
import { createQueue, QueueOrder } from 'simple-in-memory-queue';

// fifo: first in, first out (default for most queues)
const queue = createQueue<string>({ order: QueueOrder.FIRST_IN_FIRST_OUT });

// lifo: last in, first out (stack behavior)
const stack = createQueue<string>({ order: QueueOrder.LAST_IN_FIRST_OUT });
```

### push, peek, and pop

```ts
queue.push('a');
queue.push(['b', 'c']);
queue.push(['d', 'e']);

// peek to view items without removal
queue.peek();             // ['a']
queue.peek(2);            // ['a', 'b']
queue.peek(queue.length); // ['a', 'b', 'c', 'd', 'e']
queue.peek(2, queue.length); // ['c', 'd', 'e'] — slice from index 2 to end

// pop to remove and return items
queue.pop();              // ['a']
queue.pop();              // ['b']
queue.pop(2);             // ['c', 'd']
```

### listen to events

```ts
queue.on.push.subscribe({ consumer: ({ items }) => console.log(items) });
queue.on.peek.subscribe({ consumer: ({ items }) => console.log(items) });
queue.on.pop.subscribe({ consumer: ({ items }) => console.log(items) });
```

# use with consumers

common queue consumption patterns, ready to use

### debounce consumer

waits for activity to stop before consumption. the consumer is called after `gap.milliseconds` of silence.

usecases
- wait for user to stop scroll, type, or resize before response
- collapse rapid events into one

```ts
import { createQueueWithDebounceConsumer } from 'simple-in-memory-queue';

const queue = createQueueWithDebounceConsumer<string>({
  gap: { milliseconds: 100 },
  consumer: ({ items }) => console.log(items),
});
```

### batch consumer

collects items and flushes them in batches. the consumer is called when either:
- the oldest item has waited `threshold.milliseconds`
- the queue has `threshold.size` items

usecases
- batch events before send to analytics
- collect writes before flush to database

```ts
import { createQueueWithBatchConsumer } from 'simple-in-memory-queue';

const queue = createQueueWithBatchConsumer<string>({
  threshold: { milliseconds: 100, size: 5 },
  consumer: ({ items }) => console.log(items),
});
```

### resilient remote consumer

processes items one at a time with automatic retry and failure recovery.

features
- **immediate**: calls consumer as soon as an item is available
- **retry**: retries failed items up to `threshold.retry` times, with `delay.retry` between attempts
- **discard**: drops items that exceed the retry threshold, calls `on.failurePermanent`
- **pause**: stops consumption when `threshold.pause` items fail in a row, calls `on.pause`
- **non-block**: processes other items while failed items wait for retry

usecases
- send requests to remote apis with automatic retry
- deliver webhooks with failure recovery

```ts
import { createQueueWithResilientRemoteConsumer } from 'simple-in-memory-queue';

const queue = createQueueWithResilientRemoteConsumer<string>({
  consumer: async ({ item }) => console.log(item),
  threshold: {
    concurrency: 1,
    retry: 3,
    pause: 5,
  },
  delay: {
    retry: 100,
    visibility: 500, // optional: wait before first attempt
  },
  on: {
    failureAttempt: ({ item, attempt, error }) => {
      console.log(`attempt ${attempt} failed`, item, error);
    },
    failurePermanent: ({ item, error }) => {
      console.error('permanently failed', item, error);
    },
    pause: ({ failures }) => {
      console.error('queue paused', failures);
    },
  },
});
```

# api

## Queue\<T\>

| method | description |
|--------|-------------|
| `push(item \| items[])` | add one or more items |
| `peek(n?)` | view top n items without removal (default: 1) |
| `peek(start, end)` | view items from start to end index |
| `pop(n?)` | remove and return top n items (default: 1) |
| `pop(start, end)` | remove items from start to end index |
| `length` | current number of items |
| `on.push` | event stream for push events |
| `on.peek` | event stream for peek events |
| `on.pop` | event stream for pop events |

## QueueOrder

| value | description |
|-------|-------------|
| `FIRST_IN_FIRST_OUT` | oldest items first (fifo) |
| `LAST_IN_FIRST_OUT` | newest items first (lifo) |

## createQueueWithDebounceConsumer

| parameter | description |
|-----------|-------------|
| `gap.milliseconds` | time to wait after last push before consume |
| `consumer` | `({ items }) => void` called with all queued items |

## createQueueWithBatchConsumer

| parameter | description |
|-----------|-------------|
| `threshold.milliseconds` | max time an item can wait before flush |
| `threshold.size` | max items before flush |
| `consumer` | `({ items }) => void` called with batch |

## createQueueWithResilientRemoteConsumer

| parameter | description |
|-----------|-------------|
| `threshold.concurrency` | max parallel consumers (currently: 1) |
| `threshold.retry` | max retry attempts per item |
| `threshold.pause` | sequential failures before pause |
| `delay.retry` | milliseconds between retry attempts |
| `delay.visibility` | milliseconds before first attempt (optional) |
| `consumer` | `({ item }) => Promise<void>` called per item |
| `on.failureAttempt` | `({ item, attempt, error }) => void` on retry |
| `on.failurePermanent` | `({ item, error }) => void` when discarded |
| `on.pause` | `({ failures }) => void` when paused |
