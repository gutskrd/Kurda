import { afterEach, describe, expect, it, vi } from 'vitest';
// The hooks are not used here; their language comes from the app, which this test does not start.
vi.mock('../i18n/I18nContext', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
import { onNotice } from '../theme/notice';
import { createIntents, sayNotSaved } from './optimistic';
import type { ApiError, ApiResult } from './types';

const refused: ApiError = { kind: 'network', message: 'network request failed' };

type Done = { ok: true };

/** A send whose answers the test gives one at a time, in order. */
function server() {
  const asked: { key: string; wanted: boolean; confirmed: boolean }[] = [];
  const waiting: ((r: ApiResult<Done>) => void)[] = [];
  const send = (key: string, wanted: boolean, confirmed: boolean) => {
    asked.push({ key, wanted, confirmed });
    return new Promise<ApiResult<Done>>((resolve) => waiting.push(resolve));
  };
  const answer = async (r: ApiResult<Done>) => {
    waiting.shift()!(r);
    // Lets the loop see the answer and send whatever follows it.
    await new Promise((r) => setTimeout(r, 0));
  };
  return { asked, send, answer };
}

function track(s: ReturnType<typeof server>) {
  const failed = vi.fn();
  const changed = vi.fn();
  const tracked = createIntents<string, boolean, Done>({ send: s.send, failed, changed });
  return { tracked, failed, changed };
}

const notices: string[] = [];
onNotice((text) => notices.push(text));
afterEach(() => {
  notices.length = 0;
});

describe('a change shown before the server has it', () => {
  it('shows the wanted value at once and asks the server for it', () => {
    const s = server();
    const { tracked: like } = track(s);
    like.want('p1', true, false);
    expect(like.shown('p1', false)).toBe(true);
    expect(s.asked).toEqual([{ key: 'p1', wanted: true, confirmed: false }]);
  });

  it('hands back to the screen’s own data once the server agrees', async () => {
    const s = server();
    const { tracked: like, failed } = track(s);
    like.want('p1', true, false);
    await s.answer({ ok: true, data: { ok: true } });
    // The screen's data now holds the answer, and that is what is drawn, whatever it says.
    expect(like.shown('p1', true)).toBe(true);
    expect(like.shown('p1', false)).toBe(false);
    expect(failed).not.toHaveBeenCalled();
  });

  it('goes back to what the server holds when it refuses, and says so once', async () => {
    const s = server();
    const { tracked: like, failed } = track(s);
    like.want('p1', true, false);
    await s.answer({ ok: false, error: refused });
    expect(like.shown('p1', false)).toBe(false);
    expect(like.shown('p1', true)).toBe(true);
    expect(failed).toHaveBeenCalledTimes(1);
    expect(failed).toHaveBeenCalledWith(refused, 'p1', false);
  });

  it('sends nothing for a tap that asks for what the server already holds', () => {
    const s = server();
    const { tracked: like, changed } = track(s);
    like.want('p1', false, false);
    expect(s.asked).toEqual([]);
    expect(changed).not.toHaveBeenCalled();
  });

  it('keeps each key to itself', async () => {
    const s = server();
    const { tracked: like } = track(s);
    like.want('p1', true, false);
    like.want('p2', true, false);
    expect(s.asked.map((a) => a.key)).toEqual(['p1', 'p2']);
    await s.answer({ ok: false, error: refused });
    expect(like.shown('p1', false)).toBe(false);
    expect(like.shown('p2', false)).toBe(true);
  });
});

describe('rapid taps', () => {
  it('sends one request at a time and only the last wish after it', async () => {
    const s = server();
    const { tracked: like } = track(s);
    like.want('p1', true, false);
    like.want('p1', false, false);
    like.want('p1', true, false);
    like.want('p1', false, false);
    expect(like.shown('p1', false)).toBe(false);
    expect(s.asked).toHaveLength(1);
    await s.answer({ ok: true, data: { ok: true } });
    // The server now holds "on" and the last tap wants "off": that is sent next, and only that.
    expect(s.asked).toEqual([
      { key: 'p1', wanted: true, confirmed: false },
      { key: 'p1', wanted: false, confirmed: true },
    ]);
    await s.answer({ ok: true, data: { ok: true } });
    expect(like.shown('p1', true)).toBe(true);
  });

  it('sends nothing more when the taps came back round to what the server now holds', async () => {
    const s = server();
    const { tracked: like } = track(s);
    like.want('p1', true, false);
    like.want('p1', false, false);
    like.want('p1', true, false);
    await s.answer({ ok: true, data: { ok: true } });
    expect(s.asked).toHaveLength(1);
    expect(like.shown('p1', false)).toBe(false);
  });

  it('never undoes a newer tap when an older request is refused', async () => {
    const s = server();
    const { tracked: goal, failed } = track(s);
    goal.want('p1', true, false);
    goal.want('p1', false, false);
    await s.answer({ ok: false, error: refused });
    // The refused "on" is moot: the last tap wanted "off", which is what the server still holds.
    expect(goal.shown('p1', false)).toBe(false);
    expect(goal.shown('p1', true)).toBe(true);
    expect(s.asked).toHaveLength(1);
    expect(failed).not.toHaveBeenCalled();
  });

  it('tries the newest wish after a refusal, and goes back only if that is refused too', async () => {
    const s = createIntentsOver<number>();
    s.tracked.want('goal', 20, 10);
    s.tracked.want('goal', 30, 10);
    await s.answer({ ok: false, error: refused });
    expect(s.asked).toEqual([
      { wanted: 20, confirmed: 10 },
      { wanted: 30, confirmed: 10 },
    ]);
    expect(s.tracked.shown('goal', 10)).toBe(30);
    await s.answer({ ok: false, error: refused });
    expect(s.tracked.shown('goal', 10)).toBe(10);
    expect(s.failed).toHaveBeenCalledTimes(1);
  });

  it('lets the server have the last word when it answers with its own value', async () => {
    const s = createIntentsOver<number>({ answered: (data) => data.goal });
    s.tracked.want('goal', 40, 10);
    await s.answer({ ok: true, data: { goal: 30 } });
    // Its answer is the truth now: a later wish for 30 is already held, so nothing is sent.
    s.tracked.want('goal', 30, 30);
    expect(s.asked).toHaveLength(1);
    expect(s.tracked.shown('goal', 99)).toBe(99);
  });
});

/** The same, over numbers, for a choice of more than two values. */
function createIntentsOver<S>(extra: { answered?: (data: { goal: S }, sent: S) => S } = {}) {
  const asked: { wanted: S; confirmed: S }[] = [];
  const waiting: ((r: ApiResult<{ goal: S }>) => void)[] = [];
  const failed = vi.fn();
  const tracked = createIntents<string, S, { goal: S }>({
    send: (_key, wanted, confirmed) => {
      asked.push({ wanted, confirmed });
      return new Promise((resolve) => waiting.push(resolve));
    },
    failed,
    changed: () => undefined,
    ...extra,
  });
  const answer = async (r: ApiResult<{ goal: S }>) => {
    waiting.shift()!(r);
    await new Promise((r) => setTimeout(r, 0));
  };
  return { tracked, asked, failed, answer };
}

describe('saying a change did not save', () => {
  const t = (key: string) => (key === 'error.offline' ? 'Can’t reach Hevalo right now.' : key);

  it('says why in the app’s words, as a notice', () => {
    sayNotSaved({ kind: 'client', status: 404, message: 'no such post' }, t as never);
    expect(notices).toEqual(['no such post']);
  });

  it('says a lost connection plainly, without blaming anybody', () => {
    sayNotSaved(refused, t as never);
    expect(notices).toEqual(['Can’t reach Hevalo right now.']);
  });

  it('leaves maintenance to its own screen', () => {
    sayNotSaved({ kind: 'server', status: 503, code: 'MAINTENANCE', message: 'down' }, t as never);
    expect(notices).toEqual([]);
  });
});
