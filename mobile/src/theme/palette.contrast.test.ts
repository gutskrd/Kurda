import { describe, expect, it } from 'vitest';
import { DARK, LIGHT } from './palette';
import { AA_LARGE, AA_NORMAL, contrastRatio, hexToRgb, type Rgb } from '../a11y/contrast';

/** A translucent fill as it appears over what is behind it, since contrast is between opaque colours. */
function over(fill: string, behind: string): Rgb {
  const base = hexToRgb(behind);
  const m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(fill);
  if (!m) return hexToRgb(fill);
  const a = Number(m[4]);
  const mix = (top: number, bottom: number) => Math.round(top * a + bottom * (1 - a));
  return { r: mix(Number(m[1]), base.r), g: mix(Number(m[2]), base.g), b: mix(Number(m[3]), base.b) };
}

/**
 * The palette's WCAG AA contrast: body text 4.5:1 on the background and on primary buttons; the brand colour, used
 * mostly for large headings, at least 3:1. The raw background is the lowest-contrast surface, so it is the
 * conservative check.
 */
for (const p of [LIGHT, DARK]) {
  describe(`palette contrast — ${p.scheme}`, () => {
    // A switch must be visible on or off anywhere (WCAG 1.4.11): its track on the page, a card and a raised surface, and its knob on its track.
    it('a switch’s track and knob clear 3:1, on and off, on every surface', () => {
      for (const surface of [p.background, p.surface, p.surfaceRaised]) {
        expect(contrastRatio(p.switchOn, surface), `on, ${surface}`).toBeGreaterThanOrEqual(AA_LARGE);
        expect(contrastRatio(p.switchOff, surface), `off, ${surface}`).toBeGreaterThanOrEqual(AA_LARGE);
      }
      expect(contrastRatio(p.switchOnThumb, p.switchOn)).toBeGreaterThanOrEqual(AA_LARGE);
      expect(contrastRatio(p.switchOffThumb, p.switchOff)).toBeGreaterThanOrEqual(AA_LARGE);
      expect(p.switchOn).not.toBe(p.success);
    });

    // A spinner over an uploading photo is a graphic, so 3:1, over the page and even a white photo.
    it('what sits on the scrim clears 3:1, whatever is under the scrim', () => {
      for (const behind of [p.background, '#FFFFFF', '#000000']) {
        expect(contrastRatio(p.textOnScrim, over(p.scrim, behind)), behind).toBeGreaterThanOrEqual(AA_LARGE);
      }
    });

    // Chat is body text, so both voices are held to 4.5:1 on their bubble.
    it('the words in a chat bubble meet AA (4.5:1), yours and theirs', () => {
      expect(contrastRatio(p.bubbleMineInk, p.bubbleMine)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio(p.bubbleTheirsInk, p.bubbleTheirs)).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    it('primary text on the background meets AA (4.5:1)', () => {
      expect(contrastRatio(p.textPrimary, p.background)).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    it('button label on the primary button meets AA (4.5:1)', () => {
      expect(contrastRatio(p.textOnPrimary, p.primary)).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    // Secondary text is body text too (previews, captions, times), so it is held to the full 4.5:1.
    it('secondary text on the background meets AA (4.5:1)', () => {
      expect(contrastRatio(p.textSecondary, p.background)).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    it('both kinds of text meet AA on the raised surfaces', () => {
      for (const surface of [p.surface, p.surfaceRaised]) {
        expect(contrastRatio(p.textPrimary, surface), surface).toBeGreaterThanOrEqual(AA_NORMAL);
        expect(contrastRatio(p.textSecondary, surface), surface).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    });

    it('both kinds of text meet AA on a card, where the glass sits over the page', () => {
      const card = over(p.glassFill, p.background);
      expect(contrastRatio(p.textPrimary, card)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio(p.textSecondary, card)).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    // An inactive tab label is secondary colour at 11 points, small text, on the bar's fill over the page.
    it('the tab labels meet AA on the bar, active and inactive', () => {
      const bar = over(p.barFill, p.background);
      expect(contrastRatio(p.primary, bar)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio(p.textSecondary, bar)).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    it('gold as text meets AA on the background and on a surface', () => {
      expect(contrastRatio(p.goldText, p.background)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio(p.goldText, p.surface)).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    // Text on gold (a pill, a podium place, a wrong-square letter) is small text, so 4.5:1; white is only 2.1:1 there.
    it('what is written on a gold fill meets AA (4.5:1)', () => {
      expect(contrastRatio(p.textOnGold, p.gold)).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    it('the brand/primary colour on the background meets at least AA large (3:1)', () => {
      expect(contrastRatio(p.primary, p.background)).toBeGreaterThanOrEqual(AA_LARGE);
    });

    it('the danger colour on the background meets at least AA large (3:1)', () => {
      expect(contrastRatio(p.danger, p.background)).toBeGreaterThanOrEqual(AA_LARGE);
    });

    // The unread dot and tab count are in the app's violet, with the number in the primary button label's colour.
    it('the unread badge stands out from the page (3:1) and its count is legible (4.5:1)', () => {
      expect(contrastRatio(p.primary, p.background)).toBeGreaterThanOrEqual(AA_LARGE);
      expect(contrastRatio(p.primary, over(p.barFill, p.background))).toBeGreaterThanOrEqual(AA_LARGE);
      expect(contrastRatio(p.textOnPrimary, p.primary)).toBeGreaterThanOrEqual(AA_NORMAL);
    });
  });
}

describe('palette — the values the design settled on', () => {
  it('keeps the dark page and its raised surfaces the ink taken almost to black', () => {
    expect(DARK.background).toBe('#100E1D');
    expect(DARK.surface).toBe('#1B192B');
    expect(DARK.surfaceRaised).toBe('#27243A');
    expect(DARK.gold).toBe('#F0C24A');
  });

  it('keeps the light page a white with a breath of violet, with white surfaces and a darker gold for words', () => {
    expect(LIGHT.background).toBe('#F6F4FD');
    expect(LIGHT.surface).toBe('#FFFFFF');
    expect(LIGHT.goldText).toBe('#8A6400');
    expect(LIGHT.gold).toBe('#EBA905');
  });

  it('keeps the brand the icon’s violet, deep by day and lifted by night, and writes in indigo ink', () => {
    expect(LIGHT.primary).toBe('#862BE2');
    expect(DARK.primary).toBe('#BF9BFE');
    expect(LIGHT.textPrimary).toBe('#14112E');
    expect(DARK.textOnPrimary).toBe(LIGHT.textPrimary);
  });
});
