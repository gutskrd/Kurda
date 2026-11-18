import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  LETTER_MAX,
  NOTE_MAX,
  NOTES_MAX,
  PAPER_H,
  PAPER_RULE,
  PAPER_TOP,
  PAPER_W,
  STROKE_LOOK,
  checkLetterDecor,
  letterProblem,
  paintColor,
  simplifyStroke,
  strokePath,
  type DecorProblem,
  type DrawTool,
  type LetterDecor,
  type LetterPaper,
  type LetterProblem,
  type Paint,
  type PaperNote,
  type PaperStroke,
} from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { useHistory } from '../images/useHistory';
import { prefersReducedMotion } from '../lib/motion';
import { useMemoryOwner } from '../lib/useApi';
import { BaselineProbe, PaperArt, noteStyle, sheetStyle, useBaseline, useScheme, useUnitsTall } from './PaperSheet';
import { DrawPanel, PaperPanel, TextPanel, ToolSwitch, type Tool } from './PaperTools';
import { DECOR_PROBLEM, NO_DRAWING, PAGE_FOOT, START_WIDTH, onPage, pagePoint, pointsLeft, rememberPaper, rememberedPaper, roomForNote, turnFor, widthFor, type Drawing } from './paper';
import { draftOf, keepDraft } from './drafts';

/**
 * Writing a letter on its own paper: the body typed on the ruled lines, with Write, Draw, Text and Paper tools below
 * and the send. The sheet is one page, two when the writing runs on. Drawing uses pointer events in page units, smoothed
 * on lift (shared simplifyStroke and strokePath), and the sheet captures the gesture so the page never scrolls. Notes
 * are dragged or moved with the arrow keys. Edits can be undone and redone, with a drag or slider turn as one step.
 *
 * Drawings are only for pen pals: a first letter to a stranger (`canDraw` false) shows Draw closed with the reason.
 * Problems the server would refuse are shown while writing, so nothing is refused after sending.
 */

/** A letter as it is sent: the words and their paper. */
export interface LetterToSend {
  body: string;
  decor: LetterDecor;
}

/** What to tell the writer about a letter that cannot go as it is, in the order they should mend it. */
const PROBLEM: Record<LetterProblem, MessageKey> = {
  short: 'letters.problem.short',
  long: 'letters.problem.long',
  link: 'letters.problem.link',
  contact: 'letters.problem.contact',
};

/** What a note may not say, as it is typed: a way to be reached or a link (its length the field itself keeps to). */
function noteProblem(text: string): DecorProblem | null {
  const problem = letterProblem(text);
  if (problem === 'contact') return 'note-contact';
  if (problem === 'link') return 'note-link';
  return null;
}

/** The pointer taken for the sheet's own, where the browser allows it. */
function capture(target: Element, pointerId: number): void {
  try {
    target.setPointerCapture(pointerId);
  } catch {
    // a pointer the browser no longer knows: the line still draws, uncaptured
  }
}

/** One page unit on the screen, in pixels: a thousandth of the sheet's width, followed as it changes. */
function useUnit(sheet: React.RefObject<HTMLElement | null>): number {
  const [unit, setUnit] = useState(0);
  useLayoutEffect(() => {
    const el = sheet.current;
    if (!el) return;
    const measure = (): void => setUnit(el.clientWidth / PAPER_W);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [sheet]);
  return unit;
}

export function LetterComposer({
  label,
  sendLabel,
  busy,
  onSend,
  onCancel,
  error,
  autoFocus = false,
  paper: startPaper,
  canDraw,
  draft: place,
}: {
  label: string;
  /** what sending it is called, when it is not your own bird that takes it */
  sendLabel?: string;
  busy: boolean;
  onSend: (letter: LetterToSend) => void;
  /** putting the paper away again, for a letter that was started by choice */
  onCancel?: () => void;
  /** what the server answered, when it refused */
  error?: string | null;
  /** opened by asking to write: the pen goes to the paper, and the paper is brought into view */
  autoFocus?: boolean;
  /** the paper it opens on: the one last written on */
  paper?: LetterPaper;
  /** whether this letter may carry a drawing: not a first letter to a stranger */
  canDraw: boolean;
  /** The draft key (letters/drafts.ts), where the paper's content is kept while writing and restored on reopening. */
  draft?: string;
}): React.JSX.Element {
  const t = useT();
  const id = useId();
  const scheme = useScheme();
  const who = useMemoryOwner();
  const form = useRef<HTMLFormElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const writing = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLParagraphElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const line = useRef<SVGPathElement>(null);
  const halo = useRef<SVGPathElement>(null);
  const newNote = useRef<HTMLInputElement>(null);
  const noteButtons = useRef<Array<HTMLButtonElement | null>>([]);

  // a letter left unsent here before opens as it was left: its words, its paper, and what was drawn and placed on it
  const [kept] = useState(() => (place ? draftOf(who, place) : null));
  const [body, setBody] = useState(kept?.body ?? '');
  const [tried, setTried] = useState(false);
  const [tool, setTool] = useState<Tool>('write');
  const [paper, setPaper] = useState<LetterPaper>(() => kept?.paper ?? startPaper ?? rememberedPaper(who));
  const history = useHistory<Drawing>(kept ? { strokes: canDraw ? kept.strokes : [], notes: kept.notes } : NO_DRAWING);
  const drawing = history.present;
  const [pen, setPen] = useState<DrawTool>('pen');
  // the colour drawn in follows the ink until another is chosen
  const [paintPick, setPaintPick] = useState<Paint | null>(null);
  const paint: Paint = paintPick ?? paper.ink;
  const [widths, setWidths] = useState(START_WIDTH);
  const [selected, setSelected] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [full, setFull] = useState(false);
  const [decorProblem, setDecorProblem] = useState<DecorProblem | null>(null);
  // a note just put on the paper, or one just taken off, moves the focus to where the work goes on
  const [focusNote, setFocusNote] = useState<{ index: number | null } | null>(null);

  useBaseline(sheet, probe);
  const unit = useUnit(sheet);
  const need = useUnitsTall(mirror, sheet);
  // the drawing and the notes keep a second sheet once they are on it, as the words do
  let deepest = 0;
  for (const s of drawing.strokes) for (let i = 1; i < s.points.length; i += 2) deepest = Math.max(deepest, s.points[i] as number);
  for (const n of drawing.notes) deepest = Math.max(deepest, n.y);
  const pages = need > PAPER_H || deepest > PAPER_H ? 2 : 1;
  const length = Math.max(pages * PAPER_H, need);
  const foot = Math.min(length, PAGE_FOOT);

  useEffect(() => {
    if (!autoFocus) return;
    writing.current?.focus({ preventScroll: true });
    form.current?.scrollIntoView?.({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [autoFocus]);

  useEffect(() => {
    if (!focusNote) return;
    if (focusNote.index === null) newNote.current?.focus();
    else noteButtons.current[focusNote.index]?.focus({ preventScroll: true });
  }, [focusNote]);

  // what is on the paper is kept as it is written, so nothing that changes on the page around it can lose it
  useEffect(() => {
    if (place) keepDraft(who, place, { body, paper, strokes: canDraw ? drawing.strokes : [], notes: drawing.notes });
  }, [who, place, body, paper, drawing.strokes, drawing.notes, canDraw]);

  // ───────────────────────────────────────────────────────── drawing

  /** The line being drawn: its pointer, its points so far, how many more it may have, and the sheet as it was when it began. */
  const live = useRef<{ pointer: number; points: number[]; room: number; rect: DOMRect; foot: number } | null>(null);
  const frame = useRef(0);

  function showLive(): void {
    frame.current = 0;
    const d = live.current ? strokePath({ points: live.current.points }) : '';
    line.current?.setAttribute('d', d);
    halo.current?.setAttribute('d', d);
  }
  function drawSoon(): void {
    if (typeof requestAnimationFrame === 'undefined') showLive();
    else if (!frame.current) frame.current = requestAnimationFrame(showLive);
  }
  useEffect(() => () => {
    if (frame.current && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(frame.current);
  }, []);
  // a line kept is drawn by the paper now: the one drawn live goes in the same frame, so nothing flickers
  useLayoutEffect(() => {
    if (live.current) return;
    line.current?.setAttribute('d', '');
    halo.current?.setAttribute('d', '');
  }, [drawing.strokes]);

  const at = (rect: DOMRect, x: number, y: number, bottom: number): { x: number; y: number } => {
    const p = pagePoint(rect, x, y);
    return onPage(p.x, p.y, bottom);
  };

  function penDown(e: React.PointerEvent<HTMLDivElement>): void {
    if (live.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    // the shortcuts for undo and redo are heard from here on
    e.currentTarget.focus({ preventScroll: true });
    const room = pointsLeft({ paper, ...drawing });
    if (room < 1) {
      setFull(true);
      return;
    }
    capture(e.currentTarget, e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const p = at(rect, e.clientX, e.clientY, foot);
    live.current = { pointer: e.pointerId, points: [p.x, p.y], room, rect, foot };
    drawSoon();
  }

  function penMove(e: React.PointerEvent<HTMLDivElement>): void {
    const s = live.current;
    if (!s || e.pointerId !== s.pointer) return;
    const native = e.nativeEvent;
    // every position the pointer passed through since the last frame, for a smooth line from a fast hand
    const passed = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
    for (const ev of passed.length > 0 ? passed : [native]) {
      if (s.points.length / 2 >= s.room) {
        setFull(true);
        break;
      }
      const p = at(s.rect, ev.clientX, ev.clientY, s.foot);
      const last = s.points.length;
      if (p.x !== s.points[last - 2] || p.y !== s.points[last - 1]) s.points.push(p.x, p.y);
    }
    drawSoon();
  }

  function penUp(e: React.PointerEvent<HTMLDivElement>): void {
    const s = live.current;
    if (!s || e.pointerId !== s.pointer) return;
    live.current = null;
    const stroke: PaperStroke = { tool: pen, color: paint, width: widthFor(pen, widths[pen]), points: simplifyStroke(s.points) };
    history.set({ ...drawing, strokes: [...drawing.strokes, stroke] });
    setDecorProblem(null);
  }

  function undo(): void {
    history.undo();
    setFull(false);
    setDecorProblem(null);
  }
  function redo(): void {
    history.redo();
    setDecorProblem(null);
  }

  // ───────────────────────────────────────────────────────── notes

  const notes = drawing.notes;
  const chosen = selected !== null && selected < notes.length ? selected : null;

  function setNotes(next: PaperNote[], gesture = false): void {
    const value = { ...drawing, notes: next };
    if (gesture) history.preview(value);
    else history.set(value);
    setDecorProblem(null);
  }
  function patchNote(index: number, patch: Partial<PaperNote>, gesture = false): void {
    setNotes(
      notes.map((n, i) => (i === index ? { ...n, ...patch } : n)),
      gesture,
    );
  }
  function removeNote(index: number): void {
    setNotes(notes.filter((_, i) => i !== index));
    setSelected(null);
    setFocusNote({ index: null });
  }
  /** Finished with the chosen note: one left with no words is taken off the paper. */
  function doneWithNote(): void {
    history.settle();
    if (chosen !== null && notes[chosen] && !notes[chosen].text.trim()) setNotes(notes.filter((_, i) => i !== chosen));
    setSelected(null);
  }

  /** Where a new note goes: across the middle, in the part of the sheet in view, a line lower for each note already there so none hides another. */
  function freeSpot(): { x: number; y: number } {
    const r = sheet.current?.getBoundingClientRect();
    const step = (notes.length % 4) * PAPER_RULE;
    if (!r || r.width === 0) return onPage(PAPER_W / 2, PAPER_TOP + PAPER_RULE * 3 + step, foot);
    const tools = dock.current?.getBoundingClientRect();
    const top = Math.max(r.top, 0);
    const bottom = Math.min(r.bottom, typeof innerHeight === 'number' ? innerHeight : r.bottom, tools && tools.top > top && tools.top < r.bottom ? tools.top : r.bottom);
    const middle = bottom > top ? (top + bottom) / 2 : r.top + r.height / 4;
    return onPage(PAPER_W / 2, ((middle - r.top) * PAPER_W) / r.width + step, foot);
  }

  function addNote(): void {
    const text = draft.trim();
    if (!text || !roomForNote(notes) || noteProblem(text)) return;
    const spot = freeSpot();
    setNotes([...notes, { text, x: spot.x, y: spot.y, size: 'm', color: paper.ink, turn: 0 }]);
    setSelected(notes.length);
    setDraft('');
    setFocusNote({ index: notes.length });
  }

  /** A note held by the pointer: which, which pointer, where both began, and the sheet's scale then. */
  const held = useRef<{ index: number; pointer: number; x0: number; y0: number; nx: number; ny: number; scale: number } | null>(null);

  function holdNote(e: React.PointerEvent<HTMLButtonElement>, index: number): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const n = notes[index];
    const r = sheet.current?.getBoundingClientRect();
    if (!n) return;
    setSelected(index);
    capture(e.currentTarget, e.pointerId);
    held.current = { index, pointer: e.pointerId, x0: e.clientX, y0: e.clientY, nx: n.x, ny: n.y, scale: r && r.width > 0 ? PAPER_W / r.width : 1 };
  }
  function dragNote(e: React.PointerEvent<HTMLButtonElement>): void {
    const h = held.current;
    if (!h || e.pointerId !== h.pointer) return;
    patchNote(h.index, onPage(h.nx + (e.clientX - h.x0) * h.scale, h.ny + (e.clientY - h.y0) * h.scale, foot), true);
  }
  function dropNote(e: React.PointerEvent<HTMLButtonElement>): void {
    if (!held.current || e.pointerId !== held.current.pointer) return;
    held.current = null;
    history.settle();
  }

  const NUDGE: Readonly<Record<string, readonly [number, number]>> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  /** The arrow keys move a note on the page, the way it lies whichever way the language runs; shift moves it further. */
  function keyNote(e: React.KeyboardEvent<HTMLButtonElement>, index: number): void {
    const n = notes[index];
    if (!n) return;
    const way = NUDGE[e.key];
    if (way) {
      e.preventDefault();
      const step = e.shiftKey ? 40 : 8;
      setSelected(index);
      patchNote(index, onPage(n.x + way[0] * step, n.y + way[1] * step, foot), true);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeNote(index);
    } else if (e.key === 'Escape' && chosen !== null) {
      e.preventDefault();
      doneWithNote();
    }
  }

  function chooseTool(next: Tool): void {
    if (tool === 'text' && next !== 'text') doneWithNote();
    setTool(next);
  }

  /** Undo and redo from the keyboard, once the work is on the paper rather than in a field being typed in, which has its own. */
  function shortcuts(e: React.KeyboardEvent<HTMLFormElement>): void {
    const target = e.target as HTMLElement;
    const typing = target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.type === 'text');
    if (typing || !(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if ((key === 'z' && e.shiftKey) || key === 'y') {
      e.preventDefault();
      redo();
    }
  }

  // ───────────────────────────────────────────────────────── sending

  const problem = letterProblem(body);
  // a letter still being started is not yet too short
  const shown = problem && (problem !== 'short' || tried) ? t(PROBLEM[problem]) : null;
  const count = [...body.trim()].length;
  const draftProblem = noteProblem(draft);
  const chosenNote = chosen !== null ? notes[chosen] : undefined;
  const chosenProblem = chosenNote ? (chosenNote.text.trim() ? noteProblem(chosenNote.text) : 'note-empty') : null;
  const decorText = decorProblem ? t(DECOR_PROBLEM[decorProblem], { max: decorProblem === 'too-many-notes' ? NOTES_MAX : NOTE_MAX }) : null;

  function submit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setTried(true);
    if (problem || busy) return;
    history.settle();
    const kept = notes.filter((n) => n.text.trim());
    const check = checkLetterDecor({ paper, strokes: canDraw ? drawing.strokes : [], notes: kept }, { strokes: canDraw });
    if (!check.ok) {
      setDecorProblem(check.problem);
      if (check.problem.startsWith('note')) setTool('text');
      return;
    }
    rememberPaper(who, paper);
    onSend({ body, decor: check.value });
  }

  const drawn = drawing.strokes.length > 0;
  const reasonId = `${id}-reason`;
  const look = STROKE_LOOK[pen];
  const color = paintColor(paint, paper.tone);
  const width = widthFor(pen, widths[pen]);

  return (
    <form className="letter-paper" ref={form} onSubmit={submit} onKeyDown={shortcuts}>
      <label htmlFor={`${id}-body`} className="letter-paper-label">
        {label}
      </label>
      <div className="paper-frame">
        <div
          ref={sheet}
          className={`paper-sheet is-writing is-${tool}${pages > 1 ? ' is-two' : ''}`}
          style={{ ...sheetStyle(paper, scheme), '--length-u': length } as React.CSSProperties}
        >
          <PaperArt paper={paper} strokes={drawing.strokes} length={foot} label={tool === 'draw' ? undefined : t('letters.paper.canvas.drawn')} />
          <BaselineProbe probeRef={probe} />
          <p className="paper-body paper-mirror" ref={mirror} aria-hidden="true">
            {body}
            {'​'}
          </p>
          <textarea
            ref={writing}
            id={`${id}-body`}
            className="paper-body paper-input"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('letters.placeholder')}
            maxLength={LETTER_MAX + 200}
            aria-describedby={`${id}-hint ${id}-problem`}
            aria-invalid={shown ? true : undefined}
            tabIndex={tool === 'write' ? 0 : -1}
            dir="auto"
          />
          <svg className="paper-live" viewBox={`0 0 ${PAPER_W} ${length}`} aria-hidden="true">
            <g fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round">
              {look.halo && <path ref={halo} strokeWidth={width * look.halo.width} strokeOpacity={look.halo.opacity} />}
              <path ref={line} strokeWidth={width} strokeOpacity={look.opacity} />
            </g>
          </svg>
          {tool === 'text' && <div className="paper-surface is-text" aria-hidden="true" onPointerDown={doneWithNote} />}
          {notes.length > 0 && (
            <div className="paper-notes">
              {notes.map((n, i) =>
                tool === 'text' ? (
                  <button
                    key={i}
                    ref={(el) => {
                      noteButtons.current[i] = el;
                    }}
                    type="button"
                    className={`paper-note is-placed${i === chosen ? ' is-chosen' : ''}`}
                    style={noteStyle({ ...n, turn: turnFor(n.turn) }, paper.tone)}
                    dir="auto"
                    aria-pressed={i === chosen}
                    aria-label={t('letters.paper.note.move', { text: n.text })}
                    aria-describedby={`${id}-note-hint`}
                    onPointerDown={(e) => holdNote(e, i)}
                    onPointerMove={dragNote}
                    onPointerUp={dropNote}
                    onPointerCancel={dropNote}
                    onKeyDown={(e) => keyNote(e, i)}
                    onKeyUp={(e) => {
                      if (NUDGE[e.key]) history.settle();
                    }}
                    onClick={() => setSelected(i)}
                  >
                    {n.text}
                  </button>
                ) : (
                  <span key={i} className="paper-note" style={noteStyle(n, paper.tone)} dir="auto">
                    {n.text}
                  </span>
                ),
              )}
            </div>
          )}
          {tool === 'draw' && canDraw && (
            <div
              className="paper-surface is-draw"
              role="img"
              tabIndex={-1}
              aria-label={drawn ? t('letters.paper.canvas.drawn') : t('letters.paper.canvas.blank')}
              onPointerDown={penDown}
              onPointerMove={penMove}
              onPointerUp={penUp}
              onPointerCancel={penUp}
              onContextMenu={(e) => e.preventDefault()}
            />
          )}
        </div>
      </div>

      <div className={`paper-dock${tool === 'write' ? '' : ' is-floating'}`} ref={dock}>
        <ToolSwitch tool={tool} onChange={chooseTool} canDraw={canDraw} reasonId={reasonId} />
        {!canDraw && (
          <span id={reasonId} className="sr-only">
            {t('letters.paper.drawNotHere')}
          </span>
        )}
        {tool === 'draw' && (
          <DrawPanel
            canDraw={canDraw}
            pen={pen}
            onPen={setPen}
            paint={paint}
            onPaint={setPaintPick}
            width={width}
            onWidth={(w) => setWidths((all) => ({ ...all, [pen]: widthFor(pen, w) }))}
            unit={unit}
            tone={paper.tone}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onUndo={undo}
            onRedo={redo}
            drawn={drawn}
            onClear={() => {
              history.set({ ...drawing, strokes: [] });
              setFull(false);
            }}
            full={full}
          />
        )}
        {tool === 'text' && (
          <TextPanel
            notes={notes}
            selected={chosen}
            draft={draft}
            onDraft={setDraft}
            draftProblem={draftProblem ? t(DECOR_PROBLEM[draftProblem], { max: NOTE_MAX }) : null}
            onAdd={addNote}
            newRef={newNote}
            onText={(text) => chosen !== null && patchNote(chosen, { text }, true)}
            onSettle={history.settle}
            onPatch={(patch, gesture) => chosen !== null && patchNote(chosen, patch, gesture)}
            onDelete={() => chosen !== null && removeNote(chosen)}
            onDone={doneWithNote}
            selectedProblem={chosenProblem ? t(DECOR_PROBLEM[chosenProblem], { max: NOTE_MAX }) : null}
            tone={paper.tone}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onUndo={undo}
            onRedo={redo}
            hintId={`${id}-note-hint`}
          />
        )}
        {tool === 'paper' && <PaperPanel paper={paper} onChange={setPaper} />}
      </div>

      <div className="letter-paper-foot">
        <p id={`${id}-hint`} className="letter-paper-hint">
          {t('letters.hint')}
        </p>
        <span className={`letter-paper-count${count > LETTER_MAX ? ' is-over' : ''}`} aria-hidden="true">
          {count} / {LETTER_MAX}
        </span>
      </div>
      <p id={`${id}-problem`} className="letter-paper-problem" role="alert">
        {shown ?? decorText ?? error ?? ''}
      </p>
      <div className="letter-paper-actions">
        {onCancel && (
          <button type="button" className="btn btn-ghost letter-paper-cancel" onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </button>
        )}
        <button type="submit" className="btn btn-primary letter-paper-send" disabled={busy}>
          {busy ? t('letters.sending') : (sendLabel ?? t('letters.send'))}
        </button>
      </div>
    </form>
  );
}
