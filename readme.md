# simple-in-memory-queue

easily create and consume in-memory queues

# install

```
npm install --save simple-in-memory-queue
```

# use

this library makes it easy to create and use a queue reliably in memory

### create a queue

```ts
const queue = createQueue({
  order: QueueOrder.FIRST_IN_FIRST_OUT
});
```

### push, peek, and pop

```ts
queue.push('a');
queue.push(['b', 'c']);
queue.push(['d', 'e']);

// peek, to view items in the queue without dequeueing them
queue.peek() // ['a']
queue.peek(2) // ['a', 'b']
queue.peek(queue.length) // ['a', 'b', 'c', 'd', 'e]
queue.peek(2, queue.length) // ['c', 'd', 'e]

// pop, to get and dequeue items from the queue
queue.pop() // ['a']
queue.pop() // ['b']
queue.pop(2) // ['c', 'd']
```

### listen to events

```ts
queue.on.push.subscribe(({ item }) => console.log(item))
queue.on.peek.subscribe(({ item }) => console.log(item))
queue.on.pop.subscribe(({ item }) => console.log(item))
```

# use with consumers

this library makes it easy to implement common patterns of consuming from queues

### debounce consumer

create a queue with a consumer which gets called as soon as
- the gap between subsequent events is more than `gap.milliseconds`

usecases
- consuming sequences of user input

```ts
const queue = createQueueWithDebounceConsumer<string>({
  gap: { milliseconds: 100 },
  consumer: ({ items }) => console.log(items),
});
```

### batch consumer

create a queue with a consumer which gets called when either
- an item in the queue older than `threshold.milliseconds` milliseconds
- the number of the items in the queue exceeds a size of `threshold.size`

usecases
- consuming queued items in bulk, balancing consumption speed and invocation count

```ts
const queue = createQueueWithBatchConsumer<string>({
  threshold: { milliseconds: 100, size: 5 },
  consumer: ({ items }) => console.log(items),
});
```


### resilient remote consumer

create a queue with a consumer which
- gets called as soon as an item is available, with one item at a time, under a max concurrency specified by `threshold.concurrency`
- resiliently handles failures
  - retries errors from the consumer up to `threshold.retry` times, with a `delay.retry` delay between retries
  - dequeues items that failed more than the `threshold.retry` times
- intelligently handles failures
  - consumes non-delayed items while there are items delayed due to retry
  - pauses consumption of items from the queue when the number of failures in a row exceeds `threshold.pause` times

usecases
- resiliently sending requests to remote apis

```ts
const queue = createQueueWithResilientRemoteConsumer<string>({
  consumer: ({ item }) => console.log(item),
  threshold: {
    concurrency: 1,
    retry: 3,
    pause: 5,
  },
  delay: {
    retry: 100,
  },
});
```
