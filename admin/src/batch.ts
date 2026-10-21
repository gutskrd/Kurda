/**
 * Working through a long list a few items at a time, as the Characters page
 * does over every recording: with pause, resume and cancel, and an outcome
 * for each item, so one that fails is set aside and the rest go on.
 *
 * Pausing lets the items already started finish and starts no more until
 * resumed. Cancelling starts no more either, and aborts what the work passed
 * the signal to (a download); an item stopped that way is neither done nor
 * failed, only not done.
 */

export interface BatchControl {
  readonly paused: boolean;
  readonly cancelled: boolean;
  /** aborted on cancel */
  readonly signal: AbortSignal;
  pause(): void;
  resume(): void;
  cancel(): void;
  /** resolves at once unless paused; then when resumed or cancelled */
  wait(): Promise<void>;
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
  };
}

export type BatchOutcome<T> = { item: T; ok: true } | { item: T; ok: false; error: unknown };

/**
 * Run `work` over `items`, at most `concurrency` at once, in order. Resolves
 * when every item has an outcome, or once cancelled and the items in hand are
 * finished. Never rejects: a failure is an item's outcome.
 */
export async function runBatch<T>(
  items: readonly T[],
  work: (item: T, signal: AbortSignal) => Promise<void>,
  { control, concurrency = 2, onOutcome }: { control: BatchControl; concurrency?: number; onOutcome?: (outcome: BatchOutcome<T>) => void },
): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      // a pause with nothing left to start is the end, not a wait
      if (next >= items.length) return;
      await control.wait();
      if (control.cancelled || next >= items.length) return;
      const item = items[next++]!;
      try {
        await work(item, control.signal);
        onOutcome?.({ item, ok: true });
      } catch (error) {
        // stopped by the cancel, not by a fault of its own
        if (control.cancelled && control.signal.aborted && isAbort(error)) return;
        onOutcome?.({ item, ok: false, error });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker));
}

function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}
