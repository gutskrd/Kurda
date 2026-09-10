import { describe, expect, it } from 'vitest';
import { FILTERS, NO_FILTER, gradeOf, overlaySources, presetByKey } from './filters';
import { ADJUSTMENT_KEYS, NEUTRAL, isNeutral, type Adjustments } from './adjust';
import { translator } from '../i18n/I18nProvider';
import { en } from '../i18n/en';
import { de } from '../i18n/de';
import { tr } from '../i18n/tr';

const byHand = (over: Partial<Adjustments>): Adjustments => ({ ...NEUTRAL, ...over });

describe('the catalogue', () => {
  it('has a unique key and a name for every filter', () => {
    const keys = FILTERS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const f of FILTERS) {
      expect(f.label.length).toBeGreaterThan(0);
      expect(f.hintKey.length).toBeGreaterThan(0);
    }
  });

  /**
   * A filter's name is a name — Zêr is called Zêr on a German screen, the way
   * Instagram's Clarendon is called Clarendon everywhere. What a reader needs
   * translating is the tooltip that says what the look actually is.
   */
  it('keeps its Kurmancî name in every language, and translates the hint', () => {
    const zer = presetByKey('zer')!;
    expect(zer.label).toBe('Zêr');
    expect(translator(en)(zer.hintKey)).toBe('Gold');
    expect(translator(de)(zer.hintKey)).toBe('Gold');
    expect(translator(tr)(zer.hintKey)).toBe('Altın');
    // and every hint resolves to something, in a language that is not English
    for (const f of FILTERS) {
      expect(translator(tr)(f.hintKey), f.key).not.toBe(f.hintKey);
    }
  });

  it('opens on the one that does nothing', () => {
    expect(FILTERS[0]!.key).toBe(NO_FILTER);
    expect(isNeutral(FILTERS[0]!.adjustments)).toBe(true);
    expect(FILTERS[0]!.tone).toBeUndefined();
    expect(FILTERS[0]!.overlay).toBeUndefined();
  });

  it('falls back rather than throwing on a key that is no longer there', () => {
    expect(presetByKey('a-filter-that-was-removed').key).toBe(NO_FILTER);
  });

  it('gives every filter a complete set of adjustments', () => {
    for (const f of FILTERS) {
      for (const key of ADJUSTMENT_KEYS) expect(typeof f.adjustments[key]).toBe('number');
    }
  });
});

describe('the ones that needed new machinery', () => {
  it('paints the heat camera through a palette rather than tinting', () => {
    const germi = presetByKey('germi');
    expect(germi.tone).toBeDefined();
    expect(germi.tone!.amount).toBe(1);
    // and it spreads the range first, or a flat picture maps to one flat colour
    expect(germi.adjustments.contrast).toBeGreaterThan(0);
  });

  it('makes the antique old rather than merely faded', () => {
    const kevnar = presetByKey('kevnar');
    // a real sepia is a repaint from brightness, not brown thrown over the top
    expect(kevnar.tone).toBeDefined();
    expect(kevnar.adjustments.grain).toBeGreaterThan(0);
    expect(kevnar.adjustments.vignette).toBeGreaterThan(0);
    // and distinct from the merely-faded one it sits next to
    expect(presetByKey('kevn').tone).toBeUndefined();
  });

  it('pixelates through the block size, which is a slider like any other', () => {
    expect(presetByKey('piksel').adjustments.pixelate).toBeGreaterThan(0);
  });

  it('lays the flag over the corner', () => {
    const ala = presetByKey('ala');
    expect(ala.overlay).toBeDefined();
    expect(ala.overlay!.src).toBe('/filters/kurdistan.webp');
    expect(ala.overlay!.widthShare).toBeGreaterThan(0);
    expect(ala.overlay!.widthShare).toBeLessThanOrEqual(1);
  });

  it('lists the artwork that has to be decoded before a draw', () => {
    expect(overlaySources()).toContain('/filters/kurdistan.webp');
    // only what is actually used — the list drives a preload
    expect(overlaySources().length).toBe(FILTERS.filter((f) => f.overlay).length);
  });
});

describe('gradeOf', () => {
  it('at full strength is the filter as written', () => {
    const grade = gradeOf('zer', 1, NEUTRAL);
    expect(grade.adjustments).toEqual(presetByKey('zer').adjustments);
  });

  /**
   * Strength has to reach everything, not just the sliders. A half-strength
   * heat camera that still repaints every colour at full force would not be
   * half of anything.
   */
  it('at zero strength does nothing at all, whatever the filter uses', () => {
    for (const key of ['zer', 'germi', 'kevnar', 'piksel', 'ala']) {
      const grade = gradeOf(key, 0, NEUTRAL);
      expect(isNeutral(grade.adjustments)).toBe(true);
      expect(grade.tone?.amount ?? 0).toBe(0);
      expect(grade.overlay?.opacity ?? 0).toBe(0);
    }
  });

  it('fades the palette and the overlay together, in step', () => {
    const half = gradeOf('kevnar', 0.5, NEUTRAL);
    expect(half.tone!.amount).toBeCloseTo(presetByKey('kevnar').tone!.amount * 0.5, 6);

    const flag = gradeOf('ala', 0.4, NEUTRAL);
    expect(flag.overlay!.opacity).toBeCloseTo(0.4, 6);
  });

  it('adds what the person did by hand on top of the filter', () => {
    const grade = gradeOf('zer', 1, byHand({ warmth: -10 }));
    expect(grade.adjustments.warmth).toBe(presetByKey('zer').adjustments.warmth - 10);
  });

  it('refuses a strength outside 0 to 1', () => {
    expect(gradeOf('zer', 9, NEUTRAL).adjustments).toEqual(gradeOf('zer', 1, NEUTRAL).adjustments);
    expect(isNeutral(gradeOf('zer', -4, NEUTRAL).adjustments)).toBe(true);
  });

  describe('the cache signature', () => {
    /**
     * The grading cache compares grades, and a grade carries a 768-byte palette.
     * Serialising that on every draw would cost more than the cache saves, so
     * the signature stands in for it — which only works if it really does
     * change whenever the result would.
     */
    it('is stable for the same inputs', () => {
      expect(gradeOf('zer', 0.5, byHand({ warmth: 4 })).signature).toBe(
        gradeOf('zer', 0.5, byHand({ warmth: 4 })).signature,
      );
    });

    it('changes with the filter, the strength, and every slider', () => {
      const base = gradeOf('zer', 0.5, NEUTRAL).signature;
      expect(gradeOf('sev', 0.5, NEUTRAL).signature).not.toBe(base);
      expect(gradeOf('zer', 0.6, NEUTRAL).signature).not.toBe(base);
      for (const key of ADJUSTMENT_KEYS) {
        expect(gradeOf('zer', 0.5, byHand({ [key]: 7 })).signature).not.toBe(base);
      }
    });
  });
});
