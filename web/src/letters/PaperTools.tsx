import { useId, useState } from 'react';
import {
  DRAW_TOOLS,
  INKS,
  NOTE_MAX,
  NOTE_SIZES,
  NOTE_TURN_MAX,
  NOTES_MAX,
  PAINTS,
  PAPER_STYLES,
  PAPER_TONES,
  STROKE_LOOK,
  STROKE_WIDTHS,
  inkOn,
  paintColor,
  paperColors,
  type DrawTool,
  type Ink,
  type LetterPaper,
  type NoteSize,
  type Paint,
  type PaperNote,
  type PaperStyle,
  type PaperTone,
} from '@kurda/shared';
import type { MessageKey } from '../i18n/en';
import { useT } from '../i18n/I18nProvider';
import { BrushIcon, FeatherIcon, LockIcon, MarkerIcon, PaintIcon, PaperIcon, PenIcon, RedoIcon, TextIcon, TrashIcon, UndoIcon } from '../components/icons';

/**
 * The tools that sit under a letter while it is written (LetterComposer):
 * the choice between writing, drawing, notes and the paper itself, and what
 * each of them offers.
 *
 * Every choice is a real radio button drawn as a swatch or a segment, so the
 * arrow keys move through it and a screen reader hears each by its name; the
 * colours and papers are drawn live in the paper the letter is on, so a
 * swatch shows what choosing it would look like on this sheet.
 */

export type Tool = 'write' | 'draw' | 'text' | 'paper';

const TOOLS: ReadonlyArray<{ key: Tool; label: MessageKey; icon: React.ReactNode }> = [
  { key: 'write', label: 'letters.paper.tool.write', icon: <FeatherIcon size={18} /> },
  { key: 'draw', label: 'letters.paper.tool.draw', icon: <PaintIcon size={18} /> },
  { key: 'text', label: 'letters.paper.tool.text', icon: <TextIcon size={18} /> },
  { key: 'paper', label: 'letters.paper.tool.paper', icon: <PaperIcon size={18} /> },
];

const PEN_NAMES: Readonly<Record<DrawTool, MessageKey>> = { pen: 'letters.paper.pen', brush: 'letters.paper.brush', marker: 'letters.paper.marker' };
const PEN_ICONS: Readonly<Record<DrawTool, React.ReactNode>> = { pen: <PenIcon size={17} />, brush: <BrushIcon size={17} />, marker: <MarkerIcon size={17} /> };

/** Each colour by its name, for whoever cannot see the swatch: the inks first, as they are among the paints. */
export const PAINT_NAMES: Readonly<Record<Paint, MessageKey>> = {
  navy: 'letters.paint.navy',
  charcoal: 'letters.paint.charcoal',
  sepia: 'letters.paint.sepia',
  forest: 'letters.paint.forest',
  crimson: 'letters.paint.crimson',
  plum: 'letters.paint.plum',
  teal: 'letters.paint.teal',
  gold: 'letters.paint.gold',
  sun: 'letters.paint.sun',
  leaf: 'letters.paint.leaf',
  rosehip: 'letters.paint.rosehip',
  sea: 'letters.paint.sea',
  sand: 'letters.paint.sand',
  white: 'letters.paint.white',
};

const STYLE_NAMES: Readonly<Record<PaperStyle, MessageKey>> = {
  plain: 'letters.paper.style.plain',
  lined: 'letters.paper.style.lined',
  margin: 'letters.paper.style.margin',
  grid: 'letters.paper.style.grid',
  dotted: 'letters.paper.style.dotted',
};

const TONE_NAMES: Readonly<Record<PaperTone, MessageKey>> = {
  cream: 'letters.paper.tone.cream',
  white: 'letters.paper.tone.white',
  rose: 'letters.paper.tone.rose',
  sky: 'letters.paper.tone.sky',
  sage: 'letters.paper.tone.sage',
  lavender: 'letters.paper.tone.lavender',
  kraft: 'letters.paper.tone.kraft',
  night: 'letters.paper.tone.night',
};

const NOTE_SIZE_NAMES: Readonly<Record<NoteSize, MessageKey>> = { s: 'letters.paper.note.small', m: 'letters.paper.note.medium', l: 'letters.paper.note.large' };

/**
 * Write · Draw · Text · Paper, as one segmented choice. Drawing on a first
 * letter to a stranger is there but closed, with a lock on it: choosing it
 * says why (DrawPanel), rather than the tool silently missing.
 */
export function ToolSwitch({ tool, onChange, canDraw, reasonId }: { tool: Tool; onChange: (next: Tool) => void; canDraw: boolean; reasonId: string }): React.JSX.Element {
  const t = useT();
  const name = `paper-tool${useId()}`;
  return (
    <fieldset className="paper-tools">
      <legend className="sr-only">{t('letters.paper.tools')}</legend>
      {TOOLS.map((k) => {
        const closed = k.key === 'draw' && !canDraw;
        return (
          <label key={k.key} className={`paper-tool${k.key === tool ? ' is-active' : ''}${closed ? ' is-closed' : ''}`}>
            <input type="radio" name={name} checked={k.key === tool} onChange={() => onChange(k.key)} aria-describedby={closed ? reasonId : undefined} />
            <span className="paper-tool-icon">{closed ? <LockIcon size={16} /> : k.icon}</span>
            <span className="paper-tool-name">{t(k.label)}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

/** A row of colours to choose one of, each a round swatch in the colour it draws in on this paper. */
export function PaintChoice({ value, onChange, tone, legend, only }: { value: Paint; onChange: (next: Paint) => void; tone: PaperTone; legend: string; only?: readonly Paint[] }): React.JSX.Element {
  const t = useT();
  const name = `paper-paint${useId()}`;
  const sheet = paperColors({ style: 'plain', tone, ink: 'navy' }).sheet;
  return (
    <fieldset className="paper-swatches" style={{ '--swatch-sheet': sheet } as React.CSSProperties}>
      <legend className="paper-legend">{legend}</legend>
      <div className="paper-swatch-row">
        {(only ?? PAINTS).map((p) => (
          <label key={p} className={`paper-paint${p === value ? ' is-picked' : ''}`} style={{ '--swatch': paintColor(p, tone) } as React.CSSProperties}>
            <input type="radio" name={name} className="sr-only" checked={p === value} onChange={() => onChange(p)} />
            <span className="paper-paint-dot" aria-hidden="true" />
            <span className="sr-only">{t(PAINT_NAMES[p])}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * A sheet in small, for a swatch: its tone, its lines in their own colours
 * and a stroke of its ink, drawn at the swatch's own scale so the lines,
 * squares and dots can still be told apart there.
 */
export function MiniSheet({ paper }: { paper: LetterPaper }): React.JSX.Element {
  const c = paperColors(paper);
  const rows = [15, 22, 29, 36, 43];
  return (
    <svg className="paper-mini" viewBox="0 0 36 50" width="36" height="50" aria-hidden="true">
      <rect x="0.5" y="0.5" width="35" height="49" rx="3" fill={c.sheet} stroke={c.edge} />
      {(paper.style === 'lined' || paper.style === 'margin') && <path d={rows.map((y) => `M3 ${y}H33`).join('')} stroke={c.rule} strokeWidth="1" />}
      {paper.style === 'margin' && <path d="M9 1V49" stroke={c.margin} strokeWidth="1" />}
      {paper.style === 'grid' && (
        <path d={[...[8, 15, 22, 29, 36, 43].map((y) => `M1 ${y}H35`), ...[4.5, 11.5, 18.5, 25.5, 32.5].map((x) => `M${x} 1V49`)].join('')} stroke={c.grid} strokeWidth="0.9" />
      )}
      {paper.style === 'dotted' && <path d={rows.flatMap((y) => [8, 15, 22, 29].map((x) => `M${x} ${y}h0.1`)).join('')} stroke={c.dot} strokeWidth="1.8" strokeLinecap="round" />}
      <path d={paper.style === 'margin' ? 'M12 20.5q3-4 6 0t6 0' : 'M7 20.5q3-4 6 0t6 0'} fill="none" stroke={c.ink} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** The paper: its lines, its colour and its ink, each a row of live swatches in what is chosen of the other two. */
export function PaperPanel({ paper, onChange }: { paper: LetterPaper; onChange: (next: LetterPaper) => void }): React.JSX.Element {
  const t = useT();
  const ids = useId();
  return (
    <div className="paper-panel">
      <fieldset className="paper-swatches">
        <legend className="paper-legend">{t('letters.paper.style')}</legend>
        <div className="paper-swatch-row">
          {PAPER_STYLES.map((s) => (
            <label key={s} className={`paper-sheet-pick${s === paper.style ? ' is-picked' : ''}`}>
              <input type="radio" name={`${ids}-style`} className="sr-only" checked={s === paper.style} onChange={() => onChange({ ...paper, style: s })} />
              <MiniSheet paper={{ ...paper, style: s }} />
              <span className="paper-pick-name">{t(STYLE_NAMES[s])}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="paper-swatches">
        <legend className="paper-legend">{t('letters.paper.tone')}</legend>
        <div className="paper-swatch-row">
          {PAPER_TONES.map((tone) => (
            <label key={tone} className={`paper-sheet-pick is-tone${tone === paper.tone ? ' is-picked' : ''}`}>
              <input type="radio" name={`${ids}-tone`} className="sr-only" checked={tone === paper.tone} onChange={() => onChange({ ...paper, tone })} />
              <MiniSheet paper={{ ...paper, tone }} />
              <span className="sr-only">{t(TONE_NAMES[tone])}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="paper-swatches" style={{ '--swatch-sheet': paperColors(paper).sheet } as React.CSSProperties}>
        <legend className="paper-legend">{t('letters.paper.ink')}</legend>
        <div className="paper-swatch-row">
          {INKS.map((ink: Ink) => (
            <label key={ink} className={`paper-paint is-ink${ink === paper.ink ? ' is-picked' : ''}`} style={{ '--swatch': inkOn(ink, paper.tone) } as React.CSSProperties}>
              <input type="radio" name={`${ids}-ink`} className="sr-only" checked={ink === paper.ink} onChange={() => onChange({ ...paper, ink })} />
              <span className="paper-paint-dot" aria-hidden="true" />
              <span className="sr-only">{t(PAINT_NAMES[ink])}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

/** Undo and redo, as two quiet square buttons that say what they do to whoever cannot see the arrows. */
export function UndoRedo({ canUndo, canRedo, onUndo, onRedo }: { canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void }): React.JSX.Element {
  const t = useT();
  return (
    <div className="paper-history">
      <button type="button" className="paper-icon-btn" onClick={onUndo} disabled={!canUndo} aria-label={t('common.undo')} title={t('photo.undoShortcut')}>
        <UndoIcon size={18} className="flip-rtl" />
      </button>
      <button type="button" className="paper-icon-btn" onClick={onRedo} disabled={!canRedo} aria-label={t('photo.redo')} title={t('photo.redoShortcut')}>
        <RedoIcon size={18} className="flip-rtl" />
      </button>
    </div>
  );
}

/**
 * Drawing: what to draw with, in which colour and how wide, and undo, redo
 * and clear. Clearing asks once, in place. On a first letter to a stranger
 * there is only the one line saying why there is nothing to draw with yet.
 */
export function DrawPanel({
  canDraw,
  pen,
  onPen,
  paint,
  onPaint,
  width,
  onWidth,
  unit,
  tone,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  drawn,
  onClear,
  full,
}: {
  canDraw: boolean;
  pen: DrawTool;
  onPen: (next: DrawTool) => void;
  paint: Paint;
  onPaint: (next: Paint) => void;
  width: number;
  onWidth: (next: number) => void;
  /** one page unit on the screen, in pixels, so the size's dot is the line's own width */
  unit: number;
  tone: PaperTone;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  drawn: boolean;
  onClear: () => void;
  /** the page holds as much drawing as a letter can carry */
  full: boolean;
}): React.JSX.Element {
  const t = useT();
  const ids = useId();
  const [asking, setAsking] = useState(false);
  if (!canDraw)
    return (
      <div className="paper-panel">
        <p className="paper-reason">
          <LockIcon size={16} />
          <span>{t('letters.paper.drawNotHere')}</span>
        </p>
      </div>
    );
  const [min, max] = STROKE_WIDTHS[pen];
  const look = STROKE_LOOK[pen];
  const dot = Math.max(3, Math.min(30, width * (unit || 0.6)));
  return (
    <div className="paper-panel">
      <div className="paper-panel-row">
        <fieldset className="paper-pens">
          <legend className="sr-only">{t('letters.paper.drawWith')}</legend>
          {DRAW_TOOLS.map((p) => (
            <label key={p} className={`paper-pen${p === pen ? ' is-active' : ''}`}>
              <input type="radio" name={`${ids}-pen`} checked={p === pen} onChange={() => onPen(p)} />
              {PEN_ICONS[p]}
              <span>{t(PEN_NAMES[p])}</span>
            </label>
          ))}
        </fieldset>
        <UndoRedo canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo} />
      </div>
      <PaintChoice value={paint} onChange={onPaint} tone={tone} legend={t('letters.paper.paint')} />
      <div className="paper-size">
        <label htmlFor={`${ids}-size`} className="paper-legend">
          {t('letters.paper.size')}
        </label>
        <input id={`${ids}-size`} type="range" min={min} max={max} step={1} value={width} onChange={(e) => onWidth(Number(e.target.value))} />
        <span className="paper-size-dot" aria-hidden="true" style={{ background: paperColors({ style: 'plain', tone, ink: 'navy' }).sheet }}>
          <span style={{ width: dot, height: dot, background: paintColor(paint, tone), opacity: look.opacity }} />
        </span>
      </div>
      {full && (
        <p className="paper-notice" role="status">
          {t('letters.paper.drawFull')}
        </p>
      )}
      {asking ? (
        <div className="letters-ask" role="group" aria-label={t('letters.paper.clear')}>
          <p className="letters-status">{t('letters.paper.clearAsk')}</p>
          <div className="letters-ask-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setAsking(false);
                onClear();
              }}
            >
              {t('letters.paper.clearYes')}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAsking(false)}>
              {t('letters.paper.clearKeep')}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="letters-text-button paper-clear" onClick={() => setAsking(true)} disabled={!drawn}>
          <TrashIcon size={16} />
          {t('letters.paper.clear')}
        </button>
      )}
    </div>
  );
}

/**
 * Notes: writing a new one and putting it on the paper, and for the one
 * chosen on the sheet, its words, size, colour and turn, and taking it off.
 * What a note may not say is said under it as it is typed, as with the
 * letter itself.
 */
export function TextPanel({
  notes,
  selected,
  draft,
  onDraft,
  draftProblem,
  onAdd,
  newRef,
  onText,
  onSettle,
  onPatch,
  onDelete,
  onDone,
  selectedProblem,
  tone,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  hintId,
}: {
  notes: readonly PaperNote[];
  selected: number | null;
  draft: string;
  onDraft: (next: string) => void;
  draftProblem: string | null;
  onAdd: () => void;
  /** the field a new note is written in, for the focus to come back to once a note is taken off */
  newRef?: React.Ref<HTMLInputElement>;
  /** the chosen note's words changing as they are typed: one step once typing stops */
  onText: (text: string) => void;
  onSettle: () => void;
  /** a change to the chosen note; `gesture` while a slider is still being moved */
  onPatch: (patch: Partial<PaperNote>, gesture?: boolean) => void;
  onDelete: () => void;
  onDone: () => void;
  selectedProblem: string | null;
  tone: PaperTone;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  hintId: string;
}): React.JSX.Element {
  const t = useT();
  const ids = useId();
  const note = selected !== null ? notes[selected] : undefined;
  // Enter puts the note on the paper (or finishes with it) rather than sending the whole letter
  const onEnter = (e: React.KeyboardEvent, act: () => void): void => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    act();
  };
  if (!note) {
    const room = notes.length < NOTES_MAX;
    return (
      <div className="paper-panel">
        <div className="paper-panel-row">
          <label htmlFor={`${ids}-new`} className="paper-legend">
            {t('letters.paper.note.new')}
          </label>
          <UndoRedo canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo} />
        </div>
        <div className="paper-note-add">
          <input
            ref={newRef}
            id={`${ids}-new`}
            className="input"
            value={draft}
            maxLength={NOTE_MAX}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) =>
              onEnter(e, () => {
                if (draft.trim() && room && !draftProblem) onAdd();
              })
            }
            disabled={!room}
            dir="auto"
            aria-describedby={`${ids}-new-problem ${hintId}`}
            aria-invalid={draftProblem ? true : undefined}
          />
          <button type="button" className="btn btn-secondary" onClick={onAdd} disabled={!room || !draft.trim() || draftProblem !== null}>
            {t('letters.paper.note.add')}
          </button>
        </div>
        <p id={`${ids}-new-problem`} className="paper-notice is-problem" role="alert">
          {draftProblem ?? (room ? '' : t('letters.paper.note.full', { max: NOTES_MAX }))}
        </p>
        <p id={hintId} className="paper-hint">
          {t('letters.paper.note.hint')}
        </p>
      </div>
    );
  }
  return (
    <div className="paper-panel">
      <div className="paper-panel-row">
        <label htmlFor={`${ids}-edit`} className="paper-legend">
          {t('letters.paper.note.edit')}
        </label>
        <UndoRedo canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo} />
      </div>
      <input
        id={`${ids}-edit`}
        className="input"
        value={note.text}
        maxLength={NOTE_MAX}
        onChange={(e) => onText(e.target.value)}
        onBlur={onSettle}
        onKeyDown={(e) => onEnter(e, onDone)}
        dir="auto"
        aria-describedby={`${ids}-edit-problem ${hintId}`}
        aria-invalid={selectedProblem ? true : undefined}
      />
      <p id={`${ids}-edit-problem`} className="paper-notice is-problem" role="alert">
        {selectedProblem ?? ''}
      </p>
      <div className="paper-panel-row">
        <div className="paper-field">
          <span id={`${ids}-size-name`} className="paper-legend">
            {t('letters.paper.size')}
          </span>
          <div className="paper-pens" role="radiogroup" aria-labelledby={`${ids}-size-name`}>
            {NOTE_SIZES.map((s) => (
              <label key={s} className={`paper-pen${s === note.size ? ' is-active' : ''}`}>
                <input type="radio" name={`${ids}-size`} checked={s === note.size} onChange={() => onPatch({ size: s })} />
                <span>{t(NOTE_SIZE_NAMES[s])}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="paper-field paper-turn">
          <label htmlFor={`${ids}-turn`} className="paper-legend">
            {t('letters.paper.note.turn')}
          </label>
          <input
            id={`${ids}-turn`}
            type="range"
            min={-NOTE_TURN_MAX}
            max={NOTE_TURN_MAX}
            step={1}
            value={note.turn}
            onChange={(e) => onPatch({ turn: Number(e.target.value) }, true)}
            onPointerUp={onSettle}
            onKeyUp={onSettle}
            onBlur={onSettle}
          />
        </div>
      </div>
      <PaintChoice value={note.color} onChange={(color) => onPatch({ color })} tone={tone} legend={t('letters.paper.paint')} />
      <p id={hintId} className="paper-hint">
        {t('letters.paper.note.hint')}
      </p>
      <div className="paper-panel-actions">
        <button type="button" className="btn btn-ghost btn-sm paper-note-delete" onClick={onDelete}>
          <TrashIcon size={16} />
          {t('letters.paper.note.delete')}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onDone}>
          {t('common.done')}
        </button>
      </div>
    </div>
  );
}
