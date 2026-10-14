import { describe, expect, it } from 'vitest';
import { demote, previousWeek, promote, TIERS, utcOffsetMinutes, weekStart } from './league-logic.js';

// The ten-tier ladder and the old "top ten promote, bottom five demote" rule
// this file pinned were replaced on purpose (contract 4 §L); their successors
// are tested in shared/src/leagues.test.ts.

describe('promote / demote', () => {
  it('moves one tier and clamps at the ends', () => {
    expect(promote('dilop')).toBe('kani');
    expect(demote('kani')).toBe('dilop');
    expect(promote('okyanus')).toBe('okyanus');
    expect(demote('dilop')).toBe('dilop');
  });

  it('covers the whole ladder', () => {
    expect(TIERS[0]).toBe('dilop');
    expect(TIERS[TIERS.length - 1]).toBe('okyanus');
  });
});

describe('weekStart', () => {
  it('returns the Monday 00:00 UTC of the week', () => {
    expect(weekStart(new Date('2026-07-08T15:00:00Z'))).toBe('2026-07-06');
    expect(weekStart(new Date('2026-07-06T00:00:00Z'))).toBe('2026-07-06');
    expect(previousWeek('2026-07-06')).toBe('2026-06-29');
  });
});

describe('utcOffsetMinutes', () => {
  it('reads a zone’s offset at a moment, daylight saving included', () => {
    expect(utcOffsetMinutes('Asia/Baghdad', new Date('2026-07-01T12:00:00Z'))).toBe(180);
    expect(utcOffsetMinutes('America/New_York', new Date('2026-07-01T12:00:00Z'))).toBe(-240);
    expect(utcOffsetMinutes('America/New_York', new Date('2026-01-15T12:00:00Z'))).toBe(-300);
    expect(utcOffsetMinutes('UTC', new Date())).toBe(0);
  });

  it('reads an unknown zone as UTC rather than failing', () => {
    expect(utcOffsetMinutes('Not/AZone', new Date())).toBe(0);
  });
});
