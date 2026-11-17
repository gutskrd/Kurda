/**
 * A sheet of letter paper (the model is shared/src/letter-paper.ts): its tone, ruling, fibres and the pen, brush or
 * marker strokes on it, but never its text, which each app sets in its own type so Kurmancî and Soranî shape properly.
 * Drawn in page units (`PAPER_W` across) so writing lands on the lines at any size. The web, the phone, the admin
 * console and the server (for the home-screen widget, via sharp) all draw it, so it uses only a rectangle, paths and a
 * title: no patterns or filters.
 */
import { DEFAULT_PAPER, PAPER_H, PAPER_MARGIN_X, PAPER_PAGES, PAPER_RULE, PAPER_SIDE, PAPER_TOP, PAPER_W, STROKE_LOOK, paintColor, paperColors, strokePath } from '../letter-paper.js';
import type { LetterPaper, PaperStroke } from '../letter-paper.js';
import { escapeXml, hashOf, n, n2, prefixFor, seeded } from './svg.js';

export interface LetterPaperOptions {
  paper: LetterPaper;
  /** The strokes drawn on it, in page units. */
  strokes?: readonly PaperStroke[];
  /** The sheet's length in page units: one page by default, up to `PAPER_H * PAPER_PAGES` for a long letter. */
  length?: number;
  /**
   * Display size in pixels. Given one, the other follows the sheet; given both in another shape, the sheet fills them
   * from the top, where the writing starts (a widget shows a letter's top).
   */
  width?: number;
  height?: number;
  /** The faint paper fibres; on by default. */
  texture?: boolean;
  /** The accessible label; apps usually say who the letter is from beside it. */
  title?: string;
  idPrefix?: string;
}

/** Ruling widths in page units, faint enough to write over. */
const RULE_WIDTH = 2;
const GRID_WIDTH = 1.5;
const MARGIN_WIDTH = 2.5;
const DOT_SIZE = 5;
/** 'grid' squares and 'dotted' dots sit on the writing lines; squares are half a line apart. */
const SQUARE = PAPER_RULE / 2;

/** The y of every ruled line on a sheet `length` long, the last a line's height clear of the bottom. */
function ruledLines(length: number): number[] {
  const ys: number[] = [];
  for (let y = PAPER_TOP; y <= length - PAPER_RULE; y += PAPER_RULE) ys.push(y);
  return ys;
}

/** Positions every `step` from `start` in both directions within 0…`end`, so a pattern is centred on the writing. */
function across(start: number, step: number, end: number): number[] {
  const out: number[] = [];
  let first = start;
  while (first - step >= 0) first -= step;
  for (let v = first; v <= end; v += step) out.push(v);
  return out;
}

/** A few dozen faint fibres per page, the same on every sheet of a tone. */
function fibres(tone: string, length: number): string {
  const rand = seeded(`letter-paper-fibres-${tone}`);
  const count = Math.round((44 * length) / PAPER_H);
  let d = '';
  for (let i = 0; i < count; i++) {
    const [x, y] = [rand() * PAPER_W, rand() * length];
    const turn = rand() * Math.PI * 2;
    const len = 14 + rand() * 30;
    const [dx, dy] = [Math.cos(turn) * len, Math.sin(turn) * len];
    const bend = (rand() - 0.5) * len * 0.6;
    d += `M${n(x)} ${n(y)}q${n(dx / 2 - (dy / len) * bend)} ${n(dy / 2 + (dx / len) * bend)} ${n(dx)} ${n(dy)}`;
  }
  return d;
}

/** A sheet of letter paper with what is drawn on it, and no text. */
export function letterPaperSvg(opts: LetterPaperOptions): string {
  const paper = opts.paper ?? DEFAULT_PAPER;
  const colors = paperColors(paper);
  const length = opts.length ?? PAPER_H;
  if (!Number.isFinite(length) || length < PAPER_W / 4 || length > PAPER_H * PAPER_PAGES) {
    throw new RangeError(`art: a letter's paper is ${PAPER_W / 4}…${PAPER_H * PAPER_PAGES} units long, got ${String(length)}`);
  }
  for (const s of [opts.width, opts.height]) {
    if (s !== undefined && (!Number.isFinite(s) || s <= 0)) throw new RangeError(`art: size must be a positive number, got ${String(s)}`);
  }
  const strokes = opts.strokes ?? [];
  const width = opts.width ?? (opts.height !== undefined ? (opts.height * PAPER_W) / length : PAPER_W);
  const height = opts.height ?? (width * length) / PAPER_W;
  const fill = opts.width !== undefined && opts.height !== undefined && Math.abs(width / height - PAPER_W / length) > 0.001;
  const prefix = prefixFor(opts.idPrefix, 'letter-paper', paper.style, paper.tone, paper.ink, length, opts.texture === false ? 'smooth' : '', hashOf(JSON.stringify(strokes)));
  const parts: string[] = [`<rect width="${PAPER_W}" height="${n(length)}" fill="${colors.sheet}"/>`];

  if (opts.texture !== false) {
    parts.push(`<path d="${fibres(paper.tone, length)}" fill="none" stroke="${colors.fibre}" stroke-width="1.6" stroke-linecap="round"/>`);
  }
  if (paper.style === 'lined' || paper.style === 'margin') {
    const d = ruledLines(length).map((y) => `M0 ${n(y)}H${PAPER_W}`).join('');
    parts.push(`<path d="${d}" fill="none" stroke="${colors.rule}" stroke-width="${RULE_WIDTH}"/>`);
  }
  if (paper.style === 'margin') {
    parts.push(`<path d="M${PAPER_MARGIN_X} 0V${n(length)}" fill="none" stroke="${colors.margin}" stroke-width="${MARGIN_WIDTH}"/>`);
  }
  if (paper.style === 'grid') {
    const rows = across(PAPER_TOP, SQUARE, length).map((y) => `M0 ${n(y)}H${PAPER_W}`);
    const columns = across(PAPER_W / 2, SQUARE, PAPER_W).map((x) => `M${n(x)} 0V${n(length)}`);
    parts.push(`<path d="${[...rows, ...columns].join('')}" fill="none" stroke="${colors.grid}" stroke-width="${GRID_WIDTH}"/>`);
  }
  if (paper.style === 'dotted') {
    // Each dot is a round cap on a 0.1-unit step, so every dot on the page is one path.
    const columns = across(PAPER_W / 2, PAPER_RULE, PAPER_W).filter((x) => x >= PAPER_SIDE / 2 && x <= PAPER_W - PAPER_SIDE / 2);
    const d = ruledLines(length)
      .flatMap((y) => columns.map((x) => `M${n(x)} ${n(y)}h0.1`))
      .join('');
    parts.push(`<path d="${d}" fill="none" stroke="${colors.dot}" stroke-width="${DOT_SIZE}" stroke-linecap="round"/>`);
  }

  if (strokes.length > 0) {
    const lines: string[] = [];
    for (const s of strokes) {
      const d = strokePath(s);
      if (!d) continue;
      const look = STROKE_LOOK[s.tool] ?? STROKE_LOOK.pen;
      const color = paintColor(s.color, paper.tone);
      if (look.halo) lines.push(`<path d="${d}" stroke="${color}" stroke-width="${n(s.width * look.halo.width)}" stroke-opacity="${n2(look.halo.opacity)}"/>`);
      lines.push(`<path d="${d}" stroke="${color}" stroke-width="${n(s.width)}"${look.opacity === 1 ? '' : ` stroke-opacity="${n2(look.opacity)}"`}/>`);
    }
    parts.push(`<g fill="none" stroke-linecap="round" stroke-linejoin="round">${lines.join('')}</g>`);
  }

  const t = `${prefix}t`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(width)}" height="${n2(height)}" viewBox="0 0 ${PAPER_W} ${n(length)}"` +
    `${fill ? ' preserveAspectRatio="xMidYMin slice"' : ''} role="img" aria-labelledby="${t}">` +
    `<title id="${t}">${escapeXml(opts.title ?? 'A sheet of letter paper')}</title>${parts.join('')}</svg>`
  );
}
