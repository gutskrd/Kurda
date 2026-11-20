/**
 * The picture policy, from what the check found to an outcome:
 *
 *   minor_safety possible or more                                   → child-safety hit (refused as `other`, no review)
 *   sexual / violence / self_harm / hate / shocking likely or more  → refused with that reason (shocking as `other`)
 *   any of those possible, suggestive possible or more, drugs likely → held for a person
 *   otherwise                                                        → clear
 *
 * A letter's drawing is never refused outright except for child safety: what would be refused is held instead.
 */
import { describe, expect, it } from 'vitest';
import { PICTURE_SCAN_CATEGORIES, PICTURE_SURFACES } from '@kurda/shared';
import {
  CLEAN_LEVELS,
  decidePicture,
  legacyAction,
  legacyReasons,
  legacyScores,
  levelsOf,
  parseLevels,
  ruleFor,
  surfaceOfKind,
  topCategory,
} from './image-scan.js';

describe('picture policy', () => {
  it('clears a picture nothing was found in, on every surface', () => {
    for (const surface of PICTURE_SURFACES) expect(decidePicture(CLEAN_LEVELS, surface)).toEqual({ state: 'clear' });
  });

  it('treats any possible sexualised depiction of a minor as a child-safety hit, even on a letter', () => {
    for (const surface of PICTURE_SURFACES) {
      expect(decidePicture(levelsOf({ minor_safety: 'possible' }), surface)).toEqual({ state: 'child_safety' });
    }
    // it outranks everything else found in the same picture
    expect(decidePicture(levelsOf({ minor_safety: 'likely', sexual: 'certain' }), 'post')).toEqual({ state: 'child_safety' });
  });

  it('refuses what is likely or certain, with the reason its owner is shown', () => {
    expect(decidePicture(levelsOf({ sexual: 'likely' }), 'post')).toEqual({ state: 'refused', reason: 'sexual' });
    expect(decidePicture(levelsOf({ violence: 'certain' }), 'profile_photo')).toEqual({ state: 'refused', reason: 'violence' });
    expect(decidePicture(levelsOf({ self_harm: 'likely' }), 'group_photo')).toEqual({ state: 'refused', reason: 'self_harm' });
    expect(decidePicture(levelsOf({ hate: 'likely' }), 'post')).toEqual({ state: 'refused', reason: 'hate' });
    // vile or shocking content is refused without naming it
    expect(decidePicture(levelsOf({ shocking: 'certain' }), 'post')).toEqual({ state: 'refused', reason: 'other' });
  });

  it('names the surest reason, and the earlier category on a tie', () => {
    expect(decidePicture(levelsOf({ violence: 'certain', sexual: 'likely' }), 'post')).toEqual({ state: 'refused', reason: 'violence' });
    expect(decidePicture(levelsOf({ hate: 'likely', violence: 'likely' }), 'post')).toEqual({ state: 'refused', reason: 'violence' });
  });

  it('holds what is uncertain for a person', () => {
    for (const category of ['sexual', 'violence', 'self_harm', 'hate', 'shocking'] as const) {
      expect(decidePicture(levelsOf({ [category]: 'possible' }), 'post')).toEqual({ state: 'held' });
    }
    expect(decidePicture(levelsOf({ suggestive: 'possible' }), 'post')).toEqual({ state: 'held' });
    expect(decidePicture(levelsOf({ suggestive: 'certain' }), 'profile_photo')).toEqual({ state: 'held' });
    expect(decidePicture(levelsOf({ drugs: 'likely' }), 'post')).toEqual({ state: 'held' });
  });

  it('lets a merely possible drug reference through', () => {
    expect(decidePicture(levelsOf({ drugs: 'possible' }), 'post')).toEqual({ state: 'clear' });
  });

  it('holds a letter’s drawing that would otherwise be refused', () => {
    expect(decidePicture(levelsOf({ sexual: 'certain' }), 'letter')).toEqual({ state: 'held' });
    expect(decidePicture(levelsOf({ shocking: 'likely' }), 'letter')).toEqual({ state: 'held' });
    expect(decidePicture(levelsOf({ suggestive: 'possible' }), 'letter')).toEqual({ state: 'held' });
  });
});

describe('picture findings as stored', () => {
  it('reads back only complete findings with known levels', () => {
    expect(parseLevels(CLEAN_LEVELS)).toEqual(CLEAN_LEVELS);
    expect(parseLevels({ ...CLEAN_LEVELS, extra: 'ignored' })).toEqual(CLEAN_LEVELS);
    expect(parseLevels({ sexual: 'none' })).toBeNull();
    expect(parseLevels({ ...CLEAN_LEVELS, sexual: 'maybe' })).toBeNull();
    expect(parseLevels(null)).toBeNull();
    expect(parseLevels([])).toBeNull();
    expect(Object.keys(CLEAN_LEVELS).sort()).toEqual([...PICTURE_SCAN_CATEGORIES].sort());
  });

  it('keeps the old numeric columns meaningful', () => {
    expect(legacyScores(CLEAN_LEVELS)).toEqual({ nsfwScore: 0, violenceScore: 0, csamMatch: false });
    expect(legacyScores(levelsOf({ suggestive: 'possible', violence: 'likely' }))).toEqual({ nsfwScore: 0.5, violenceScore: 0.8, csamMatch: false });
    expect(legacyScores(levelsOf({ minor_safety: 'possible', shocking: 'certain' }))).toEqual({ nsfwScore: 0.5, violenceScore: 1, csamMatch: true });
    expect(legacyAction({ state: 'clear' })).toBe('allow');
    expect(legacyAction({ state: 'held' })).toBe('gate');
    expect(legacyAction({ state: 'refused', reason: 'hate' })).toBe('auto_block');
    expect(legacyAction({ state: 'child_safety' })).toBe('hard_block');
    expect(legacyReasons(levelsOf({ sexual: 'likely' }), { state: 'refused', reason: 'sexual' })).toEqual(['nsfw']);
    expect(legacyReasons(null, { state: 'child_safety' })).toEqual(['csam']);
  });

  it('points a removal at the rule its strongest finding breaks', () => {
    expect(topCategory(CLEAN_LEVELS)).toBeNull();
    expect(ruleFor(CLEAN_LEVELS)).toBe('other');
    expect(ruleFor(levelsOf({ suggestive: 'possible' }))).toBe('sexual');
    expect(ruleFor(levelsOf({ drugs: 'likely', hate: 'possible' }))).toBe('other');
    expect(ruleFor(levelsOf({ hate: 'likely', drugs: 'possible' }))).toBe('hate');
    expect(ruleFor(null, { state: 'child_safety' })).toBe('child_safety');
  });

  it('knows where a picture is shown from the kind it was stored under', () => {
    expect(surfaceOfKind('image-post')).toBe('post');
    expect(surfaceOfKind('profile-photo')).toBe('profile_photo');
    expect(surfaceOfKind('group-photo')).toBe('group_photo');
    expect(surfaceOfKind('letter-drawing')).toBe('letter');
  });
});
