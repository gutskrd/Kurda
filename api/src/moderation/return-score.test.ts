import { describe, expect, it } from 'vitest';
import { scoreReturn, signalStrength, strongerLevel, type NetworkFacts, type ObservedSignal, type ReturnLevel } from './return-score.js';

const at = '2026-11-01T10:00:00.000Z';
const quiet: NetworkFacts = { quiet: true, daysAfterBan: 2, separateDays: 1, sameTimeZone: true, sameLanguage: true };
const busy: NetworkFacts = { ...quiet, quiet: false, separateDays: 9 };

const nearBan = (n: Partial<NetworkFacts> = {}): ObservedSignal => ({ kind: 'network_near_ban', at, network: { ...quiet, ...n } });
const repeated = (n: Partial<NetworkFacts> = {}): ObservedSignal => ({
  kind: 'network_repeated',
  at,
  network: { ...quiet, daysAfterBan: null, separateDays: 3, sameTimeZone: false, sameLanguage: false, ...n },
});

/** The written table, row by row: what is shared, and what it means. */
const TABLE: Array<[string, ObservedSignal[], ReturnLevel]> = [
  ['the same address', [{ kind: 'email', at }], 'same_identity'],
  ['the same sign-in provider subject', [{ kind: 'oauth', at }], 'same_identity'],
  ['the same phone number', [{ kind: 'phone', at }], 'same_identity'],
  ['an install id used within 180 days', [{ kind: 'device', at, ageDays: 30 }], 'strong'],
  ['an install id last used 200 days ago', [{ kind: 'device', at, ageDays: 200 }], 'none'],
  ['the same push token', [{ kind: 'push', at }], 'strong'],
  ['a quiet network near the ban with the same time zone and language', [nearBan()], 'medium'],
  ['a quiet network near the ban in another time zone', [nearBan({ sameTimeZone: false })], 'none'],
  ['a quiet network near the ban in another language', [nearBan({ sameLanguage: false })], 'none'],
  ['a quiet network eight days after the ban', [nearBan({ daysAfterBan: 8 })], 'none'],
  ['a quiet network on separate days', [repeated()], 'medium'],
  ['a quiet network on one day only', [repeated({ separateDays: 1 })], 'none'],
  ['a busy network near the ban', [nearBan({ quiet: false })], 'none'],
  ['a busy network on many days', [{ kind: 'network_repeated', at, network: busy }], 'none'],
  ['a network and nothing else', [{ kind: 'network', at }], 'none'],
  ['two medium signals, one with time zone and language', [nearBan(), repeated()], 'strong'],
  ['two network signals with neither time zone nor language', [repeated(), repeated({ separateDays: 5 })], 'medium'],
  ['a strong and an identity signal', [{ kind: 'device', at, ageDays: 1 }, { kind: 'email', at }], 'same_identity'],
  ['nothing at all', [], 'none'],
];

describe('the possible-return table', () => {
  for (const [what, signals, level] of TABLE) {
    it(`${what}: ${level}`, () => {
      expect(scoreReturn(signals).level).toBe(level);
    });
  }

  it('never holds or refuses on networks alone, however many', () => {
    const many = Array.from({ length: 10 }, (_, i) => repeated({ separateDays: 2 + i }));
    expect(scoreReturn(many).level).toBe('medium');
    expect(scoreReturn(many.map((s) => ({ ...s, kind: 'network' as const }))).level).toBe('none');
  });

  it('weighs each signal, strongest first', () => {
    const out = scoreReturn([{ kind: 'network', at }, nearBan(), { kind: 'push', at }]);
    expect(out.signals.map((s) => s.strength)).toEqual(['strong', 'medium', 'weak']);
  });

  it('gives every signal kind a strength', () => {
    expect(signalStrength({ kind: 'push', at })).toBe('strong');
    expect(signalStrength({ kind: 'device', at })).toBe('strong');
  });

  it('keeps the higher of two levels', () => {
    expect(strongerLevel('medium', 'strong')).toBe('strong');
    expect(strongerLevel('same_identity', 'none')).toBe('same_identity');
    expect(strongerLevel('none', 'none')).toBe('none');
  });
});
