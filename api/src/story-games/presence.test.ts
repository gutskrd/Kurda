import { describe, expect, it } from 'vitest';
import { PRESENCE_TIMEOUT_SECONDS } from '@kurda/shared';
import { PRESENCE_WRITE_EVERY_MS, Presence } from './presence.js';

const TIMEOUT = PRESENCE_TIMEOUT_SECONDS * 1000;

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('Presence', () => {
  it('counts everyone as present right after the process starts, then by when they were last heard from', () => {
    const c = clock();
    const p = new Presence({ now: c.now });
    expect(p.isAway('g', 'u', null)).toBe(false);
    c.advance(TIMEOUT + 1);
    expect(p.isAway('g', 'u', null)).toBe(true);
    p.touch('g', 'u');
    expect(p.isAway('g', 'u', null)).toBe(false);
    c.advance(TIMEOUT);
    expect(p.isAway('g', 'u', null)).toBe(false);
    c.advance(1);
    expect(p.isAway('g', 'u', null)).toBe(true);
  });

  it('takes the later of what this instance heard and what the database says', () => {
    const c = clock();
    const p = new Presence({ now: c.now, startGraceMs: 0 });
    c.advance(TIMEOUT * 3);
    // heard from on another instance 10 s ago
    expect(p.isAway('g', 'u', new Date(c.now() - 10_000))).toBe(false);
    expect(p.isAway('g', 'u', new Date(c.now() - TIMEOUT - 1))).toBe(true);
    expect(p.awayAt('g', 'u', new Date(c.now() - 10_000))).toBe(c.now() - 10_000 + TIMEOUT + 1);
  });

  it('writes the database copy at most every 15 s, and says when someone was away until now', () => {
    const c = clock();
    const p = new Presence({ now: c.now, startGraceMs: 0 });
    c.advance(TIMEOUT * 2);
    expect(p.touch('g', 'u')).toEqual({ write: true, wasAway: true });
    c.advance(1000);
    expect(p.touch('g', 'u')).toEqual({ write: false, wasAway: false });
    c.advance(PRESENCE_WRITE_EVERY_MS);
    expect(p.touch('g', 'u').write).toBe(true);
  });

  it('turns away no earlier than the end of the start-up grace', () => {
    const c = clock();
    const p = new Presence({ now: c.now });
    expect(p.awayAt('g', 'u', null)).toBe(c.now() + TIMEOUT + 1);
  });

  it('forgets ended games and stale entries', () => {
    const c = clock();
    const p = new Presence({ now: c.now, startGraceMs: 0 });
    p.touch('g', 'u');
    p.touch('h', 'u');
    p.drop('g');
    c.advance(TIMEOUT + 1);
    expect(p.isAway('g', 'u', null)).toBe(true);
    expect(p.isAway('h', 'u', null)).toBe(true);
    p.touch('h', 'v');
    p.prune(1000);
    expect(p.seenAt('h', 'u', null)).toBe(0);
    expect(p.seenAt('h', 'v', null)).toBe(c.now());
  });
});
