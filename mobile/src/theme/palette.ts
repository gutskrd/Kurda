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

  blurTint: 'light',
  blurIntensity: 28,
  glassFill: 'rgba(255,255,255,0.62)',
  glassBorder: 'rgba(255,255,255,0.8)',
  glassHighlight: 'rgba(255,255,255,0.95)',

  clayFill: ['#FFFFFF', '#EFEFEF'],
  clayBorder: 'rgba(255,255,255,0.9)',
  softShadow: '#3A3A3A',

  controlTrack: 'rgba(0,0,0,0.06)',
};

export const DARK: Palette = {
  scheme: 'dark',
  // Monochrome brand: near-white on a near-black app (SCRL-style). Functional
  // accents (gold XP, danger, success) stay coloured for meaning.
  primary: '#F4F5F4',
  primaryStrong: '#FFFFFF',
  accent: '#CFCFCF',
  gold: '#F0C24A',
  danger: '#E5695B',
  success: '#4FB783',
  successFill: 'rgba(79,183,131,0.18)',
  dangerFill: 'rgba(229,105,91,0.18)',

  textPrimary: '#F3F4F3',
  textSecondary: '#9A9A9A',
  textOnPrimary: '#0A0A0A',

  background: '#0A0A0B',
  // neutral near-black spatial gradient (no colour tint)
  gradient: ['#0D0D0E', '#0A0A0B', '#111112'],

  blurTint: 'dark',
  blurIntensity: 44,
  glassFill: 'rgba(255,255,255,0.06)',
  glassBorder: 'rgba(255,255,255,0.14)',
  glassHighlight: 'rgba(255,255,255,0.28)',

  clayFill: ['#1E1E1E', '#151515'],
  clayBorder: 'rgba(255,255,255,0.10)',
  softShadow: '#000000',

  controlTrack: 'rgba(255,255,255,0.08)',
};

export const PALETTES: Record<ColorScheme, Palette> = { light: LIGHT, dark: DARK };
