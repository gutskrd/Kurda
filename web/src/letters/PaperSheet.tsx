import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_PAPER,
  NOTE_TEXT,
  PAPER_H,
  PAPER_MARGIN_X,
  PAPER_RULE,
  PAPER_SIDE,
  PAPER_TEXT,
  PAPER_TOP,
  PAPER_W,
  letterPaperSvg,
  paintColor,
  paperColors,
  type LetterDecor,
  type LetterPaper,
  type PaperNote,
  type PaperStroke,
} from '@kurda/shared';
import { PAGE_FOOT } from './paper';
import './paper.css';

/**
 * A sheet of letter paper on the screen, as it is read and as it is written
 * on: the paper and its drawing (the shared letterPaperSvg) at the back, the
 * body set on its ruled lines in the ink, and the notes where they were
 * placed.
 *
 * The sheet is measured in the page's own units. Its frame is a size
 * container, so one unit is a thousandth of the sheet's width (`--u`), and
 * every length on it — the lines, the type, the margins, a note's place — is
 * so many units: the letter is the same letter at 340 pixels and at 640.
 * Only the type has a floor, so a long letter stays readable on a phone; it
 * still keeps to one line of writing per ruled line.
 *
 * The body sits on the lines whatever font the browser has for its script.
 * Where a font puts its baseline in a line is measured once the sheet is on
 * the page (`useBaseline`), and the first line is moved so that baseline
 * falls just above the first rule, as handwriting does.
 */

/** Half a page: the shortest sheet a letter is read on, and the step a longer one grows by, as paper folds. */
export const HALF_PAGE = PAPER_H / 2;

/** How far above its rule a line of writing sits, in page units: a hair, so the letters stand on the line and their tails cross it. */
const LIFT = 5;

/** Where the writing begins on 'margin' paper: a little after its red line. */
export const MARGIN_WRITING = PAPER_MARGIN_X + 30;

/** Whether the page is drawn dark (theme/theme.ts puts the scheme on the root element), followed as it changes. */
export function useScheme(): 'light' | 'dark' {
  const read = (): 'light' | 'dark' => (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  const [scheme, setScheme] = useState(read);
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => setScheme(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return scheme;
}

/**
 * The sheet's own custom properties: its colours from the shared
 * paperColors, the page's measures in units for the stylesheet to multiply
 * by `--u`, and how far the writing is inset.
 */
export function sheetStyle(paper: LetterPaper, scheme: 'light' | 'dark'): React.CSSProperties {
  const c = paperColors(paper, scheme);
  return {
    '--sheet': c.sheet,
    '--sheet-ink': c.ink,
    '--sheet-muted': c.muted,
    '--sheet-edge': c.edge,
    '--page-u': PAPER_H,
    '--rule-u': PAPER_RULE,
    '--top-u': PAPER_TOP - LIFT,
    '--side-u': PAPER_SIDE,
    '--start-u': paper.style === 'margin' ? MARGIN_WRITING : PAPER_SIDE,
    '--type-u': PAPER_TEXT,
  } as React.CSSProperties;
}

/** A note's place, size, colour and turn on its sheet. */
export function noteStyle(note: PaperNote, tone: LetterPaper['tone']): React.CSSProperties {
  return {
    '--x': note.x,
    '--y': note.y,
    '--note-u': NOTE_TEXT[note.size],
    '--turn': `${note.turn}deg`,
    color: paintColor(note.color, tone),
  } as React.CSSProperties;
}

/** How far down the page the drawing and the notes reach, in page units, with the page's foot margin under them. */
export function reachOf(strokes: readonly PaperStroke[], notes: readonly PaperNote[]): number {
  let reach = 0;
  for (const s of strokes) {
    for (let i = 1; i < s.points.length; i += 2) reach = Math.max(reach, (s.points[i] as number) + s.width / 2);
  }
  // a note is measured as a line or two of its type below its centre
  for (const n of notes) reach = Math.max(reach, n.y + NOTE_TEXT[n.size]);
  return reach > 0 ? reach + PAPER_SIDE : 0;
}

/**
 * Keeps the first line of writing on the first rule: measures, in the
 * sheet's own type, where a line's baseline falls, and gives it to the
 * stylesheet as `--baseline`. Measured again whenever the sheet changes
 * width, since the type is sized by it. Until it is measured (and where
 * nothing is laid out at all) the stylesheet's own estimate stands.
 */
export function useBaseline(sheet: React.RefObject<HTMLElement | null>, probe: React.RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const el = sheet.current;
    const mark = probe.current?.firstElementChild as HTMLElement | null | undefined;
    if (!el || !mark) return;
    const measure = (): void => {
      const at = mark.offsetTop;
      if (at > 0) el.style.setProperty('--baseline', `${at}px`);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [sheet, probe]);
}

/** The line used to find the baseline: one letter and a mark with no height of its own, which sits on the baseline. */
export function BaselineProbe({ probeRef }: { probeRef: React.RefObject<HTMLSpanElement | null> }): React.JSX.Element {
  return (
    <span className="paper-probe" ref={probeRef} aria-hidden="true">
      <span className="paper-probe-mark" />x
    </span>
  );
}

/**
 * The paper and its drawing, behind everything on the sheet. Decoration
 * when nothing is drawn; when something is, the picture is named by
 * `label` (its own title), so a screen reader hears that the letter has a
 * drawing. It never takes the pointer, so its title is never a tooltip.
 */
export function PaperArt({ paper, strokes, length, label }: { paper: LetterPaper; strokes: readonly PaperStroke[]; length: number; label?: string }): React.JSX.Element {
  const id = `lp${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const named = Boolean(label) && strokes.length > 0;
  const svg = useMemo(
    () => ({
      __html: letterPaperSvg({ paper, strokes, length: Math.min(PAGE_FOOT, Math.max(PAPER_W / 4, length)), title: named ? label : undefined, idPrefix: id }),
    }),
    [paper, strokes, length, label, named, id],
  );
  return <div className="paper-art" aria-hidden={named ? undefined : true} dangerouslySetInnerHTML={svg} />;
}

/**
 * A letter as it is read: on its own paper, its drawing and its notes where
 * the writer put them. The sheet is half a page at the least, and grows by
 * half pages with what is on it — the words, and anything drawn or placed
 * further down — so a short letter is a short sheet and a long one runs on.
 */
export function LetterOnPaper({
  body,
  decor,
  drawnLabel,
  notesLabel,
}: {
  body: string;
  decor: LetterDecor | null;
  /** what the drawing is, for whoever cannot see it */
  drawnLabel: string;
  /** what the list of notes is called */
  notesLabel: string;
}): React.JSX.Element {
  const paper = decor?.paper ?? DEFAULT_PAPER;
  const strokes = decor?.strokes ?? NONE_DRAWN;
  const notes = decor?.notes ?? NONE_PLACED;
  const scheme = useScheme();
  const sheet = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLParagraphElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  useBaseline(sheet, probe);
  const words = useUnitsTall(text, sheet);
  const reach = Math.max(words, reachOf(strokes, notes));
  const length = Math.min(PAGE_FOOT, Math.max(HALF_PAGE, Math.ceil(reach / HALF_PAGE) * HALF_PAGE));
  return (
    <div className="paper-frame">
      <div className={`paper-sheet is-read${length > PAPER_H ? ' is-two' : ''}`} ref={sheet} style={{ ...sheetStyle(paper, scheme), '--length-u': length } as React.CSSProperties}>
        <PaperArt paper={paper} strokes={strokes} length={length} label={drawnLabel} />
        <BaselineProbe probeRef={probe} />
        <p className="paper-body" ref={text} dir="auto">
          {body}
        </p>
        {notes.length > 0 && (
          <ul className="paper-notes" aria-label={notesLabel}>
            {notes.map((n, i) => (
              <li key={i} className="paper-note" style={noteStyle(n, paper.tone)} dir="auto">
                {n.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const NONE_DRAWN: PaperStroke[] = [];
const NONE_PLACED: PaperNote[] = [];

/** How tall an element is in page units, measured against its sheet's width, followed as either changes; 0 where nothing is laid out. */
export function useUnitsTall(el: React.RefObject<HTMLElement | null>, sheet: React.RefObject<HTMLElement | null>): number {
  const [units, setUnits] = useState(0);
  useLayoutEffect(() => {
    const node = el.current;
    const page = sheet.current;
    if (!node || !page) return;
    const measure = (): void => {
      const width = page.clientWidth;
      setUnits(width > 0 ? Math.ceil((node.offsetHeight * PAPER_W) / width) : 0);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    observer.observe(page);
    return () => observer.disconnect();
  }, [el, sheet]);
  return units;
}
