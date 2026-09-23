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
   * like. All three are barely there on purpose: at a 2pt band this is a
   * suggestion of colour, and at full strength it would read as a sticker.
   */
  lensWarm: string;
  lensCool: string;
  lensSpecular: string;

  separator: string; // faint divider between rows inside a surface

  // claymorphism / neumorphism (soft, puffy controls)
  clayFill: readonly [string, string]; // vertical gradient for a soft button
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

  lensWarm: 'rgba(255,186,120,0.30)',
  lensCool: 'rgba(120,170,255,0.26)',
  lensSpecular: 'rgba(255,255,255,0.50)',
  separator: 'rgba(20,20,20,0.07)',

  clayFill: ['#FFFFFF', '#EFEFEF'],
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

  lensWarm: 'rgba(255,170,100,0.26)',
  lensCool: 'rgba(110,165,255,0.24)',
  lensSpecular: 'rgba(255,255,255,0.22)',
  separator: 'rgba(255,255,255,0.08)',

  clayFill: ['#1E1E1E', '#151515'],
  clayBorder: 'rgba(255,255,255,0.10)',
  softShadow: '#000000',

  controlTrack: 'rgba(255,255,255,0.11)',
};

export const PALETTES: Record<ColorScheme, Palette> = { light: LIGHT, dark: DARK };
