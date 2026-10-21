import { describe, expect, it } from 'vitest';
import { batchControl, runBatch, type BatchOutcome } from './batch';

/** Work that waits to be told how each item ends, recording what is in hand at once. */
function heldWork() {
  const waiting = new Map<number, { ok: () => void; fail: (e: unknown) => void }>();
  let inHand = 0;
  let most = 0;
  const started: number[] = [];
  const work = (item: number, signal: AbortSignal): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      started.push(item);
      inHand += 1;
      most = Math.max(most, inHand);
      const done = (): void => {
        inHand -= 1;
        waiting.delete(item);
      };
      waiting.set(item, {
        ok: () => {
          done();
          resolve();
        },
        fail: (e) => {
          done();
          reject(e);
        },
      });
      signal.addEventListener('abort', () => {
        done();
        reject(new DOMException('stopped', 'AbortError'));
      });
    });
  return { work, waiting, started, most: () => most };
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('working through a list', () => {
  it('runs two at a time, in order, and a failure is that item’s outcome, not the end of the run', async () => {
    const held = heldWork();
    const outcomes: BatchOutcome<number>[] = [];
    const control = batchControl();
    const run = runBatch([1, 2, 3, 4, 5], held.work, { control, concurrency: 2, onOutcome: (o) => outcomes.push(o) });
    await tick();
    expect(held.started).toEqual([1, 2]);
    held.waiting.get(2)!.fail(new Error('the server fell over'));
    await tick();
    expect(held.started).toEqual([1, 2, 3]);
    // then let whatever is in hand finish, until the list is done
    while (held.waiting.size > 0) {
      for (const w of [...held.waiting.values()]) w.ok();
      await tick();
    }
    await run;
    expect(held.started).toEqual([1, 2, 3, 4, 5]);
    expect(held.most()).toBe(2);
    expect(outcomes.filter((o) => o.ok).map((o) => o.item).sort()).toEqual([1, 3, 4, 5]);
    expect(outcomes.find((o) => !o.ok)).toMatchObject({ item: 2, error: new Error('the server fell over') });
  });

  it('starts nothing new while paused, and carries on when resumed', async () => {
    const held = heldWork();
    const control = batchControl();
    const run = runBatch([1, 2, 3, 4], held.work, { control });
    await tick();
    control.pause();
    held.waiting.get(1)!.ok();
    held.waiting.get(2)!.ok();
    await tick();
    await tick();
    // the two in hand finished; nothing else began
    expect(held.started).toEqual([1, 2]);
    control.resume();
    await tick();
    expect(held.started).toEqual([1, 2, 3, 4]);
    held.waiting.get(3)!.ok();
    held.waiting.get(4)!.ok();
    await run;
  });

  it('stops on cancel: what it was downloading is let go, and the rest is left as it was', async () => {
    const held = heldWork();
    const outcomes: BatchOutcome<number>[] = [];
    const control = batchControl();
    const run = runBatch([1, 2, 3, 4], held.work, { control, onOutcome: (o) => outcomes.push(o) });
    await tick();
    held.waiting.get(1)!.ok();
    await tick();
    control.cancel();
    await run;
    expect(held.started).toEqual([1, 2, 3]);
    // 2 and 3 were stopped, not failed; 4 was never started
    expect(outcomes).toEqual([{ item: 1, ok: true }]);
    expect(control.signal.aborted).toBe(true);
  });

  it('ends a paused run once the last item in hand is done', async () => {
    const held = heldWork();
    const control = batchControl();
    let ended = false;
    const run = runBatch([1, 2], held.work, { control }).then(() => (ended = true));
    await tick();
    control.pause();
    held.waiting.get(1)!.ok();
    held.waiting.get(2)!.ok();
    await run;
    expect(ended).toBe(true);
    expect(control.paused).toBe(true);
  });

  it('cancels a paused run too', async () => {
    const held = heldWork();
    const control = batchControl();
    const run = runBatch([1, 2, 3], held.work, { control, concurrency: 1 });
    await tick();
    control.pause();
    held.waiting.get(1)!.ok();
    await tick();
    control.cancel();
    await run;
    expect(held.started).toEqual([1]);
  });
});
