import { describe, expect, it } from 'vitest';
import { AA_NORMAL, contrastRatio } from '../a11y/contrast';
import { TONES } from '../coursemap/path';
import { LIGHT } from '../theme/palette';
import { AVATAR_COLORS, AVATAR_TEXT_COLOR, avatarColor, deriveInitials, initialsAvatar } from './initials';

describe('deriveInitials', () => {
  it('takes first + last initials for multi-word names', () => {
    expect(deriveInitials('Ada Lovelace')).toBe('AL');
    expect(deriveInitials('Şêrko Bêkes')).toBe('ŞB'); // Kurdish diacritics preserved + uppercased
    expect(deriveInitials('mary jane watson')).toBe('MW'); // first + last, not middle
  });

  it('takes the first two characters for a single word', () => {
    expect(deriveInitials('Rojîn')).toBe('RO');
    expect(deriveInitials('şêrko')).toBe('ŞÊ');
  });

  it('handles a single character', () => {
    expect(deriveInitials('x')).toBe('X');
  });

  it('drops leading punctuation / @ handles', () => {
    expect(deriveInitials('@zilan')).toBe('ZI');
    expect(deriveInitials('zilan_bot')).toBe('ZI'); // underscore is not a word break here
  });

  it('collapses extra whitespace', () => {
    expect(deriveInitials('  Ada   Lovelace  ')).toBe('AL');
  });

  it('falls back to ? for blank input', () => {
    expect(deriveInitials('')).toBe('?');
    expect(deriveInitials('   ')).toBe('?');
  });

  it('does not crash on emoji-only names', () => {
    expect(deriveInitials('😀')).toBe('😀');
    expect(deriveInitials('😀 hi')).toBe('😀H');
  });
});

describe('avatarColor', () => {
  it('is deterministic for the same seed', () => {
    expect(avatarColor('user-123')).toBe(avatarColor('user-123'));
  });

  it('always returns a palette colour', () => {
    for (const seed of ['a', 'user-1', 'e79dc76', '', '😀', 'Şêrko']) {
      expect(AVATAR_COLORS).toContain(avatarColor(seed));
    }
  });

  it('spreads different seeds across more than one colour', () => {
    const used = new Set(Array.from({ length: 50 }, (_, i) => avatarColor(`u${i}`)));
    expect(used.size).toBeGreaterThan(1);
  });

  /*
   * The slot an id lands in is its hash over the count, so the count and the
   * order are the mapping. These ids are pinned to the slot they have always
   * had; what fills the slot is now a colour of the course.
   */
  it('keeps every id in the slot it had', () => {
    expect(AVATAR_COLORS).toHaveLength(8);
    expect(new Set(AVATAR_COLORS).size).toBe(8);
    const slot = (seed: string) => AVATAR_COLORS.indexOf(avatarColor(seed) as (typeof AVATAR_COLORS)[number]);
    expect(['user-123', 'u0', 'u1', 'Şêrko', ''].map(slot)).toEqual([3, 0, 3, 3, 5]);
  });
});

describe('the avatar colours', () => {
  it('are the course’s own, as the lesson path paints them by day', () => {
    const course = Object.values(TONES.light).flatMap((t) => [t.fill, t.lip]);
    for (const bg of AVATAR_COLORS) expect(course, bg).toContain(bg);
    // every tone of the path is somebody's colour
    for (const t of Object.values(TONES.light)) expect(AVATAR_COLORS, t.fill).toContain(t.fill);
  });

  it('never dress a person in the colour of an error', () => {
    expect(AVATAR_COLORS).not.toContain(LIGHT.danger);
  });
});

describe('accessibility', () => {
  it('every avatar colour meets AA contrast with the white monogram text', () => {
    for (const bg of AVATAR_COLORS) {
      expect(contrastRatio(bg, AVATAR_TEXT_COLOR)).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});

describe('initialsAvatar', () => {
  it('bundles initials + a stable colour + white text', () => {
    const a = initialsAvatar('Ada Lovelace', 'user-123');
    expect(a).toEqual({ initials: 'AL', backgroundColor: avatarColor('user-123'), textColor: '#FFFFFF' });
  });
});
