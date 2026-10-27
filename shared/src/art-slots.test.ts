import { describe, expect, it } from 'vitest';
import { BADGES } from './badges.js';
import { ART_SLOT_FAMILIES, artSlot, artSlotsOf, badgeLevelName, isArtSlot, overrideFor, parseArtSlot } from './art-slots.js';

describe('picture slots', () => {
  it('names a slot by family, key and, for a badge, a level', () => {
    expect(parseArtSlot('badge:streak:zer')).toEqual({ family: 'badge', key: 'streak', level: 'zer' });
    expect(parseArtSlot('rank:zozan')).toEqual({ family: 'rank', key: 'zozan', level: null });
    expect(parseArtSlot('nothing:here')).toBeNull();
    expect(parseArtSlot('rank:../etc')).toBeNull();
    expect(artSlot('league', 'kani')).toBe('league:kani');
  });

  it('knows only the slots the apps draw', () => {
    const levelled = BADGES.find((b) => b.tiers.length > 1)!;
    const single = BADGES.find((b) => b.tiers.length === 1)!;
    expect(isArtSlot(`badge:${levelled.key}`)).toBe(true);
    expect(isArtSlot(`badge:${levelled.key}:ziv`)).toBe(true);
    expect(isArtSlot(`badge:${single.key}:ziv`)).toBe(false);
    expect(isArtSlot('badge:not-a-badge')).toBe(false);
    expect(isArtSlot('rank:sterk')).toBe(true);
    expect(isArtSlot('rank:sterk:zer')).toBe(false);
    expect(isArtSlot('league:okyanus')).toBe(true);
    expect(isArtSlot('frame:dest')).toBe(true);
    expect(isArtSlot('avatar:default-17')).toBe(true);
    expect(isArtSlot('avatar:default-18')).toBe(false);
    expect(isArtSlot('event:newroz')).toBe(true);
  });

  it('lists every slot of every family once, each one valid', () => {
    for (const family of ART_SLOT_FAMILIES) {
      const slots = artSlotsOf(family).map((s) => s.slot);
      expect(slots.length).toBeGreaterThan(0);
      expect(new Set(slots).size).toBe(slots.length);
      for (const slot of slots) expect(isArtSlot(slot)).toBe(true);
    }
    expect(artSlotsOf('rank')).toHaveLength(6);
    expect(artSlotsOf('league')).toHaveLength(6);
  });

  it('finds a level’s own picture first, then the one for every level', () => {
    const overrides = { 'badge:streak': 'https://cdn/all.png', 'badge:streak:zer': 'https://cdn/gold.png' };
    expect(overrideFor(overrides, 'badge', 'streak', 'zer')).toBe('https://cdn/gold.png');
    expect(overrideFor(overrides, 'badge', 'streak', 'ziv')).toBe('https://cdn/all.png');
    expect(overrideFor(overrides, 'badge', 'other')).toBeNull();
    expect(overrideFor(null, 'rank', 'dest')).toBeNull();
    expect(badgeLevelName(3)).toBe('zer');
    expect(badgeLevelName(9)).toBeNull();
  });
});
