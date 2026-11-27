import type { Palette } from './palette';
import { blend } from './tileTones';

/**
 * The ink the games page's small drawings are cut from (the join ticket and the rankings' podium), as on the website's
 * `.ink-art`: the page's ink with the marks in the card's colour as if punched through, dark by day and light by
 * night as the main button is, the stub a step softer.
 */
export interface InkArt {
  body: string;
  stub: string;
  marks: string;
  line: string;
}

export function inkArt(colors: Palette): InkArt {
  return {
    body: colors.textPrimary,
    stub: blend(colors.textPrimary, colors.surface, 0.78),
    marks: colors.surface,
    line: blend(colors.textPrimary, colors.surface, 0.42),
  };
}
