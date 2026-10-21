import { describe, expect, it } from 'vitest';
import { PACING, createPacer } from './haptics.js';

describe('the pacing', () => {
  it('drops a buzz within 60 ms of the last one', () => {
    const p = createPacer();
    expect(p.allow('tap', 1000)).toBe(true);
    expect(p.allow('tap', 1059)).toBe(false);
    expect(p.allow('select', 1030)).toBe(false);
    expect(p.allow('tap', 1060)).toBe(true);
  });

  it('keeps the one that says more when two arrive at once: a send refused at once is felt as refused', () => {
    const p = createPacer();
    expect(p.allow('tap', 1000)).toBe(true);
    expect(p.allow('error', 1005)).toBe(true);
    // and nothing lighter squeezes in after it
    expect(p.allow('tap', 1010)).toBe(false);
    expect(p.allow('correct', 1020)).toBe(false);
  });

  it('allows at most four in any two seconds, then lets them through again as the window moves on', () => {
    const p = createPacer();
    const at = [0, 100, 200, 300];
    for (const t of at) expect(p.allow('select', t)).toBe(true);
    expect(p.allow('select', 400)).toBe(false);
    expect(p.allow('select', 1999)).toBe(false);
    // the first of the four has left the window
    expect(p.allow('select', 2000)).toBe(true);
    expect(p.allow('select', 2061)).toBe(false);
    expect(p.allow('select', 2100)).toBe(true);
  });

  it('a dropped buzz does not count against the next', () => {
    const p = createPacer();
    for (let t = 0; t < 400; t += 100) p.allow('tap', t);
    // dropped, many times over
    for (let t = 400; t < 2000; t += 70) expect(p.allow('tap', t)).toBe(false);
    expect(p.allow('tap', 2000)).toBe(true);
  });

  it('celebrates once in two seconds: a lesson that ends, keeps the streak and earns a badge buzzes once', () => {
    const p = createPacer();
    expect(p.allow('celebrate', 0)).toBe(true); // lesson complete
    expect(p.allow('celebrate', 0)).toBe(false); // the streak, the same moment
    expect(p.allow('celebrate', 1500)).toBe(false); // the badge, landing a moment later
    expect(p.allow('celebrate', 2000)).toBe(true); // a separate moment
  });

  it('a celebration held back does not stop the other kinds', () => {
    const p = createPacer();
    expect(p.allow('celebrate', 0)).toBe(true);
    expect(p.allow('celebrate', 500)).toBe(false);
    expect(p.allow('tap', 500)).toBe(true);
  });

  it('keeps its numbers as briefed', () => {
    expect(PACING).toEqual({ minGapMs: 60, burstWindowMs: 2000, burstMax: 4, celebrateGapMs: 2000 });
  });
});
