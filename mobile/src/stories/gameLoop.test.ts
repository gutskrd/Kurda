import { describe, expect, it } from 'vitest';
import type { StoryGameView } from '@kurda/shared';
import type { ApiResult } from '../api/types';
import { StoryGameLoop, type LoopFailure } from './gameLoop';

const T0 = Date.parse('2026-10-13T10:00:00Z');

function view(over: Partial<StoryGameView> = {}): StoryGameView {
  return {
    id: 'g1',
    mode: 'duo',
    status: 'lobby',
    version: 1,
    serverNow: new Date(T0).toISOString(),
    phaseEndsAt: null,
    ...over,
  } as StoryGameView;
}

type Reply = ApiResult<StoryGameView | Record<string, never>>;

function harness() {
  const asked: Array<number | undefined> = [];
  const pending: Array<(r: Reply) => void> = [];
  const timers: Array<{ fn: () => void; ms: number; done: boolean }> = [];
  const views: StoryGameView[] = [];
  const failures: LoopFailure[] = [];
  let clock = T0;
  const loop = new StoryGameLoop({
    fetch: (since) => {
      asked.push(since);
      return new Promise((r) => pending.push(r));
    },
    onView: (v) => views.push(v),
    onFailure: (f) => failures.push(f),
    setTimer: (fn, ms) => {
      const t = { fn, ms, done: false };
      timers.push(t);
      return t;
    },
    clearTimer: (h) => {
      (h as { done: boolean }).done = true;
    },
    now: () => clock,
  });
  const reply = async (r: Reply) => {
    pending.shift()!(r);
    await new Promise((res) => setTimeout(res, 0));
  };
  const live = () => timers.filter((t) => !t.done);
  const fire = async () => {
    const t = live()[0]!;
    t.done = true;
    t.fn();
    await new Promise((res) => setTimeout(res, 0));
  };
  return { loop, asked, views, failures, reply, live, fire, pending, tick: (ms: number) => (clock += ms) };
}

const ok = (data: StoryGameView | Record<string, never>): Reply => ({ ok: true, data });

describe('StoryGameLoop', () => {
  it('asks, shows, and asks again with the new version — one request at a time', async () => {
    const h = harness();
    h.loop.start();
    expect(h.asked).toEqual([undefined]);
    await h.reply(ok(view({ version: 1 })));
    expect(h.asked).toEqual([undefined, 1]);
    await h.reply(ok(view({ version: 4, status: 'reading' })));
    expect(h.views.map((v) => v.version)).toEqual([1, 4]);
    expect(h.asked).toEqual([undefined, 1, 4]);
    expect(h.pending).toHaveLength(1);
  });

  it('keeps an action’s newer view and drops an older poll that lands after it', async () => {
    const h = harness();
    h.loop.start(view({ version: 2 }));
    h.loop.accept(view({ version: 5, status: 'question' }));
    await h.reply(ok(view({ version: 3 })));
    expect(h.views.map((v) => v.version)).toEqual([2, 5]);
    expect(h.loop.current?.version).toBe(5);
  });

  it('backs off 1 s, 2 s, 5 s after failures and shows an error only after the first blip', async () => {
    const h = harness();
    h.loop.start(view());
    const down: Reply = { ok: false, error: { kind: 'network', message: 'offline' } };
    await h.reply(down);
    expect(h.live()[0]!.ms).toBe(1_000);
    expect(h.failures).toEqual([]);
    await h.fire();
    await h.reply(down);
    expect(h.live()[0]!.ms).toBe(2_000);
    expect(h.failures).toHaveLength(1);
    await h.fire();
    await h.reply(down);
    await h.fire();
    await h.reply(down);
    expect(h.live()[0]!.ms).toBe(5_000);
  });

  it('stops for good on a 404 (not a member, removed, or no such game)', async () => {
    const h = harness();
    h.loop.start();
    await h.reply({ ok: false, error: { kind: 'client', status: 404, code: 'GAME_NOT_FOUND', message: 'no' } });
    expect(h.failures).toEqual([{ kind: 'not-found' }]);
    expect(h.pending).toHaveLength(0);
    expect(h.live()).toHaveLength(0);
  });

  it('asks again shortly when the server stopped waiting without a view', async () => {
    const h = harness();
    h.loop.start(view());
    await h.reply(ok({}));
    expect(h.live()).toHaveLength(1);
    await h.fire();
    expect(h.asked.at(-1)).toBe(1);
  });

  it('stops asking once the game is finished, until something says it changed', async () => {
    const h = harness();
    h.loop.start(view({ status: 'reveal', version: 8 }));
    await h.reply(ok(view({ status: 'finished', version: 9 })));
    expect(h.pending).toHaveLength(0);
    h.loop.refresh();
    expect(h.asked.at(-1)).toBeUndefined();
    await h.reply(ok(view({ status: 'finished', version: 10, nextGameId: 'next' })));
    expect(h.views.at(-1)!.nextGameId).toBe('next');
    expect(h.pending).toHaveLength(0);
  });

  it('never long-polls a solo game; a timed solo question asks once just after its deadline', async () => {
    const h = harness();
    const endsAt = new Date(T0 + 30_000).toISOString();
    h.loop.start(view({ mode: 'solo', status: 'question', phaseEndsAt: endsAt }));
    expect(h.asked).toEqual([]);
    expect(h.live()).toHaveLength(1);
    expect(h.live()[0]!.ms).toBe(30_000 + 1_500 + 250);
    await h.fire();
    expect(h.asked).toEqual([undefined]);
    await h.reply(ok(view({ mode: 'solo', status: 'reveal', version: 2 })));
    expect(h.pending).toHaveLength(0);
    expect(h.live()).toHaveLength(0);
  });

  it('corrects a phone clock that is off from the server’s', () => {
    const h = harness();
    h.tick(-5_000); // the phone runs five seconds slow
    h.loop.start(view({ mode: 'solo', status: 'reveal' }));
    expect(h.loop.serverNow()).toBe(T0);
  });

  it('asks nothing in the background and fetches at once in front', async () => {
    const h = harness();
    h.loop.start(view());
    h.loop.pause();
    await h.reply(ok(view({ version: 2 })));
    expect(h.views).toHaveLength(1); // dropped while paused
    h.loop.resume();
    expect(h.pending).toHaveLength(1);
  });
});
