/**
 * Working through a long list a few items at a time (the Characters page's jobs), with pause, resume and cancel and an
 * outcome per item, so a failure is set aside and the rest go on. Pausing lets started items finish; cancelling also
 * aborts their signal, and an item stopped that way is only not done. Items come from a list or from pages read as
 * the run reaches them (`pagedSource`). When the server asks to slow down (`retryAfter`), the whole run waits and the
 * item is tried again, since a busy server is no fault of the item.
 */

export interface BatchControl {
  readonly paused: boolean;
  readonly cancelled: boolean;
  /** Aborted on cancel. */
  readonly signal: AbortSignal;
  pause(): void;
  resume(): void;
  cancel(): void;
  /** Resolves at once unless paused; then when resumed or cancelled. */
  wait(): Promise<void>;
  /** Resolves after `ms`, or at once on cancel. */
  sleep(ms: number): Promise<void>;
}

export function batchControl(): BatchControl {
  let paused = false;
  let cancelled = false;
  let gate: Promise<void> | null = null;
  let open: (() => void) | null = null;
  const abort = new AbortController();
  const resume = (): void => {
    if (!paused) return;
    paused = false;
    open?.();
    gate = null;
    open = null;
  };
  return {
    get paused() {
      return paused;
    },
    get cancelled() {
      return cancelled;
    },
    signal: abort.signal,
    pause() {
      if (paused || cancelled) return;
      paused = true;
      gate = new Promise((resolve) => (open = resolve));
    },
    resume,
    cancel() {
      if (cancelled) return;
      cancelled = true;
      abort.abort();
      resume();
    },
    wait: () => gate ?? Promise.resolve(),
    sleep: (ms) =>
      new Promise<void>((resolve) => {
        if (abort.signal.aborted) return resolve();
        const done = (): void => {
          clearTimeout(timer);
          abort.signal.removeEventListener('abort', done);
          resolve();
        };
        const timer = setTimeout(done, ms);
        abort.signal.addEventListener('abort', done);
      }),
  };
}

/** Where a run's items come from. */
export interface BatchSource<T> {
  /** The next item, or null when there are no more; asked again after it throws, it carries on where it was. */
  next(): Promise<T | null>;
  /** Known to have nothing left, without asking. */
  done(): boolean;
}

export function listSource<T>(items: readonly T[]): BatchSource<T> {
  let at = 0;
  return {
    next: async () => (at < items.length ? items[at++]! : null),
    done: () => at >= items.length,
  };
}

/** One source after another. */
export function chainSources<T>(...sources: BatchSource<T>[]): BatchSource<T> {
  return {
    async next() {
      for (const source of sources) {
        const item = await source.next();
        if (item !== null) return item;
      }
      return null;
    },
    done: () => sources.every((s) => s.done()),
  };
}

/**
 * Items read a page at a time, the next asked for when the last is used up. Workers asking at once share one request,
 * and a failed request is retried from the same cursor on the next ask.
 */
export function pagedSource<T>(page: (cursor: string | null) => Promise<{ items: T[]; nextCursor: string | null }>): BatchSource<T> {
  const buffer: T[] = [];
  let cursor: string | null = null;
  let last = false;
  let pending: Promise<void> | null = null;
  const fill = async (): Promise<void> => {
    const got = await page(cursor);
    buffer.push(...got.items);
    cursor = got.nextCursor;
    last = got.nextCursor === null;
  };
  return {
    async next() {
      for (;;) {
        if (buffer.length > 0) return buffer.shift()!;
        if (last) return null;
        pending ??= fill().finally(() => {
          pending = null;
        });
        await pending;
      }
    },
    done: () => last && buffer.length === 0,
  };
}

export type BatchOutcome<T> = { item: T; ok: true } | { item: T; ok: false; error: unknown };

export interface BatchOptions<T> {
  control: BatchControl;
  concurrency?: number;
  onOutcome?: (outcome: BatchOutcome<T>) => void;
  /** How long the server asked to wait, in ms, when `error` is it asking to slow down; null otherwise. */
  retryAfter?: (error: unknown) => number | null;
  /** The run is waiting until this time (Date.now() ms) at the server's asking; null when it goes on. */
  onHold?: (until: number | null) => void;
  /** The source could not give its next item, for a reason other than slowing down: it is not asked again. */
  onSourceError?: (error: unknown) => void;
}

/**
 * Run `work` over the items in order, at most `concurrency` at once. Resolves when every item has an outcome, or once
 * cancelled and the items in hand are finished; never rejects.
 */
export async function runBatch<T>(
  items: readonly T[] | BatchSource<T>,
  work: (item: T, signal: AbortSignal) => Promise<void>,
  { control, concurrency = 2, onOutcome, retryAfter, onHold, onSourceError }: BatchOptions<T>,
): Promise<void> {
  const source = Array.isArray(items) ? listSource(items as readonly T[]) : (items as BatchSource<T>);
  // Items to try again after a wait the server asked for, first in line.
  const again: T[] = [];
  let ended = false;
  let resumeAt = 0;
  let holding: Promise<void> | null = null;

  const hold = (ms: number): void => {
    resumeAt = Math.max(resumeAt, Date.now() + Math.max(0, ms));
    onHold?.(resumeAt);
    if (holding) return;
    // A later request to wait moves resumeAt on, and the wait goes on with it.
    const wait = async (): Promise<void> => {
      do await control.sleep(Math.max(0, resumeAt - Date.now()));
      while (!control.cancelled && Date.now() < resumeAt);
    };
    holding = wait().then(() => {
      holding = null;
      onHold?.(null);
    });
  };
  const nothingLeft = (): boolean => again.length === 0 && (ended || source.done());

  /** The next item: one to try again first, then the source's; null when there is none to start now. */
  const take = async (): Promise<{ item: T } | null> => {
    const queued = again.shift();
    if (queued !== undefined) return { item: queued };
    try {
      const next = await source.next();
      if (next !== null) return { item: next };
      ended = true;
    } catch (error) {
      const wait = control.cancelled ? null : (retryAfter?.(error) ?? null);
      if (wait !== null) {
        hold(wait);
        return null;
      }
      if (!ended && !control.cancelled) onSourceError?.(error);
      ended = true;
    }
    return null;
  };

  const worker = async (): Promise<void> => {
    for (;;) {
      // A pause with nothing left to start is the end, not a wait.
      if (nothingLeft()) return;
      await control.wait();
      while (holding) {
        await holding;
        await control.wait();
      }
      if (control.cancelled || nothingLeft()) return;
      const got = await take();
      if (!got) continue;
      const { item } = got;
      try {
        await work(item, control.signal);
        onOutcome?.({ item, ok: true });
      } catch (error) {
        // Stopped by the cancel, not by a fault of its own.
        if (control.cancelled && control.signal.aborted && isAbort(error)) return;
        const wait = control.cancelled ? null : (retryAfter?.(error) ?? null);
        if (wait !== null) {
          again.push(item);
          hold(wait);
          continue;
        }
        onOutcome?.({ item, ok: false, error });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
}

function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}
