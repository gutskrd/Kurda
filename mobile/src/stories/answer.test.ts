import { describe, expect, it } from 'vitest';
import type { StoryGameView } from '@kurda/shared';
import type { ApiResult } from '../api/types';
import { sendAnswer } from './answer';

const view = { id: 'g', version: 3 } as StoryGameView;
const net: ApiResult<StoryGameView> = { ok: false, error: { kind: 'network', message: 'offline' } };
const refused = (code: string): ApiResult<StoryGameView> => ({ ok: false, error: { kind: 'client', code, message: code, status: 409 } });

function server(replies: Array<ApiResult<StoryGameView>>) {
  let clock = Date.parse('2026-10-13T10:00:00Z');
  const sent: number[] = [];
  return {
    sent,
    send: async () => {
      sent.push(clock);
      return replies.shift() ?? net;
    },
    serverNow: () => clock,
    sleep: async (ms: number) => {
      clock += ms;
    },
    at: (offsetMs: number) => new Date(Date.parse('2026-10-13T10:00:00Z') + offsetMs).toISOString(),
  };
}

describe('sendAnswer', () => {
  it('returns the new view when the answer gets through', async () => {
    const s = server([{ ok: true, data: view }]);
    expect(await sendAnswer({ ...s, phaseEndsAt: null })).toEqual({ kind: 'accepted', view });
  });

  it('sends the same answer again after a network failure, and takes ALREADY_ANSWERED as success', async () => {
    const s = server([net, net, refused('ALREADY_ANSWERED')]);
    expect(await sendAnswer({ ...s, phaseEndsAt: s.at(30_000) })).toEqual({ kind: 'already' });
    expect(s.sent).toHaveLength(3);
  });

  it('says nothing when the question moved on (NOT_CURRENT), and tells the player when it was too late', async () => {
    expect(await sendAnswer({ ...server([refused('NOT_CURRENT')]), phaseEndsAt: null })).toEqual({ kind: 'not-current' });
    expect(await sendAnswer({ ...server([refused('TOO_LATE')]), phaseEndsAt: null })).toEqual({ kind: 'too-late' });
  });

  it('stops trying once the screen has moved past the question', async () => {
    const s = server([net, net, net]);
    let moved = false;
    const out = await sendAnswer({
      ...s,
      send: async () => {
        const res = await s.send();
        moved = s.sent.length === 2; // the next question arrived during the second try
        return res;
      },
      phaseEndsAt: s.at(30_000),
      movedOn: () => moved,
    });
    expect(out).toEqual({ kind: 'not-current' });
    expect(s.sent).toHaveLength(2);
  });

  it('keeps trying until the deadline plus the grace, and never after it', async () => {
    const s = server([]);
    const out = await sendAnswer({ ...s, phaseEndsAt: s.at(3_000) });
    expect(out).toEqual({ kind: 'too-late' });
    const deadline = Date.parse(s.at(3_000)) + 1_500;
    expect(s.sent.length).toBeGreaterThan(2);
    for (const at of s.sent) expect(at).toBeLessThan(deadline);
  });

  it('gives an untimed question a few tries, then hands it back to send again', async () => {
    const s = server([]);
    const out = await sendAnswer({ ...s, phaseEndsAt: null });
    expect(out.kind).toBe('failed');
    expect(s.sent).toHaveLength(4);
  });

  it('does not retry a refusal that will not change (a bad choice)', async () => {
    const s = server([refused('BAD_CHOICE')]);
    expect((await sendAnswer({ ...s, phaseEndsAt: null })).kind).toBe('failed');
    expect(s.sent).toHaveLength(1);
  });
});
