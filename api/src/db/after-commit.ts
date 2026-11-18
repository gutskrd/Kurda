/**
 * Work that may run only once a transaction has committed, such as telling other modules about a rated game: a
 * listener reading before the commit would not see it, and a rollback would leave it acting on nothing. Code
 * inside the transaction queues work against its client; the owner of the transaction runs the queue after COMMIT
 * and drops it on ROLLBACK. Pooled clients are reused, so an owner also clears the queue when it begins.
 */
const queues = new WeakMap<object, Array<() => void>>();

/** Run `fn` after the transaction on `client` commits (never if it rolls back). */
export function afterCommit(client: object, fn: () => void): void {
  const queue = queues.get(client);
  if (queue) queue.push(fn);
  else queues.set(client, [fn]);
}

/** After COMMIT: runs what was queued, each on its own so one failure never stops the rest. */
export function runAfterCommit(client: object): void {
  const queue = queues.get(client);
  queues.delete(client);
  for (const fn of queue ?? []) {
    try {
      fn();
    } catch {
      // after the commit nothing can be undone: a failing listener is its own problem
    }
  }
}

/** After ROLLBACK, or before BEGIN: forgets what was queued. */
export function dropAfterCommit(client: object): void {
  queues.delete(client);
}
