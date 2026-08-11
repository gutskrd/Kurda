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

  // glassmorphism / liquid glass
  blurTint: 'light' | 'dark';
  blurIntensity: number;
  glassFill: string; // translucent tint painted over the blur
  glassBorder: string; // hairline edge
  glassHighlight: string; // top sheen for the "liquid glass" catch-light

  // claymorphism / neumorphism (soft, puffy controls)
  clayFill: readonly [string, string]; // vertical gradient for a soft button
  clayBorder: string;
  softShadow: string; // outer drop shadow colour (spatial elevation)

  controlTrack: string; // inactive segmented / toggle track
}

export const LIGHT: Palette = {
  scheme: 'light',
  primary: '#2D6A4F',
  primaryStrong: '#1B4332',
  accent: '#D4A017',
  gold: '#EBA905',
  danger: '#C0392B',
  success: '#2E7D32',
  successFill: '#E6F4EA',
  dangerFill: '#FBE9E7',

  textPrimary: '#15241D',
  textSecondary: '#5C6B63',
  textOnPrimary: '#FFFFFF',

  background: '#E8F0EA',
  gradient: ['#F4F9F5', '#E6F0EA', '#DAE8EF'],

  blurTint: 'light',
  blurIntensity: 28,
  glassFill: 'rgba(255,255,255,0.55)',
  glassBorder: 'rgba(255,255,255,0.75)',
  glassHighlight: 'rgba(255,255,255,0.95)',

  clayFill: ['#FFFFFF', '#E7F0EB'],
  clayBorder: 'rgba(255,255,255,0.9)',
  softShadow: '#3E5147',

  controlTrack: 'rgba(21,36,29,0.06)',
};

export const DARK: Palette = {
  scheme: 'dark',
  primary: '#43B085',
  primaryStrong: '#2E8C68',
  accent: '#E8B23A',
  gold: '#F0C24A',
  danger: '#E5695B',
  success: '#4FB783',
  successFill: 'rgba(79,183,131,0.18)',
  dangerFill: 'rgba(229,105,91,0.18)',

  textPrimary: '#EAF2EE',
  textSecondary: '#9DB2AA',
  textOnPrimary: '#06120D',

  background: '#0B1410',
  // green-black → deep teal → indigo hint: a subtle spatial gradient
  gradient: ['#0C1712', '#0E1B24', '#141A2C'],

  blurTint: 'dark',
  blurIntensity: 44,
  glassFill: 'rgba(255,255,255,0.08)',
  glassBorder: 'rgba(255,255,255,0.16)',
  glassHighlight: 'rgba(255,255,255,0.32)',

  clayFill: ['#1C2B25', '#111F19'],
  clayBorder: 'rgba(255,255,255,0.10)',
  softShadow: '#000000',

  controlTrack: 'rgba(255,255,255,0.08)',
};

export const PALETTES: Record<ColorScheme, Palette> = { light: LIGHT, dark: DARK };
