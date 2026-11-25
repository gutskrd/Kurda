/**
 * Hevalo's colours: nine hues, each in the same four steps, for light and dark, for drawings (a share card, a chapter of
 * the book). In the interface every hue is the warm page's own steps (`hueSteps`), since colour there belongs to the
 * theme (themes.ts). The steps sit at the same lightness in a perceptual space, so a
 * row reads as one family:
 *
 *   tint  the palest: a stamp's paper, a card's ground
 *   wash  a step deeper: an icon's ground, a pressed tint
 *   base  the hue itself, saturated: a picture's ground, a mark, a glow
 *   deep  its darkest (palest in the dark theme): words and glyphs on the tint or the wash
 *
 * `deep` on `tint` and `wash` clears 7:1 in both themes (hues.test.ts). `base` is for shapes, not words: gold and orange
 * are too light to write in on a pale ground.
 */
export const HUE_NAMES = ['violet', 'indigo', 'blue', 'teal', 'green', 'gold', 'orange', 'red', 'pink'] as const;
export type HueName = (typeof HUE_NAMES)[number];

export interface HueSteps {
  tint: string;
  wash: string;
  base: string;
  deep: string;
}

export type HueScheme = 'light' | 'dark';

export const HUES: Readonly<Record<HueScheme, Readonly<Record<HueName, HueSteps>>>> = {
  light: {
    violet: { tint: '#f4eeff', wash: '#e9dcfe', base: '#9a58e0', deep: '#4c2574' },
    indigo: { tint: '#edf0fe', wash: '#dbe2fe', base: '#626df5', deep: '#2c317f' },
    blue: { tint: '#e8f2ff', wash: '#d2e5fe', base: '#007df2', deep: '#003b7a' },
    teal: { tint: '#daf8f8', wash: '#b6f0ef', base: '#05a7a7', deep: '#004747' },
    green: { tint: '#e2f8e7', wash: '#c7efd0', base: '#02a855', deep: '#014a23' },
    gold: { tint: '#fcf0da', wash: '#f7e0b8', base: '#f2b100', deep: '#683b01' },
    orange: { tint: '#feede4', wash: '#fedbc6', base: '#f58028', deep: '#723400' },
    red: { tint: '#ffeceb', wash: '#fed9d5', base: '#de3b40', deep: '#721118' },
    pink: { tint: '#ffebf3', wash: '#fed6e8', base: '#d13d91', deep: '#6b1346' },
  },
  // By night the grounds are deep and the hue lifted and softened, since a saturated colour on a dark page glares.
  dark: {
    violet: { tint: '#2b203a', wash: '#3d2c53', base: '#c39afa', deep: '#e3d1fe' },
    indigo: { tint: '#1f243f', wash: '#2b3259', base: '#9baafe', deep: '#d0d9fe' },
    blue: { tint: '#15273e', wash: '#1a3658', base: '#7ab4fe', deep: '#c3ddff' },
    teal: { tint: '#002d2d', wash: '#013e3e', base: '#10caca', deep: '#9aeceb' },
    green: { tint: '#112d1a', wash: '#133f23', base: '#63ca84', deep: '#b4ebc1' },
    gold: { tint: '#332405', wash: '#473100', base: '#f8c153', deep: '#f5d69e' },
    orange: { tint: '#391f0e', wash: '#512a0f', base: '#f69557', deep: '#fed0b5' },
    red: { tint: '#3b1c1a', wash: '#542523', base: '#fe8b85', deep: '#fecdc9' },
    pink: { tint: '#381c2a', wash: '#4f253a', base: '#f38abe', deep: '#ffc9e1' },
  },
};

export function isHueName(v: unknown): v is HueName {
  return (HUE_NAMES as readonly unknown[]).includes(v);
}

/**
 * The warm page's steps in the same four: what every hue becomes in the interface, where colour is the theme's.
 * `deep` on `tint` and `wash` still clears 7:1.
 */
export const UI_GREY: Readonly<Record<HueScheme, HueSteps>> = {
  light: { tint: '#f4efe8', wash: '#eae3d9', base: '#8e8478', deep: '#2b2621' },
  dark: { tint: '#221f1c', wash: '#2e2a26', base: '#8f857a', deep: '#efe8df' },
};

/** A hue's four steps as the interface draws them (a ground, a mark, a stamp's paper): the warm page's steps. Drawings take `HUES`. */
export function hueSteps(scheme: HueScheme, _name: HueName): HueSteps {
  return UI_GREY[scheme];
}
