/**
 * Themed palettes (KUR-268). A glass-first visual language in light + dark:
 * frosted **glassmorphism / liquid-glass** surfaces are the hero (translucent
 * fills + a top sheen over a spatial gradient), with **claymorphic / neumorphic**
 * soft controls, minimalist spacing, and layered depth. Components read the
 * active `Palette` from ThemeProvider so both schemes stay in sync.
 */
import type { ColorScheme } from './appearance';

export interface Palette {
  scheme: ColorScheme;

  // brand
  primary: string;
  primaryStrong: string;
  accent: string;
  gold: string;
  danger: string;
  success: string;
  successFill: string; // soft tint behind a "correct" banner
  dangerFill: string; // soft tint behind a "wrong" banner

  // text
  textPrimary: string;
  textSecondary: string;
  textOnPrimary: string;

  // spatial background (a 3-stop gradient gives depth behind the glass)
  background: string;
  gradient: readonly [string, string, string];

  // glassmorphism / liquid glass — three blur tiers so we can go stronger on
  // floating surfaces (nav, modals, sheets) and lighter on flat, scrolled content
  // (cards, rows) where heavy blur costs performance and hurts readability.
  glassFill: string; // translucent tint painted over the blur
  glassBorder: string; // hairline edge — kept subtle (no "frost line")

  /*
   * What the edge of a piece of glass is made of.
   *
   * Not a line. Light bending through a lens leaves warm where it exits and
   * cool where it enters, with a bright catch along one edge — which is what
   * the recordings show, and what a hairline in a single grey never looks
   * like.
   *
   * Two stops each, because one hue per edge is a tint and the thing being
   * copied is dispersion: white light comes out of a lens spread, amber
   * running to orange on the way out and cyan running to violet on the way
   * in. The first of each pair sits at the boundary, the second just inside
   * it. Both are barely there on purpose — at full strength a rim like this
   * reads as a sticker.
   */
  lensWarm: readonly [string, string];
  lensCool: readonly [string, string];


  /*
   * The same two ends of the spectrum, for a glyph rather than a band.
   *
   * The rim colours are spread over three points and seen edge-on. These
   * are painted as a whole word a point and a bit to one side of itself,
   * nearly on top of the letter they are fringing, so they have to be far
   * stronger to register at all — at rim strength the fringe was in the DOM
   * and invisible on screen.
   */
  lensFringe: readonly [string, string];

  /*
   * The boundary between two regions of a screen — and only that.
   *
   * It used to be the rule between rows inside a card too, which is a line
   * drawn across the middle of a surface, and there are none of those left.
   * Three uses remain: the composer above the keyboard in a chat and in a
   * group thread, and the hairline under a header that content scrolls
   * beneath. Take those away and what you are writing runs into what you
   * have already sent.
   */
  separator: string;

  /*
   * What is left of claymorphism: one border colour.
   *
   * `clayFill` was a white-to-grey vertical gradient for a soft, puffy
   * button. Nothing has used it since the buttons stopped being puffy, and a
   * painted-on highlight is the thing to reach for when a control looks flat
   * and the thing not to reach for when it is meant to be glass.
   */
  clayBorder: string;
  softShadow: string; // outer drop shadow colour (spatial elevation)

  controlTrack: string; // inactive segmented / toggle track
}

export const LIGHT: Palette = {
  scheme: 'light',
  // Monochrome brand: near-black on a near-white app (SCRL-style). Functional
  // accents (gold XP, danger, success) stay coloured for meaning.
  primary: '#1A1A1A',
  primaryStrong: '#000000',
  accent: '#333333',
  gold: '#EBA905',
  danger: '#C0392B',
  success: '#2E7D32',
  successFill: '#E6F4EA',
  dangerFill: '#FBE9E7',

  textPrimary: '#141414',
  textSecondary: '#6B6B6B',
  textOnPrimary: '#FFFFFF',

  background: '#F3F3F3',
  gradient: ['#FBFBFB', '#F4F4F4', '#EDEDED'],

  // no blur behind it any more, so this is the whole surface: enough to hold
  // text and no more. It was 0.55 — more than half opaque, which is a milky
  // pane rather than a pane you can see through.
  glassFill: 'rgba(255,255,255,0.34)',
  glassBorder: 'rgba(255,255,255,0.45)',

  lensWarm: ['rgba(255,207,150,0.34)', 'rgba(255,146,94,0.20)'],
  lensCool: ['rgba(126,206,255,0.22)', 'rgba(150,132,255,0.28)'],

  lensFringe: ['rgba(240,110,40,0.55)', 'rgba(40,120,235,0.50)'],
  separator: 'rgba(20,20,20,0.07)',


  clayBorder: 'rgba(255,255,255,0.8)',
  softShadow: '#3A3A3A',

  controlTrack: 'rgba(0,0,0,0.05)',
};

export const DARK: Palette = {
  scheme: 'dark',
  // Monochrome brand: near-white on a near-black app (SCRL-style). Functional
  // accents (gold XP, danger, success) stay coloured for meaning.
  primary: '#FFFFFF',
  primaryStrong: '#FFFFFF',
  accent: '#CFCFCF',
  gold: '#F0C24A',
  danger: '#FF9C90',
  success: '#86E2A4',
  successFill: 'rgba(87,185,107,0.18)',
  dangerFill: 'rgba(255,120,105,0.16)',

  textPrimary: '#FFFFFF',
  textSecondary: '#9D9E9F',
  textOnPrimary: '#141414',

  background: '#0B0D10',
  // neutral near-black spatial gradient (no colour tint)
  gradient: ['#0E1014', '#0B0D10', '#101318'],

  glassFill: 'rgba(255,255,255,0.07)',
  glassBorder: 'rgba(255,255,255,0.14)',

  lensWarm: ['rgba(255,190,128,0.30)', 'rgba(255,132,80,0.18)'],
  lensCool: ['rgba(110,198,255,0.20)', 'rgba(138,118,255,0.26)'],

  lensFringe: ['rgba(255,150,70,0.60)', 'rgba(90,160,255,0.55)'],
  separator: 'rgba(255,255,255,0.08)',


  clayBorder: 'rgba(255,255,255,0.10)',
  softShadow: '#000000',

  controlTrack: 'rgba(255,255,255,0.11)',
};

export const PALETTES: Record<ColorScheme, Palette> = { light: LIGHT, dark: DARK };
