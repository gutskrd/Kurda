import { describe, expect, it } from 'vitest';
import { ACCENT, ANSWER, PAGE, REWARD_GOLD } from '@kurda/shared';
import { DARK, LIGHT, type Palette } from './palette';
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

    it('button label on the main button, in the accent, meets AA (4.5:1)', () => {
      expect(contrastRatio(p.textOnAccent, p.accent)).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    // The main button is the one strong thing on a screen, so it stands off the page and a card as a control must.
    it('the main button stands 3:1 off the page and a card', () => {
      for (const ground of [p.background, p.surface]) expect(contrastRatio(p.accent, ground), ground).toBeGreaterThanOrEqual(AA_LARGE);
    });

    // A chosen chip, tab or segment stands out from the track the others sit on as a control must (WCAG 1.4.11) by its
    // edge in the accent, and its word reads at AA on whatever it sits on.
    it('a chosen chip stands 3:1 off the track, on the page and on a card, with its word at AA', () => {
      for (const surface of [p.background, p.surface]) {
        expect(contrastRatio(p.chosenEdge, over(p.controlTrack, surface)), surface).toBeGreaterThanOrEqual(AA_LARGE);
        expect(contrastRatio(p.chosenInk, over(p.chosenFill, surface)), surface).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    });

    // A pick among small pills (a year, a filter) is a tint of the accent, its word at AA.
    it('a picked pill’s word meets AA on its fill, on the page and on a card', () => {
      for (const surface of [p.background, p.surface]) {
        expect(contrastRatio(p.pickedInk, over(p.pickedFill, surface)), surface).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    });

    // The chosen tab's glyph and label are drawn in the accent on the bar, over its own faint capsule.
    it('the chosen tab, in the accent, meets AA on the bar', () => {
      expect(contrastRatio(p.accentText, over(p.barFill, p.background))).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    // A link or a chosen word is the accent as text, read at AA on the page and its surfaces.
    it('the accent as words meets AA on the page and its surfaces', () => {
      for (const surface of [p.background, p.surface, p.surfaceRaised]) expect(contrastRatio(p.accentText, surface), surface).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    // The main button stands on its darker lip, which its words still read on as it is pressed through.
    it('a main button’s lip sits darker than its fill', () => {
      expect(contrastRatio(p.textOnAccent, p.accentLip)).toBeGreaterThanOrEqual(AA_LARGE);
      expect(contrastRatio(p.accentLip, '#FFFFFF')).toBeGreaterThan(contrastRatio(p.accent, '#FFFFFF'));
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

    // The unread dot and tab count are in the ink, with the number in the primary button label's colour.
    it('the unread badge stands out from the page (3:1) and its count is legible (4.5:1)', () => {
      expect(contrastRatio(p.primary, p.background)).toBeGreaterThanOrEqual(AA_LARGE);
      expect(contrastRatio(p.primary, over(p.barFill, p.background))).toBeGreaterThanOrEqual(AA_LARGE);
      expect(contrastRatio(p.textOnPrimary, p.primary)).toBeGreaterThanOrEqual(AA_NORMAL);
    });
  });
}

/** Violet to magenta, from `#rrggbb` or `rgba(r,g,b,a)`: the colours the interface no longer wears. */
function isPurple(colour: string): boolean {
  const rgba = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(colour);
  const { r, g, b } = rgba ? { r: Number(rgba[1]), g: Number(rgba[2]), b: Number(rgba[3]) } : hexToRgb(colour);
  const max = Math.max(r, g, b);
  const chroma = max - Math.min(r, g, b);
  if (chroma < 8) return false;
  const hue = 60 * (max === r ? ((g - b) / chroma + 6) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4);
  return hue >= 250 && hue <= 330;
}

describe('palette — the values the design settled on', () => {
  it('tints a chosen chip with the accent, its word and edge in the accent, in both schemes', () => {
    for (const p of [LIGHT, DARK]) {
      expect(p.chosenFill, p.scheme).toBe(p.accentSoft);
      expect(p.chosenInk, p.scheme).toBe(p.accentText);
      expect(p.pickedFill, p.scheme).toBe(p.accentSoft);
      expect(p.cardRim, p.scheme).toBe('transparent');
    }
  });

  it('sits on the slate page from @kurda/shared, never pure white by day or pure black by night', () => {
    expect(LIGHT.background).toBe(PAGE.light.page);
    expect(DARK.background).toBe(PAGE.dark.page);
    expect(DARK.background).toBe('#131C20');
    expect(LIGHT.background).not.toBe('#FFFFFF');
    expect(LIGHT.surface).toBe(PAGE.light.surface);
    expect(DARK.surface).toBe(PAGE.dark.surface);
    expect(DARK.surfaceRaised).toBe(PAGE.dark.raised);
  });

  it('wears one accent on what you press and where you are, gold for what is earned, and its own colours for right and wrong', () => {
    for (const [p, scheme] of [[LIGHT, 'light'], [DARK, 'dark']] as const) {
      expect(p.accent).toBe(ACCENT[scheme].fill);
      expect(p.accentLip).toBe(ACCENT[scheme].lip);
      expect(p.accentText).toBe(ACCENT[scheme].text);
      expect(p.bubbleMine).toBe(p.accent);
      expect(p.switchOn).toBe(p.accent);
      expect(p.gold).toBe(REWARD_GOLD[scheme].gold);
      expect(p.primary).toBe(p.textPrimary);
      expect(p.success).toBe(ANSWER[scheme].right.text);
      expect(p.danger).toBe(ANSWER[scheme].wrong.text);
      expect(p.success).not.toBe(p.accent);
      // no second colour beside the accent
      expect(Object.keys(p).filter((k) => /secondary/i.test(k) && k !== 'textSecondary')).toEqual([]);
    }
  });

  it('has no violet anywhere in either palette', () => {
    for (const p of [LIGHT, DARK] as Palette[]) {
      for (const [key, value] of Object.entries(p)) {
        for (const colour of Array.isArray(value) ? value : [value]) {
          if (typeof colour === 'string' && /^(#|rgb)/.test(colour)) expect(isPurple(colour), `${p.scheme}.${key} ${colour}`).toBe(false);
        }
      }
    }
  });
});
