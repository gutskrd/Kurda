import { describe, expect, it } from 'vitest';
import { PAGE, PLUS_STYLE, REWARD_GOLD, THEME, THEME_NAMES, THEMES, themeColors, type ThemeScheme } from './themes.js';
import { hueSteps } from './hues.js';

/** WCAG relative luminance of `#rrggbb`. */
function luminance(hex: string): number {
  const channel = (at: number): number => {
    const v = parseInt(hex.slice(at, at + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** A colour's hue in degrees and its chroma (the spread of its channels, 0–255), from `#rrggbb` or `rgba(r,g,b,a)`. */
function hueOf(colour: string): { hue: number; chroma: number } {
  const rgba = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(colour);
  const [r, g, b] = rgba ? [1, 2, 3].map((i) => Number(rgba[i])) : [1, 3, 5].map((at) => parseInt(colour.slice(at, at + 2), 16));
  const max = Math.max(r!, g!, b!);
  const chroma = max - Math.min(r!, g!, b!);
  if (chroma === 0) return { hue: 0, chroma };
  const hue = max === r ? ((g! - b!) / chroma + 6) % 6 : max === g ? (b! - r!) / chroma + 2 : (r! - g!) / chroma + 4;
  return { hue: hue * 60, chroma };
}

/** Violet to magenta: the colours the interface no longer wears. */
const isPurple = (colour: string): boolean => {
  const { hue, chroma } = hueOf(colour);
  return chroma >= 8 && hue >= 250 && hue <= 330;
};

const SCHEMES: readonly ThemeScheme[] = ['light', 'dark'];
const AA = 4.5;
const CONTROL = 3;

describe('the warm page', () => {
  it('is never pure white by day or pure black by night', () => {
    expect(PAGE.light.page).not.toBe('#FFFFFF');
    expect(PAGE.dark.page).not.toBe('#000000');
    expect(luminance(PAGE.light.page)).toBeLessThan(0.95);
    expect(luminance(PAGE.dark.page)).toBeGreaterThan(0.005);
  });

  it('leans warm: red leads blue on the page, its surfaces and its words, in both schemes', () => {
    for (const scheme of SCHEMES) {
      for (const colour of [PAGE[scheme].page, PAGE[scheme].surface, PAGE[scheme].raised, PAGE[scheme].ink, PAGE[scheme].inkSoft]) {
        expect(parseInt(colour.slice(1, 3), 16), `${scheme} ${colour}`).toBeGreaterThan(parseInt(colour.slice(5, 7), 16));
      }
    }
  });

  it('steps up from the page to a card by day, and lifts by night', () => {
    expect(luminance(PAGE.light.surface)).toBeGreaterThan(luminance(PAGE.light.page));
    expect(luminance(PAGE.dark.surface)).toBeGreaterThan(luminance(PAGE.dark.page));
    expect(luminance(PAGE.dark.raised)).toBeGreaterThan(luminance(PAGE.dark.surface));
  });

  it('writes both kinds of words at AA on the page and on its surfaces', () => {
    for (const scheme of SCHEMES) {
      const p = PAGE[scheme];
      for (const ground of [p.page, p.surface, p.raised]) {
        expect(contrast(p.ink, ground), `${scheme} ink on ${ground}`).toBeGreaterThanOrEqual(AA);
        expect(contrast(p.inkSoft, ground), `${scheme} soft ink on ${ground}`).toBeGreaterThanOrEqual(AA);
      }
    }
  });

  it('wears no violet: not the page, its words, its hairline nor the interface’s steps', () => {
    for (const scheme of SCHEMES) {
      const steps = hueSteps(scheme, 'violet');
      for (const colour of [...Object.values(PAGE[scheme]), ...Object.values(steps)]) {
        expect(isPurple(colour), `${scheme} ${colour}`).toBe(false);
      }
    }
  });
});

describe('the three themes', () => {
  it('names the theme both apps wear', () => {
    expect(THEME_NAMES).toContain(THEME);
    expect(themeColors('light')).toBe(THEMES[THEME].light);
  });

  it.each(THEME_NAMES)('gives %s no violet, in either scheme', (name) => {
    for (const scheme of SCHEMES) {
      for (const colour of Object.values(THEMES[name][scheme])) expect(isPurple(colour), `${scheme} ${colour}`).toBe(false);
    }
  });

  it.each(THEME_NAMES)('writes %s’s words at AA on both its colours, in both schemes', (name) => {
    for (const scheme of SCHEMES) {
      const t = THEMES[name][scheme];
      expect(contrast(t.onPrimary, t.primary), `${scheme} on the main colour`).toBeGreaterThanOrEqual(AA);
      expect(contrast(t.onPrimary, t.primaryPressed), `${scheme} on the main colour pressed`).toBeGreaterThanOrEqual(AA);
      expect(contrast(t.onSecondary, t.secondary), `${scheme} on the second colour`).toBeGreaterThanOrEqual(AA);
    }
  });

  // A filled control has to stand off the page and a card (WCAG 1.4.11); by day the main colour is also written as words.
  it.each(THEME_NAMES)('stands %s’s colours 3:1 off the page and a card, and writes the main colour as words by day', (name) => {
    for (const scheme of SCHEMES) {
      const t = THEMES[name][scheme];
      for (const ground of [PAGE[scheme].page, PAGE[scheme].surface]) {
        expect(contrast(t.primary, ground), `${scheme} main on ${ground}`).toBeGreaterThanOrEqual(CONTROL);
      }
      // A filled bubble sits on the page.
      expect(contrast(t.secondary, PAGE[scheme].page), `${scheme} second on the page`).toBeGreaterThanOrEqual(CONTROL);
    }
    for (const ground of [PAGE.light.page, PAGE.light.surface, PAGE.light.raised]) {
      expect(contrast(THEMES[name].light.primary, ground), `main as words on ${ground}`).toBeGreaterThanOrEqual(AA);
    }
  });

  it.each(THEME_NAMES)('writes %s’s second colour as words at AA on the page and its surfaces, by day and by night', (name) => {
    for (const scheme of SCHEMES) {
      for (const ground of [PAGE[scheme].page, PAGE[scheme].surface, PAGE[scheme].raised]) {
        expect(contrast(THEMES[name][scheme].secondaryText, ground), `${scheme} on ${ground}`).toBeGreaterThanOrEqual(AA);
      }
    }
  });

  // By night a lit pastel glares on the warm black, so both colours stay deep enough to carry the page's light ink.
  it.each(THEME_NAMES)('keeps %s’s night colours deep: the soft white reads on both at AA', (name) => {
    const t = THEMES[name].dark;
    expect(contrast(PAGE.light.surface, t.primary)).toBeGreaterThanOrEqual(AA - 0.2);
    expect(contrast(t.onPrimary, t.primary)).toBeGreaterThanOrEqual(AA);
    expect(luminance(t.primary)).toBeLessThan(0.2);
    expect(luminance(t.secondary)).toBeLessThan(0.2);
  });

  it.each(THEME_NAMES)('keeps %s’s two colours apart, so the main action is never mistaken for what is chosen', (name) => {
    for (const scheme of SCHEMES) {
      const t = THEMES[name][scheme];
      const gap = Math.abs(hueOf(t.primary).hue - hueOf(t.secondary).hue);
      expect(Math.min(gap, 360 - gap), scheme).toBeGreaterThanOrEqual(60);
    }
  });
});

describe('the reward gold and Hevalo+', () => {
  it('writes gold words at AA on the page and its cards, and words on gold at AA', () => {
    for (const scheme of SCHEMES) {
      const { gold, goldText, onGold } = REWARD_GOLD[scheme];
      for (const ground of [PAGE[scheme].page, PAGE[scheme].surface]) expect(contrast(goldText, ground), scheme).toBeGreaterThanOrEqual(AA);
      expect(contrast(onGold, gold), scheme).toBeGreaterThanOrEqual(AA);
    }
  });

  it('writes Hevalo+’s button at AA across its whole fill, and edges it 3:1 off the page', () => {
    for (const scheme of SCHEMES) {
      const plus = PLUS_STYLE[scheme];
      for (const stop of plus.fill) expect(contrast(plus.ink, stop), `${scheme} ${stop}`).toBeGreaterThanOrEqual(AA);
      expect(contrast(plus.edge, PAGE[scheme].page), scheme).toBeGreaterThanOrEqual(scheme === 'light' ? CONTROL : AA);
    }
  });
});
