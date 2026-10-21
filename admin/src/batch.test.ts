import { describe, expect, it } from 'vitest';
import { batchControl, chainSources, listSource, pagedSource, runBatch, type BatchOutcome } from './batch';

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

class SlowDown extends Error {
  constructor(readonly ms: number) {
    super('slow down');
  }
}
const slowDown = (e: unknown): number | null => (e instanceof SlowDown ? e.ms : null);

describe('items read a page at a time', () => {
  it('asks for each page only when the last is used up, sharing one request between the workers', async () => {
    const asked: Array<string | null> = [];
    const pages: Record<string, { items: number[]; nextCursor: string | null }> = {
      first: { items: [1, 2, 3], nextCursor: 'b' },
      b: { items: [4, 5], nextCursor: null },
    };
    const source = pagedSource(async (cursor) => {
      asked.push(cursor);
      await tick();
      return pages[cursor ?? 'first']!;
    });
    const done: number[] = [];
    await runBatch(chainSources(listSource([0]), source), async (n) => void done.push(n), { control: batchControl() });
    expect(done.sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(asked).toEqual([null, 'b']);
  });

  it('asks again from the same cursor after a page the server asked to wait for', async () => {
    const asked: Array<string | null> = [];
    let refuse = true;
    const source = pagedSource(async (cursor) => {
      asked.push(cursor);
      if (refuse) {
        refuse = false;
        throw new SlowDown(5);
      }
      return { items: [1, 2], nextCursor: null };
    });
    const holds: Array<number | null> = [];
    const done: number[] = [];
    await runBatch(source, async (n) => void done.push(n), { control: batchControl(), retryAfter: slowDown, onHold: (until) => holds.push(until) });
    expect(done.sort()).toEqual([1, 2]);
    expect(asked).toEqual([null, null]);
    expect(holds.at(-1)).toBeNull();
  });

  it('ends with what it has when the list cannot be read on, and says why once', async () => {
    const source = pagedSource<number>(async (cursor) => {
      if (cursor) throw new Error('the list fell over');
      return { items: [1], nextCursor: 'b' };
    });
    const problems: unknown[] = [];
    const done: number[] = [];
    await runBatch(source, async (n) => void done.push(n), { control: batchControl(), onSourceError: (e) => problems.push(e) });
    expect(done).toEqual([1]);
    expect(problems).toEqual([new Error('the list fell over')]);
  });
});

describe('when the server asks to slow down', () => {
  it('holds the whole run as long as it asked, then tries the same item again rather than failing it', async () => {
    let refusals = 2;
    const outcomes: BatchOutcome<number>[] = [];
    const holds: Array<number | null> = [];
    const started: number[] = [];
    const at = Date.now();
    await runBatch(
      [1, 2, 3, 4],
      async (n) => {
        started.push(n);
        if (n === 2 && refusals-- > 0) throw new SlowDown(30);
      },
      { control: batchControl(), retryAfter: slowDown, onHold: (until) => holds.push(until), onOutcome: (o) => outcomes.push(o) },
    );
    expect(outcomes.every((o) => o.ok)).toBe(true);
    expect(outcomes.map((o) => o.item).sort()).toEqual([1, 2, 3, 4]);
    // item 2 was tried three times, after two waits of the length asked for
    expect(started.filter((n) => n === 2)).toHaveLength(3);
    expect(Date.now() - at).toBeGreaterThanOrEqual(55);
    expect(holds[0]).toBeGreaterThanOrEqual(at + 30);
    expect(holds.at(-1)).toBeNull();
  });

  it('stays paused after the wait when the editor paused during it, and stops at once on cancel', async () => {
    const control = batchControl();
    let tries = 0;
    let held = false;
    const run = runBatch(
      [1, 2],
      async () => {
        tries += 1;
        if (tries === 1) throw new SlowDown(20);
      },
      { control, concurrency: 1, retryAfter: slowDown, onHold: (until) => (held = until !== null) },
    );
    await tick();
    expect(held).toBe(true);
    control.pause();
    await new Promise((r) => setTimeout(r, 40));
    expect(held).toBe(false);
    expect(tries).toBe(1);
    control.cancel();
    await run;
    expect(tries).toBe(1);
  });
});
