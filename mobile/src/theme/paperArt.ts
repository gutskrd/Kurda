import type { Palette } from './palette';
import { blend } from './tileTones';

/**
 * The paper the games page's small drawings are cut from (the join ticket and the rankings' podium), as on the
 * website's `.paper-art`: light paper with its marks in ink, the stub a step deeper; by night the paper stays light,
 * by day it is the page's lightest paper with a fine edge so it does not melt into the card.
 */
export interface PaperArt {
  paper: string;
  deep: string;
  ink: string;
  line: string;
  /** The edge round the paper, or none by night. */
  edge: string | null;
}

export function paperArt(colors: Palette, dark: boolean): PaperArt {
  if (dark) {
    return {
      paper: blend(colors.textPrimary, colors.surface, 0.9),
      deep: blend(colors.textPrimary, colors.surface, 0.76),
      ink: colors.surface,
      line: blend(colors.textPrimary, colors.surface, 0.48),
      edge: null,
    };
  }
  // By day the page's own colour, a step lighter than the card it sits on, edged as the website's strong border.
  const edge = blend(colors.textPrimary, colors.surface, 0.22);
  return {
    paper: colors.background,
    deep: blend(colors.textPrimary, colors.background, 0.08),
    ink: colors.textPrimary,
    line: edge,
    edge,
  };
}
