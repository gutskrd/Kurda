import { describe, expect, it } from 'vitest';
import { ACCENT, ANSWER, PAGE, PLUS_STYLE, REWARD_GOLD, accentColors, type ThemeScheme } from './themes.js';
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

/** Violet to magenta: the colours the interface does not wear. */
const isPurple = (colour: string): boolean => {
  const { hue, chroma } = hueOf(colour);
  return chroma >= 8 && hue >= 250 && hue <= 330;
};

const SCHEMES: readonly ThemeScheme[] = ['light', 'dark'];
const AA = 4.5;
const CONTROL = 3;

describe('the slate page', () => {
  it('is the reference slate by night and a soft white by day, never pure white or black', () => {
    expect(PAGE.dark.page).toBe('#131C20');
    expect(PAGE.light.page).not.toBe('#FFFFFF');
    expect(luminance(PAGE.light.page)).toBeLessThan(0.95);
    expect(luminance(PAGE.light.page)).toBeGreaterThan(0.9);
  });

  it('leans cool: blue leads red on the page, its surfaces and its words, in both schemes', () => {
    for (const scheme of SCHEMES) {
      const p = PAGE[scheme];
      for (const colour of [p.page, p.surface, p.raised, p.high, p.ink, p.inkSoft]) {
        expect(parseInt(colour.slice(5, 7), 16), `${scheme} ${colour}`).toBeGreaterThan(parseInt(colour.slice(1, 3), 16));
      }
    }
  });

  it('steps its surfaces away from the page: lighter by night, greyer by day', () => {
    const night = PAGE.dark;
    expect(luminance(night.surface)).toBeGreaterThan(luminance(night.page));
    expect(luminance(night.raised)).toBeGreaterThan(luminance(night.surface));
    expect(luminance(night.high)).toBeGreaterThan(luminance(night.raised));
    const day = PAGE.light;
    expect(luminance(day.surface)).toBeLessThan(luminance(day.page));
    expect(luminance(day.raised)).toBeLessThan(luminance(day.surface));
    expect(luminance(day.high)).toBeLessThan(luminance(day.raised));
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

describe('the one accent', () => {
  it('is green in both schemes, and the scheme’s own', () => {
    for (const scheme of SCHEMES) {
      const { hue, chroma } = hueOf(ACCENT[scheme].fill);
      expect(hue, scheme).toBeGreaterThan(130);
      expect(hue, scheme).toBeLessThan(160);
      expect(chroma, scheme).toBeGreaterThan(100);
      expect(accentColors(scheme)).toBe(ACCENT[scheme]);
    }
  });

  // Main buttons say a word in the text size, bold: 4.5:1, as small words must be.
  it('writes words on its fill at AA, and on its lip too, in both schemes', () => {
    for (const scheme of SCHEMES) {
      const a = ACCENT[scheme];
      expect(contrast(a.ink, a.fill), `${scheme} on the fill`).toBeGreaterThanOrEqual(AA);
      expect(contrast(a.ink, a.lip), `${scheme} on the lip`).toBeGreaterThanOrEqual(CONTROL);
    }
  });

  // A filled control stands off what it sits on (WCAG 1.4.11), and the accent as words reads at AA.
  it('stands 3:1 off the page and its surfaces, and reads as words at AA on them', () => {
    for (const scheme of SCHEMES) {
      const a = ACCENT[scheme];
      const p = PAGE[scheme];
      for (const ground of [p.page, p.surface, p.raised]) {
        expect(contrast(a.fill, ground), `${scheme} fill on ${ground}`).toBeGreaterThanOrEqual(CONTROL);
        expect(contrast(a.text, ground), `${scheme} text on ${ground}`).toBeGreaterThanOrEqual(AA);
      }
    }
  });

  it('sits its lip below its fill, so a button reads as raised and presses into it', () => {
    for (const scheme of SCHEMES) {
      const a = ACCENT[scheme];
      expect(luminance(a.lip), scheme).toBeLessThan(luminance(a.fill));
      expect(Math.abs(hueOf(a.lip).hue - hueOf(a.fill).hue), scheme).toBeLessThan(8);
    }
  });
});

describe('right and wrong answers', () => {
  it('read at AA on the page and its surfaces', () => {
    for (const scheme of SCHEMES) {
      for (const ground of [PAGE[scheme].page, PAGE[scheme].surface, PAGE[scheme].raised]) {
        expect(contrast(ANSWER[scheme].right.text, ground), `${scheme} right on ${ground}`).toBeGreaterThanOrEqual(AA);
        expect(contrast(ANSWER[scheme].wrong.text, ground), `${scheme} wrong on ${ground}`).toBeGreaterThanOrEqual(AA);
      }
    }
  });

  // A right answer is never mistaken for the button that checks it: another green, a step apart in hue and lightness.
  it('keeps a right answer’s green apart from the accent', () => {
    for (const scheme of SCHEMES) {
      const right = ANSWER[scheme].right.text;
      expect(right, scheme).not.toBe(ACCENT[scheme].text);
      expect(Math.abs(hueOf(right).hue - hueOf(ACCENT[scheme].fill).hue), scheme).toBeGreaterThanOrEqual(10);
      expect(Math.abs(hueOf(right).chroma - hueOf(ACCENT[scheme].fill).chroma), scheme).toBeGreaterThanOrEqual(40);
    }
  });
});

describe('the reward gold and Hevalo+', () => {
  it('writes gold words at AA on the page and its cards, and words on gold at AA', () => {
    for (const scheme of SCHEMES) {
      const { gold, goldText, onGold } = REWARD_GOLD[scheme];
      for (const ground of [PAGE[scheme].page, PAGE[scheme].surface, PAGE[scheme].raised]) expect(contrast(goldText, ground), scheme).toBeGreaterThanOrEqual(AA);
      expect(contrast(onGold, gold), scheme).toBeGreaterThanOrEqual(AA);
    }
  });

  it('keeps the gold apart from the accent', () => {
    for (const scheme of SCHEMES) {
      const gap = Math.abs(hueOf(REWARD_GOLD[scheme].gold).hue - hueOf(ACCENT[scheme].fill).hue);
      expect(Math.min(gap, 360 - gap), scheme).toBeGreaterThanOrEqual(60);
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
