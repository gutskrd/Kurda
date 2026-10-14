/**
 * Work that may happen only once a transaction has committed — telling other
 * modules about a rated game, say: a listener that reads the database before
 * the commit would not see the game, and one told about a transaction that
 * then rolled back would act on something that never happened.
 *
 * Code deep inside a transaction (the rank service, called from a game's
 * finish) queues it against the client it was handed; the code that owns the
 * transaction runs the queue after COMMIT and drops it on ROLLBACK. A pooled
 * client is reused, so an owner also clears it when it begins, in case an
 * earlier owner of the same client never did.
 */
const queues = new WeakMap<object, Array<() => void>>();

/** Run `fn` after the transaction on `client` commits (never if it rolls back). */
export function afterCommit(client: object, fn: () => void): void {
  const queue = queues.get(client);
  if (queue) queue.push(fn);
  else queues.set(client, [fn]);
}

/** The transaction committed: run what was queued, each on its own (one failing never stops the rest). */
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

/** The transaction rolled back (or is about to begin): forget what was queued. */
export function dropAfterCommit(client: object): void {
  queues.delete(client);
}
