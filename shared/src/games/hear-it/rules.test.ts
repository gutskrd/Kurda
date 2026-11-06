/**
 * Hear It, Find It's rules: a round of eight climbs its difficulty's rungs,
 * typing only at the advanced one, with fewer replays the harder it is, and
 * pays at the difficulty's own levels.
 */
import { describe, expect, it } from 'vitest';
import { DIFFICULTY_LEVELS, GAME_DIFFICULTIES, SOLO_ROUND_ITEMS } from '../solo.js';
import { HEAR_REPLAYS, HEAR_STAGES, HEAR_STAGE_MIX, hearItClipPath, hearItemLevel, hearStagesOf } from './rules.js';

describe('Hear It, Find It’s rules', () => {
  it('makes every round eight items, climbing the ladder in order', () => {
    for (const d of GAME_DIFFICULTIES) {
      expect(HEAR_STAGE_MIX[d].reduce((sum, [, n]) => sum + n, 0)).toBe(SOLO_ROUND_ITEMS);
      const steps = hearStagesOf(d).map((s) => HEAR_STAGES.indexOf(s));
      expect(steps).toEqual([...steps].sort((a, b) => a - b));
    }
  });

  it('asks for typing only at the advanced difficulty', () => {
    expect(hearStagesOf('beginner')).not.toContain('type');
    expect(hearStagesOf('intermediate')).not.toContain('type');
    expect(hearStagesOf('advanced')).toContain('type');
  });

  it('allows fewer replays the harder the round', () => {
    expect(HEAR_REPLAYS.beginner).toBeGreaterThan(HEAR_REPLAYS.intermediate);
    expect(HEAR_REPLAYS.intermediate).toBeGreaterThan(HEAR_REPLAYS.advanced);
    expect(HEAR_REPLAYS.advanced).toBeGreaterThanOrEqual(1);
  });

  it('pays an item at its difficulty’s own levels', () => {
    for (const d of GAME_DIFFICULTIES) for (const s of hearStagesOf(d)) expect(DIFFICULTY_LEVELS[d]).toContain(hearItemLevel(d, s));
  });

  it('plays a clip from an address that names only the round and the handle', () => {
    expect(hearItClipPath('00000000-0000-4000-8000-000000000001', 'AbC_d-9')).toBe('/games/solo/sessions/00000000-0000-4000-8000-000000000001/clips/AbC_d-9');
  });
});
