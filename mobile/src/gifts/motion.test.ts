import { describe, expect, it } from 'vitest';
import { GIFT_REDUCED_MOTION_MS, GIFT_UNWRAP_MS } from '@kurda/shared';
import { unwrapPlan } from './motion';
import { messagePreview } from '../chat/preview';
import { TRANSLATIONS, type TranslationKey } from '../i18n/translations';
import { interpolate } from '../i18n/format';

describe('unwrapPlan', () => {
  it('sizes the moment by tier: a card, a sheet, the whole screen', () => {
    const common = unwrapPlan('common', false);
    const rare = unwrapPlan('rare', false);
    const legendary = unwrapPlan('legendary', false);
    expect([common.stage, rare.stage, legendary.stage]).toEqual(['card', 'sheet', 'full']);
    expect([common.durationMs, rare.durationMs, legendary.durationMs]).toEqual([
      GIFT_UNWRAP_MS.common,
      GIFT_UNWRAP_MS.rare,
      GIFT_UNWRAP_MS.legendary,
    ]);
    expect(common.particles.length).toBeLessThan(rare.particles.length);
    expect(rare.particles.length).toBeLessThan(legendary.particles.length);
    // only the Newroz gifts get the flame
    expect([common.flame, rare.flame, legendary.flame]).toEqual([false, false, true]);
  });

  it('keeps every particle inside the progress, so an interpolation never runs backwards', () => {
    for (const tier of ['common', 'rare', 'legendary'] as const) {
      const plan = unwrapPlan(tier, false);
      for (const p of plan.particles) {
        expect(plan.popAt + p.delay).toBeLessThan(0.85);
        expect(Number.isFinite(p.dx) && Number.isFinite(p.dy)).toBe(true);
      }
    }
  });

  it('is the same burst every time a tier plays', () => {
    expect(unwrapPlan('rare', false)).toEqual(unwrapPlan('rare', false));
  });

  it('is a short fade and nothing thrown when the device asks for less motion', () => {
    const plan = unwrapPlan('legendary', true);
    expect(plan.durationMs).toBe(GIFT_REDUCED_MOTION_MS);
    expect(plan.particles).toEqual([]);
    expect(plan.flame).toBe(false);
  });
});

describe('messagePreview', () => {
  const t = (key: TranslationKey, vars?: Record<string, string | number>) => interpolate(TRANSLATIONS.ku[key], vars);
  it('writes its own line for a gift or a game, in the reader’s language', () => {
    expect(messagePreview({ lastMessage: 'Sent a gift', lastKind: 'gift' }, t)).toBe('🎁 Diyarî');
    expect(messagePreview({ lastMessage: 'Peyvok Battle', lastKind: 'game' }, t)).toBe(TRANSLATIONS.ku['play.chat.preview']);
    expect(messagePreview({ lastMessage: 'silav', lastKind: 'text' }, t)).toBe('silav');
    // an older server sends no kind
    expect(messagePreview({ lastMessage: 'silav' }, t)).toBe('silav');
  });
});
