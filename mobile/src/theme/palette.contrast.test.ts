import { describe, expect, it } from 'vitest';
import { DARK, LIGHT } from './palette';
import { AA_LARGE, AA_NORMAL, contrastRatio, hexToRgb, type Rgb } from '../a11y/contrast';

/**
 * A translucent fill as it actually appears: laid over what is behind it.
 *
 * The bar and the glass are rgba, and a contrast ratio is between two opaque
 * colours, so the pane is measured where it sits — over the page.
 */
function over(fill: string, behind: string): Rgb {
  const base = hexToRgb(behind);
  const m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(fill);
  if (!m) return hexToRgb(fill);
  const a = Number(m[4]);
  const mix = (top: number, bottom: number) => Math.round(top * a + bottom * (1 - a));
  return { r: mix(Number(m[1]), base.r), g: mix(Number(m[2]), base.g), b: mix(Number(m[3]), base.b) };
}

/**
 * WCAG AA contrast audit for the app palette (KUR-266). The monochrome scheme
 * must stay readable in both modes: body text hits AA (4.5:1) on the app
 * background and on primary buttons; secondary/muted text and the brand colour
 * (used mostly for large headings) hit at least AA large-text (3:1). Text sits
 * on translucent glass cards over the gradient, but the raw background is the
 * lowest-contrast surface, so it's the conservative check.
 */
for (const p of [LIGHT, DARK]) {
  describe(`palette contrast — ${p.scheme}`, () => {
    it('primary text on the background meets AA (4.5:1)', () => {
      expect(contrastRatio(p.textPrimary, p.background)).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    it('button label on the primary button meets AA (4.5:1)', () => {
      expect(contrastRatio(p.textOnPrimary, p.primary)).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    /*
     * Secondary text is body text too — a message preview, a caption, a time
     * — so it is held to the full 4.5:1 rather than the large-text 3:1 it
     * used to be allowed.
     */
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

    /*
     * The tab bar: an inactive label is the secondary colour at 11pt, which
     * is small text, on the bar's own fill over the page.
     */
    it('the tab labels meet AA on the bar, active and inactive', () => {
      const bar = over(p.barFill, p.background);
      expect(contrastRatio(p.primary, bar)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio(p.textSecondary, bar)).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    it('gold as text meets AA on the background and on a surface', () => {
      expect(contrastRatio(p.goldText, p.background)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio(p.goldText, p.surface)).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    it('the brand/primary colour on the background meets at least AA large (3:1)', () => {
      expect(contrastRatio(p.primary, p.background)).toBeGreaterThanOrEqual(AA_LARGE);
    });

    it('the danger colour on the background meets at least AA large (3:1)', () => {
      expect(contrastRatio(p.danger, p.background)).toBeGreaterThanOrEqual(AA_LARGE);
    });

    /*
     * The unread dot and the count on a tab are drawn in the gold that text
     * uses — the fill gold is too pale to see on the light page — and the
     * number on them in the colour a primary button's label is.
     */
    it('the unread badge stands out from the page (3:1) and its count is legible (4.5:1)', () => {
      expect(contrastRatio(p.goldText, p.background)).toBeGreaterThanOrEqual(AA_LARGE);
      expect(contrastRatio(p.goldText, over(p.barFill, p.background))).toBeGreaterThanOrEqual(AA_LARGE);
      expect(contrastRatio(p.textOnPrimary, p.goldText)).toBeGreaterThanOrEqual(AA_NORMAL);
    });
  });
}

describe('palette — the values the design settled on', () => {
  it('keeps the dark page and its raised surfaces near-black', () => {
    expect(DARK.background).toBe('#0B0D10');
    expect(DARK.surface).toBe('#14171C');
    expect(DARK.surfaceRaised).toBe('#1B1F26');
    expect(DARK.gold).toBe('#F0C24A');
  });

  it('keeps the light page near-white, with white surfaces and a darker gold for words', () => {
    expect(LIGHT.background).toBe('#F6F6F5');
    expect(LIGHT.surface).toBe('#FFFFFF');
    expect(LIGHT.goldText).toBe('#8A6400');
    expect(LIGHT.gold).toBe('#EBA905');
  });
});
