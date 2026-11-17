/**
 * The paper a letter is written on, what is drawn on it, the little notes
 * stuck to it, and the letter widget on a phone's home screen.
 *
 * A pen pal's letter (letters.ts) is a page you make your own: plain, lined,
 * with a red margin, squared or dotted; cream, white, rose, sky, sage,
 * lavender, kraft or a night-blue sheet; written in one of eight inks. On it
 * you may draw with a pen, a brush or a marker, and stick short notes of text
 * anywhere you like, turned a little as a hand would place them.
 *
 * Everything is measured in the page's own units (`PAPER_W` wide), whatever
 * size it is shown at, so the website, the phone, the admin console and the
 * server's widget picture all lay a letter out alike. The page is drawn by
 * art/letter-paper.ts (`letterPaperSvg`) with its drawing but never its text:
 * the body and the notes are set by each app in its own type, so Kurmancî and
 * Soranî shape properly. `paperColors` is the one place the colours come from.
 *
 * What a drawing may be is checked here (`checkLetterDecor`), the same check
 * in the apps before sending and on the server before storing. Drawings only
 * travel between pen pals: the first letter to a stranger may choose its
 * paper and carry notes, but nothing drawn. Notes are held to the letter's
 * own rules (`letterProblem`: no way to be reached, no link), and the server
 * runs its word filter over them as over the body.
 *
 * The widget shows the newest letter a pen pal sent you, or the one you pinned
 * to it, on its paper with the writer's pigeon in a corner. It reads with a
 * token of its own (`Authorization: Widget <token>`) that can see nothing else
 * of the account; the shapes it is sent are at the end of this file.
 */
import { letterProblem } from './letters.js';
import { normalizeKurdish } from './kurdish-text.js';
import { isRecord, stripControlChars } from './sanitize.js';
import { mix } from './art/svg.js';

// ───────────────────────────────────────────────────────────── the page

/** The page's width in its own units: a letter is laid out in these, whatever size it shows at. */
export const PAPER_W = 1000;
/** One page's height: 1 : √2, as real writing paper is. */
export const PAPER_H = 1414;
/** How many pages a letter's drawing may run over: a long letter continues onto a second sheet. */
export const PAPER_PAGES = 2;
/** The distance between ruled lines: the body's line height, its text sitting on them. */
export const PAPER_RULE = 56;
/** Where the first line of writing sits (its baseline). */
export const PAPER_TOP = 150;
/** The writing's inset from the left and right edges. */
export const PAPER_SIDE = 90;
/** Where the 'margin' style draws its soft red line: the writing begins a little after it. */
export const PAPER_MARGIN_X = 140;
/** The body's type size on the page, in page units: a comfortable hand on the ruled lines. */
export const PAPER_TEXT = 34;

export const PAPER_STYLES = ['plain', 'lined', 'margin', 'grid', 'dotted'] as const;
export type PaperStyle = (typeof PAPER_STYLES)[number];

export const PAPER_TONES = ['cream', 'white', 'rose', 'sky', 'sage', 'lavender', 'kraft', 'night'] as const;
export type PaperTone = (typeof PAPER_TONES)[number];

/** The writing colours. */
export const INKS = ['navy', 'charcoal', 'sepia', 'forest', 'crimson', 'plum', 'teal', 'gold'] as const;
export type Ink = (typeof INKS)[number];

/** The drawing colours: the inks, so a line can be drawn in the writing's own colour, and six paints. */
export const PAINTS = [...INKS, 'sun', 'leaf', 'rosehip', 'sea', 'sand', 'white'] as const;
export type Paint = (typeof PAINTS)[number];

/** pen: a fine line; brush: wide, soft paint; marker: translucent, like a highlighter. */
export const DRAW_TOOLS = ['pen', 'brush', 'marker'] as const;
export type DrawTool = (typeof DRAW_TOOLS)[number];

export interface LetterPaper {
  style: PaperStyle;
  tone: PaperTone;
  ink: Ink;
}

/** The paper a letter is on until its writer chooses another. */
export const DEFAULT_PAPER: LetterPaper = { style: 'lined', tone: 'cream', ink: 'navy' };

/** One line drawn on the page. `points` is x,y,x,y… in whole page units. */
export interface PaperStroke {
  tool: DrawTool;
  color: Paint;
  width: number;
  points: number[];
}

export const NOTE_SIZES = ['s', 'm', 'l'] as const;
export type NoteSize = (typeof NOTE_SIZES)[number];

/** A short note stuck on the page: its centre in page units, turned −15…15 degrees. */
export interface PaperNote {
  text: string;
  x: number;
  y: number;
  size: NoteSize;
  color: Paint;
  turn: number;
}

/** A letter's paper, drawing and notes. A letter without one (null) is on `DEFAULT_PAPER` with nothing drawn. */
export interface LetterDecor {
  paper: LetterPaper;
  strokes: PaperStroke[];
  notes: PaperNote[];
}

// ───────────────────────────────────────────────────────────── limits

/** Lines drawn on one letter. */
export const DECOR_STROKES_MAX = 300;
/** Points in all the lines of one letter together. */
export const DECOR_POINTS_MAX = 8000;
/** How wide each tool draws, in page units, at its thinnest and widest. */
export const STROKE_WIDTHS: Readonly<Record<DrawTool, readonly [min: number, max: number]>> = {
  pen: [2, 10],
  brush: [12, 60],
  marker: [8, 30],
};
/** Notes on one letter. */
export const NOTES_MAX = 8;
/** A note's length in characters, after it is trimmed. */
export const NOTE_MIN = 1;
export const NOTE_MAX = 80;
/** How far a note may be turned either way, in degrees. */
export const NOTE_TURN_MAX = 15;
/** A note's type size in page units, for each of its sizes. */
export const NOTE_TEXT: Readonly<Record<NoteSize, number>> = { s: 30, m: 42, l: 58 };
/**
 * The whole decor as compact JSON, in bytes. Every point costs about ten
 * bytes, so near the points limit a drawing may reach this first: the apps
 * show either as the page being full (`decorBytes`).
 */
export const DECOR_BYTES_MAX = 64 * 1024;

/** How each tool lays its paint down: the line's opacity, and a wider, fainter edge round it for the brush's softness. */
export const STROKE_LOOK: Readonly<Record<DrawTool, { opacity: number; halo: { width: number; opacity: number } | null }>> = {
  pen: { opacity: 1, halo: null },
  brush: { opacity: 0.9, halo: { width: 1.3, opacity: 0.28 } },
  marker: { opacity: 0.45, halo: null },
};

// ───────────────────────────────────────────────────────────── colours

/** The sheets. Each tone is a real paper colour, warm or cool but never loud; 'night' is a deep blue-black sheet. */
const SHEETS: Readonly<Record<PaperTone, string>> = {
  cream: '#fbf3e1',
  white: '#fcfcf9',
  rose: '#fbeae6',
  sky: '#e9f1f9',
  sage: '#eaf0e1',
  lavender: '#f0ebf7',
  kraft: '#dcc29b',
  night: '#161d33',
};

/** What the faint lines on each sheet are drawn in, before they are mixed into the sheet: a blue-grey on the pale papers, brown on kraft, moonlight on night. */
const RULE_TINT: Readonly<Record<PaperTone, string>> = {
  cream: '#6f86ad',
  white: '#6f86ad',
  rose: '#9a7590',
  sky: '#5f82b3',
  sage: '#6f8a72',
  lavender: '#7d74ad',
  kraft: '#6b4f2c',
  night: '#a8b8e6',
};

/** The inks as they are on pale paper; on kraft they are darkened and on night lightened until they read well (`inkOn`). */
const INK_DAY: Readonly<Record<Ink, string>> = {
  navy: '#1f3a6e',
  charcoal: '#34373d',
  sepia: '#6a4322',
  forest: '#2a5938',
  crimson: '#9e2230',
  plum: '#5c2a63',
  teal: '#125d63',
  gold: '#7d5810',
};

/** The same inks written on the night sheet: their light, moonlit selves. */
const INK_NIGHT: Readonly<Record<Ink, string>> = {
  navy: '#aec4ff',
  charcoal: '#e4e7ee',
  sepia: '#ecc9a2',
  forest: '#a6dcb4',
  crimson: '#ffa3ab',
  plum: '#e2b6ec',
  teal: '#8fded9',
  gold: '#f3d37c',
};

/** The paints that are not inks: the same on every sheet. */
const PAINT_FIXED: Readonly<Record<Exclude<Paint, Ink>, string>> = {
  sun: '#f5c33f',
  leaf: '#5aa84c',
  rosehip: '#de4459',
  sea: '#3b8bd0',
  sand: '#d8b886',
  white: '#ffffff',
};

/** The least contrast the writing has against its sheet: the level asked of body text (WCAG AA). */
export const INK_CONTRAST_MIN = 4.5;

function channel(hex: string, at: number): number {
  const c = parseInt(hex.slice(at, at + 2), 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** A colour's relative luminance, as the contrast guidelines measure it. */
export function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

/** The contrast between two colours, from 1 (the same) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * Moves `hex` toward black (or white) a step at a time until it has at least
 * `min` contrast with `against`: the ink keeps its hue, and only becomes as
 * much darker or lighter as the sheet needs.
 */
function readableOn(hex: string, against: string, min: number, toward: '#000000' | '#ffffff'): string {
  let c = hex;
  for (let t = 0.06; contrastRatio(c, against) < min && t <= 1; t += 0.06) c = mix(hex, toward, t);
  return c;
}

const isNight = (tone: PaperTone): boolean => tone === 'night';

/** An ink as it is written on a tone of paper. */
export function inkOn(ink: Ink, tone: PaperTone): string {
  const sheet = SHEETS[tone];
  return isNight(tone) ? readableOn(INK_NIGHT[ink], sheet, INK_CONTRAST_MIN, '#ffffff') : readableOn(INK_DAY[ink], sheet, INK_CONTRAST_MIN, '#000000');
}

/** A drawing colour on a tone of paper: an ink is the ink as written there, so a line drawn in it matches the writing. */
export function paintColor(paint: Paint, tone: PaperTone = DEFAULT_PAPER.tone): string {
  return (INKS as readonly string[]).includes(paint) ? inkOn(paint as Ink, tone) : PAINT_FIXED[paint as Exclude<Paint, Ink>];
}

/** Every colour a sheet of letter paper is drawn with. */
export interface PaperColors {
  /** the paper itself */
  sheet: string;
  /** the ruled lines: faint, there to write along and no more */
  rule: string;
  /** the squares of 'grid', fainter still, there being more of them */
  grid: string;
  /** the dots of 'dotted', a little stronger, being small */
  dot: string;
  /** the margin line of 'margin', a soft red */
  margin: string;
  /** the writing */
  ink: string;
  /** writing that says less: the date, a placeholder (at least 3 : 1 against the sheet) */
  muted: string;
  /** the fibres in the paper, barely there */
  fibre: string;
  /** a hairline round the sheet where it meets the screen behind it */
  edge: string;
}

/**
 * The colours of a sheet of paper. A paper keeps its tone on a dark screen —
 * it is paper, not a theme — so `scheme` only changes the hairline round it:
 * a pale sheet needs one on a white screen, the night sheet on a dark one.
 */
export function paperColors(paper: LetterPaper, scheme: 'light' | 'dark' = 'light'): PaperColors {
  const tone = PAPER_TONES.includes(paper.tone) ? paper.tone : DEFAULT_PAPER.tone;
  const ink = INKS.includes(paper.ink) ? paper.ink : DEFAULT_PAPER.ink;
  const sheet = SHEETS[tone];
  const tint = RULE_TINT[tone];
  const night = isNight(tone);
  const written = inkOn(ink, tone);
  return {
    sheet,
    rule: mix(sheet, tint, night ? 0.2 : tone === 'kraft' ? 0.3 : 0.27),
    grid: mix(sheet, tint, night ? 0.14 : tone === 'kraft' ? 0.2 : 0.18),
    dot: mix(sheet, tint, night ? 0.36 : 0.52),
    margin: mix(sheet, night ? '#ef8a8a' : '#d9534f', night ? 0.4 : tone === 'kraft' ? 0.55 : 0.45),
    ink: written,
    muted: readableOn(mix(written, sheet, 0.4), sheet, 3, night ? '#ffffff' : '#000000'),
    fibre: mix(sheet, night ? '#ffffff' : '#7a6440', night ? 0.035 : 0.07),
    edge: night ? mix(sheet, '#ffffff', scheme === 'dark' ? 0.18 : 0.1) : mix(sheet, '#000000', scheme === 'dark' ? 0.04 : 0.1),
  };
}

// ───────────────────────────────────────────────────────────── checking a decor

/** Why a letter's paper, drawing or notes cannot be sent as they are. */
export type DecorProblem =
  /** not a decor at all: a missing or unknown paper, tool or colour, a number that is not one, an odd count of coordinates */
  | 'shape'
  /** more than `DECOR_BYTES_MAX` as JSON */
  | 'too-big'
  | 'too-many-strokes'
  | 'too-many-points'
  /** a line wider or thinner than its tool draws (`STROKE_WIDTHS`) */
  | 'stroke-width'
  /** a point or a note off the page (`simplifyStroke` keeps lines on it) */
  | 'off-page'
  | 'too-many-notes'
  | 'note-empty'
  | 'note-long'
  /** a note, or the notes read together, hold a way to be reached */
  | 'note-contact'
  | 'note-link'
  /** a first letter to a stranger: nothing drawn travels until two people are pen pals */
  | 'drawing-not-here';

export type DecorCheck = { ok: true; value: LetterDecor } | { ok: false; problem: DecorProblem };

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

/** The bytes a string takes as UTF-8, counted without an encoder (not every phone's engine has one). */
function utf8Length(text: string): number {
  let bytes = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    bytes += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** How many bytes a decor takes as it is sent and stored: the measure `DECOR_BYTES_MAX` is held to. */
export function decorBytes(decor: LetterDecor): number {
  return utf8Length(JSON.stringify(decor));
}

/** How a note's text is kept: control characters out, one spelling of each letter, spaces collapsed, trimmed. */
export function cleanNoteText(text: string): string {
  return normalizeKurdish(stripControlChars(text));
}

const PAGE_BOTTOM = PAPER_H * PAPER_PAGES;
const onPage = (x: number, y: number): boolean => x >= 0 && x <= PAPER_W && y >= 0 && y <= PAGE_BOTTOM;

/**
 * Checks a letter's decor as it came, and gives it back as it will be kept:
 * only the fields there are, numbers in whole units (a turn to a tenth of a
 * degree), each note's text cleaned. `strokes: false` is a first letter to a
 * stranger, which may not carry a drawing. The cheap counts come before the
 * long walks over every point, so an oversized decor is refused at once.
 */
export function checkLetterDecor(raw: unknown, opts: { strokes: boolean }): DecorCheck {
  const fail = (problem: DecorProblem): DecorCheck => ({ ok: false, problem });
  if (!isRecord(raw) || !isRecord(raw.paper)) return fail('shape');
  const { style, tone, ink } = raw.paper;
  if (!oneOf(PAPER_STYLES, style) || !oneOf(PAPER_TONES, tone) || !oneOf(INKS, ink)) return fail('shape');
  const rawStrokes = raw.strokes ?? [];
  const rawNotes = raw.notes ?? [];
  if (!Array.isArray(rawStrokes) || !Array.isArray(rawNotes)) return fail('shape');
  if (rawStrokes.length > DECOR_STROKES_MAX) return fail('too-many-strokes');
  if (rawStrokes.length > 0 && !opts.strokes) return fail('drawing-not-here');
  if (rawNotes.length > NOTES_MAX) return fail('too-many-notes');

  const strokes: PaperStroke[] = [];
  let total = 0;
  for (const s of rawStrokes) {
    if (!isRecord(s) || !oneOf(DRAW_TOOLS, s.tool) || !oneOf(PAINTS, s.color) || !isNum(s.width) || !Array.isArray(s.points)) return fail('shape');
    const pts = s.points as unknown[];
    if (pts.length < 2 || pts.length % 2 !== 0) return fail('shape');
    total += pts.length / 2;
    if (total > DECOR_POINTS_MAX) return fail('too-many-points');
    const width = Math.round(s.width);
    const [min, max] = STROKE_WIDTHS[s.tool];
    if (width < min || width > max) return fail('stroke-width');
    const points: number[] = new Array<number>(pts.length);
    for (let i = 0; i < pts.length; i += 2) {
      const [x, y] = [pts[i], pts[i + 1]];
      if (!isNum(x) || !isNum(y)) return fail('shape');
      const [rx, ry] = [Math.round(x), Math.round(y)];
      if (!onPage(rx, ry)) return fail('off-page');
      points[i] = rx;
      points[i + 1] = ry;
    }
    strokes.push({ tool: s.tool, color: s.color, width, points });
  }

  const notes: PaperNote[] = [];
  for (const m of rawNotes) {
    if (!isRecord(m) || typeof m.text !== 'string' || !oneOf(NOTE_SIZES, m.size) || !oneOf(PAINTS, m.color) || !isNum(m.x) || !isNum(m.y) || !isNum(m.turn)) {
      return fail('shape');
    }
    if (Math.abs(m.turn) > NOTE_TURN_MAX) return fail('shape');
    // the text is measured before it is cleaned too: a megabyte of spaces is not a note
    if (m.text.length > NOTE_MAX * 8) return fail('note-long');
    const text = cleanNoteText(m.text);
    if ([...text].length < NOTE_MIN) return fail('note-empty');
    // a way to be reached or a link is named before the length, as with a letter, so the writer knows what to take out
    const problem = letterProblem(text);
    if (problem === 'contact') return fail('note-contact');
    if (problem === 'link') return fail('note-link');
    if ([...text].length > NOTE_MAX) return fail('note-long');
    const [x, y] = [Math.round(m.x), Math.round(m.y)];
    if (!onPage(x, y)) return fail('off-page');
    notes.push({ text, x, y, size: m.size, color: m.color, turn: Math.round(m.turn * 10) / 10 || 0 });
  }
  // a number cut into pieces, one on each note, is still a number
  const together = letterProblem(notes.map((n) => n.text).join(' '));
  if (notes.length > 1 && together === 'contact') return fail('note-contact');
  if (notes.length > 1 && together === 'link') return fail('note-link');

  const value: LetterDecor = { paper: { style, tone, ink }, strokes, notes };
  if (decorBytes(value) > DECOR_BYTES_MAX) return fail('too-big');
  return { ok: true, value };
}

/** The error code the server answers a decor problem with: 'note-contact' is DECOR_NOTE_CONTACT. */
export function decorErrorCode(problem: DecorProblem): string {
  return `DECOR_${problem.toUpperCase().replace(/-/g, '_')}`;
}

/** Whether a decor says nothing a letter without one would not: the default paper, nothing drawn, no notes. Kept as no decor at all. */
export function isPlainDecor(decor: LetterDecor): boolean {
  const p = decor.paper;
  return decor.strokes.length === 0 && decor.notes.length === 0 && p.style === DEFAULT_PAPER.style && p.tone === DEFAULT_PAPER.tone && p.ink === DEFAULT_PAPER.ink;
}

/** The paper a letter is on, from its decor or the default. */
export const paperOf = (decor: LetterDecor | null | undefined): LetterPaper => decor?.paper ?? DEFAULT_PAPER;

// ───────────────────────────────────────────────────────────── drawing a line

/** A coordinate as written into a path: a tenth of a unit at most, never "-0". */
function num(v: number): string {
  const x = Math.round(v * 10) / 10;
  return String(Object.is(x, -0) ? 0 : x);
}

/**
 * The SVG path of a line through its points, as a smooth curve: from the
 * first point, a quadratic curve through each point in turn to the middle of
 * the next step, and a straight last piece to where the line ended. A line of
 * a single point is a dot (a step a tenth of a unit long, round-capped).
 */
export function strokePath(stroke: Pick<PaperStroke, 'points'>): string {
  const p = stroke.points;
  const count = Math.floor(p.length / 2);
  if (count === 0) return '';
  const x = (i: number): number => p[i * 2] as number;
  const y = (i: number): number => p[i * 2 + 1] as number;
  let d = `M${num(x(0))} ${num(y(0))}`;
  if (count === 1) return `${d}h0.1`;
  if (count === 2) return `${d}L${num(x(1))} ${num(y(1))}`;
  for (let i = 1; i < count - 1; i++) d += `Q${num(x(i))} ${num(y(i))} ${num((x(i) + x(i + 1)) / 2)} ${num((y(i) + y(i + 1)) / 2)}`;
  return `${d}L${num(x(count - 1))} ${num(y(count - 1))}`;
}

/** The distance from point p to the segment a–b. */
function offSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const [dx, dy] = [bx - ax, by - ay];
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * A line as it is worth keeping: every point in whole units and on the page,
 * the points a finger lays down nearly on top of each other dropped (closer
 * than `minStep`), and those that lie on a straight run between their
 * neighbours (within `tolerance`) dropped too. The first and last points are
 * always kept. The apps run this on each line as it is finished.
 */
export function simplifyStroke(points: readonly number[], opts: { minStep?: number; tolerance?: number } = {}): number[] {
  const minStep = opts.minStep ?? 4;
  const tolerance = opts.tolerance ?? 1.2;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    const [x, y] = [points[i] as number, points[i + 1] as number];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    pts.push([Math.max(0, Math.min(PAPER_W, Math.round(x))), Math.max(0, Math.min(PAGE_BOTTOM, Math.round(y)))]);
  }
  if (pts.length <= 2) return pts.flat();
  const spaced: Array<[number, number]> = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    const [last, here] = [spaced[spaced.length - 1]!, pts[i]!];
    if (Math.hypot(here[0] - last[0], here[1] - last[1]) >= minStep) spaced.push(here);
  }
  // the line ends where the finger lifted, even if that was a hair from the last point kept
  const end = pts[pts.length - 1]!;
  const kept = spaced[spaced.length - 1]!;
  if (kept[0] !== end[0] || kept[1] !== end[1]) {
    if (spaced.length > 1 && Math.hypot(end[0] - kept[0], end[1] - kept[1]) < minStep) spaced[spaced.length - 1] = end;
    else spaced.push(end);
  }
  // straight runs: Ramer–Douglas–Peucker, iteratively, so a long line cannot run the stack out
  const keep = new Array<boolean>(spaced.length).fill(false);
  keep[0] = true;
  keep[spaced.length - 1] = true;
  const spans: Array<[number, number]> = [[0, spaced.length - 1]];
  while (spans.length) {
    const [a, b] = spans.pop()!;
    let [far, at] = [0, -1];
    for (let i = a + 1; i < b; i++) {
      const d = offSegment(spaced[i]![0], spaced[i]![1], spaced[a]![0], spaced[a]![1], spaced[b]![0], spaced[b]![1]);
      if (d > far) [far, at] = [d, i];
    }
    if (at !== -1 && far > tolerance) {
      keep[at] = true;
      spans.push([a, at], [at, b]);
    }
  }
  return spaced.filter((_, i) => keep[i]).flat();
}

// ───────────────────────────────────────────────────────────── the widget

/** Phones one account may have a widget on: a new one past this takes the place of the one longest unused. */
export const WIDGET_TOKENS_MAX = 5;
/** The longest excerpt a widget is sent, in characters. */
export const WIDGET_EXCERPT_MAX = 240;
/** Requests one widget may make in an hour, all its routes together: a widget refreshes a few times an hour. */
export const WIDGET_HITS_PER_HOUR = 120;
/** The widget picture's size, in points per side, and the pixel density it may be asked at. */
export const WIDGET_IMAGE = { minSide: 40, maxSide: 800, maxScale: 4, maxPixels: 1600 } as const;
/** The four skies the empty widget's window can show, matching the phone's hour. */
export const WIDGET_SKIES = ['day', 'dawn', 'dusk', 'night'] as const;
export type WidgetSky = (typeof WIDGET_SKIES)[number];

/** The letter a widget shows: whose, the start of it, and the paper it is on. Its text is set by the widget itself, over the picture. */
export interface WidgetLetter {
  id: string;
  threadId: string;
  from: { name: string; bird: number };
  /** the letter's opening, at most `WIDGET_EXCERPT_MAX` characters, cut at a word; '' when the words are not shown */
  excerpt: string;
  sentAt: string;
  paper: LetterPaper;
  /** the letter is written right to left (Soranî, in Arabic script) */
  rtl: boolean;
  /** something is drawn on it */
  drawn: boolean;
}

/** What a widget is told each time it refreshes. */
export interface WidgetFeed {
  /** null when no pen pal's letter has come yet */
  letter: WidgetLetter | null;
  /** the letter is the one pinned, not the newest */
  pinned: boolean;
  showWords: boolean;
  /** seconds until the widget should ask again; the app asks it to reload sooner when a letter comes */
  refreshAfter: number;
}

/** What the account chooses for its widgets: a letter pinned to them for good, or null for always the newest; and whether they show the words. */
export interface WidgetPrefs {
  pinnedLetterId: string | null;
  showWords: boolean;
}

/** The widget page in letter settings: the choices, the letter the widgets show now, and on how many phones there is one. */
export interface WidgetSettings extends WidgetPrefs {
  letter: WidgetLetter | null;
  pinned: boolean;
  widgets: number;
}

/** A widget token, shown once when it is made: the phone keeps it where its widget can read it. */
export interface WidgetTokenResult {
  token: string;
}

/** Whether text is written right to left: its first letter is in Arabic or Hebrew script. */
export function isRtlText(text: string): boolean {
  const first = /\p{L}/u.exec(text);
  return first !== null && /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}]/u.test(first[0]);
}

/**
 * The opening of a letter for a widget: the whole of it when it is short, or
 * up to the last space before `max` characters with an ellipsis, so no word
 * is cut in half (a word longer than half the room is cut where it must be).
 */
export function widgetExcerpt(body: string, max: number = WIDGET_EXCERPT_MAX): string {
  const text = body.trim();
  const chars = [...text];
  if (chars.length <= max) return text;
  const room = chars.slice(0, max - 1).join('');
  const space = room.search(/\s\S*$/);
  const cut = space > room.length / 2 ? room.slice(0, space) : room;
  return `${cut.trimEnd()}…`;
}
