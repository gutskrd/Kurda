import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, PanResponder, Pressable, StyleSheet, Text, TextInput, View, type GestureResponderEvent, type NativeTouchEvent } from 'react-native';
import {
  DEFAULT_PAPER,
  DRAW_TOOLS,
  INKS,
  LETTER_MAX,
  NOTES_MAX,
  NOTE_MAX,
  NOTE_SIZES,
  PAINTS,
  PAPER_H,
  PAPER_RULE,
  PAPER_STYLES,
  PAPER_TONES,
  PAPER_W,
  checkLetterDecor,
  letterProblem,
  type DecorProblem,
  type DrawTool,
  type LetterDecor,
  type LetterPaper,
  type LetterProblem,
  type Paint,
  type PaperNote,
  type PaperTone,
} from '@kurda/shared';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useTheme } from '../theme/ThemeProvider';
import { useDirection } from '../reports/direction';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { haptic } from '../feedback/haptics';
import {
  EMPTY_DRAWING,
  PEN_SIZES,
  PenLine,
  WRITING_FOOT,
  addStroke,
  canDrawMore,
  clearDrawing,
  moveNote,
  pagesFor,
  placeForNote,
  pointsLeft,
  redo,
  turnNote,
  undo,
  widthFor,
  type Drawing,
  type PenSize,
} from './paperKit';
import {
  NoteMark,
  PAINT_NAME,
  PaperPicture,
  STYLE_NAME,
  StrokeLines,
  TONE_NAME,
  describePaper,
  inkName,
  useSheetColors,
  useSheetWidth,
  writingDirection,
  writingFrame,
  writingType,
} from './PaperSheet';
import { Choice, Glyph, InkSample, MiniSheet, PaintDot, SizeDot, SwatchRow, ToolAction, ToolBar, ToolSample, type PaperTool } from './PaperTools';
import type { PaperHost } from './usePaperScroll';
import { DECOR_PROBLEM } from './errors';
import { draftOf, keepDraft } from './drafts';
import { useAuth } from '../auth/AuthContext';
import { HeldNotice, useAccountHeld } from '../reports/HeldNotice';

/**
 * Writing a letter on its own sheet of paper, as on the website. Four tools sit above the sheet, where a drawing hand
 * does not cover them: Write (type on the rules), Draw (pen, brush or marker, with undo, redo and an undoable
 * clear), Text (notes placed by a tap, dragged, and restyled), and Paper (lines, colour and ink).
 *
 * Drawing holds the page still; two fingers scroll it instead, and a hand resting on the glass is ignored. On a first
 * letter to a stranger Draw is locked and says why: drawings travel only between pen pals.
 *
 * Problems the server would refuse (links, phone numbers, length) show under the sheet while writing, so nothing is
 * refused after sending; emptiness is only reported on send. The page keeps what is being typed above the keyboard
 * (`host`).
 */

/** A letter as it is sent: its words, and its paper with what is drawn and stuck on it. */
export interface ComposedLetter {
  body: string;
  decor: LetterDecor;
}

/** What to tell the writer about a letter that cannot go as it is. */
const PROBLEM: Record<LetterProblem, TranslationKey> = {
  short: 'letters.problem.short',
  long: 'letters.problem.long',
  link: 'letters.problem.link',
  contact: 'letters.problem.contact',
};

/**
 * The paper last written on, for the next sheet: set from the letters home (shared LettersHome `paper`) and again on
 * each send, so a correspondence opened later starts on it too.
 */
let lastPaper: LetterPaper | null = null;
export function rememberPaper(paper: LetterPaper | null | undefined): void {
  if (paper) lastPaper = paper;
}
export function rememberedPaper(): LetterPaper | null {
  return lastPaper;
}

/** How far a screen reader's move action takes a note, in page units: a line down, or a little along it. */
const NUDGE = { x: 60, y: PAPER_RULE } as const;
/** How far a finger may move and still count as resting, in points. */
const STILL = 2;

type Touch = Pick<NativeTouchEvent, 'identifier' | 'pageX' | 'pageY'>;
/** A touch's id as a string, whichever type the platform reports. */
const nameOf = (touch: Pick<Touch, 'identifier'>): string => String(touch.identifier ?? 0);

/** The finger on the paper: its line, the sheet's screen offset, and the touches seen, to tell a resting hand from two fingers. */
interface Hand {
  line: PenLine | null;
  id: string;
  ox: number;
  oy: number;
  /** Two fingers are moving the page, so this touch draws nothing. */
  page: boolean;
  /** The fingers' midpoint the last time the page moved. */
  y: number;
  seen: Map<string, { x: number; y: number }>;
}

/** The next frame, falling back to a timer where there is none (tests). */
const nextFrame = (run: () => void): unknown => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(run) : setTimeout(run, 16));
const dropFrame = (frame: unknown): void => {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame as number);
  else clearTimeout(frame as ReturnType<typeof setTimeout>);
};

const between = (touches: readonly Touch[]): number => touches.reduce((s, t) => s + t.pageY, 0) / Math.max(1, touches.length);

/** A note with a stable key, so the same note stays under a finger while others come and go. */
interface Placed {
  key: number;
  note: PaperNote;
}

const hasWords = (p: Placed): boolean => p.note.text.trim().length > 0;

interface LetterComposerProps {
  label: string;
  /** The send button's label, when it is not your own bird that carries the letter. */
  sendLabel?: string;
  busy: boolean;
  onSend: (letter: ComposedLetter) => void;
  /** Puts the paper away, for a letter started by choice. */
  onCancel?: () => void;
  /** The server's refusal, if any. */
  error?: string | null;
  /** Opened by asking to write, so the pen goes straight to the paper. */
  autoFocus?: boolean;
  /** Whether this letter may carry a drawing; not on a first letter to a stranger. */
  canDraw: boolean;
  /** The paper it opens on. */
  paper?: LetterPaper | null;
  /** The page the sheet lies on, held still while drawing and scrolled to keep the writing in sight. */
  host?: PaperHost;
  /** The draft key for where this letter is written from (letters/drafts.ts); the screen drops it once sent. */
  draft?: string;
  testID?: string;
}

export function LetterComposer(props: LetterComposerProps): React.JSX.Element {
  const held = useAccountHeld();
  // A held account reads its letters as usual; the paper waits until a person has checked the account.
  return held ? <HeldNotice /> : <LetterPaperComposer {...props} />;
}

function LetterPaperComposer({
  label,
  sendLabel,
  busy,
  onSend,
  onCancel,
  error,
  autoFocus = false,
  canDraw,
  paper: firstPaper,
  host,
  draft: place,
  testID,
}: LetterComposerProps): React.JSX.Element {
  const { t, rtl } = useI18n();
  const { colors } = useTheme();
  const dir = useDirection();
  const id = (part: string): string | undefined => (testID ? `${testID}-${part}` : undefined);

  // A letter left unsent here reopens as it was left.
  const who = useAuth().user?.id ?? null;
  const [left] = useState(() => (place ? draftOf(who, place) : null));
  const [body, setBody] = useState(left?.body ?? '');
  const [tried, setTried] = useState(false);
  const [tool, setTool] = useState<PaperTool>('write');
  const [paper, setPaper] = useState<LetterPaper>(left?.paper ?? firstPaper ?? DEFAULT_PAPER);
  // A kept drawing is replayed stroke by stroke, so it can be undone as it was made.
  const [drawing, setDrawing] = useState<Drawing>(() => (left && canDraw ? left.strokes.reduce(addStroke, EMPTY_DRAWING) : EMPTY_DRAWING));
  const [pen, setPen] = useState<{ tool: DrawTool; size: PenSize; paint: Paint }>({ tool: 'pen', size: 'm', paint: (left?.paper ?? firstPaper ?? DEFAULT_PAPER).ink });
  const [placed, setPlaced] = useState<Placed[]>(() => (left ? left.notes.map((note, key) => ({ key, note })) : []));
  const [chosen, setChosen] = useState<number | null>(null);
  const [asking, setAsking] = useState(false);
  const [notesFull, setNotesFull] = useState(false);
  const [decorProblem, setDecorProblem] = useState<DecorProblem | null>(null);
  // How far down the sheet the writing reaches, plus the room under it, in points (measured by the writing's twin).
  const [written, setWritten] = useState(0);
  const [width, setWidth] = useSheetWidth();
  const sheet = useSheetColors(paper);

  const input = useRef<TextInput>(null);
  const noteField = useRef<TextInput>(null);
  const caret = useRef<View>(null);
  const canvas = useRef<View>(null);
  const typing = useRef(false);
  const nextKey = useRef(left?.notes.length ?? 0);

  const scale = width / PAPER_W;
  const notes = useMemo(() => placed.map((p) => p.note), [placed]);
  const kept = useMemo(() => placed.filter(hasWords).map((p) => p.note), [placed]);
  const decor = useMemo<LetterDecor>(() => ({ paper, strokes: [...drawing.strokes], notes: kept }), [paper, drawing.strokes, kept]);
  const writing = scale > 0 ? written / scale - WRITING_FOOT : 0;
  const length = pagesFor(writing, drawing.strokes, notes) * PAPER_H;
  const room = useMemo(() => canDrawMore(decor), [decor]);
  const drawingOn = tool === 'draw' && canDraw;

  // Saved as it is written, so nothing changing around the screen can lose it.
  useEffect(() => {
    if (place) keepDraft(who, place, { body, paper, strokes: canDraw ? [...drawing.strokes] : [], notes: kept });
  }, [who, place, body, paper, drawing.strokes, kept, canDraw]);

  // The keyboard rises a moment after opening, once the paper is in place, unless another tool was picked meanwhile.
  const toolNow = useRef(tool);
  toolNow.current = tool;
  useEffect(() => {
    if (!autoFocus) return;
    const soon = setTimeout(() => {
      if (toolNow.current === 'write') input.current?.focus();
    }, 250);
    return () => clearTimeout(soon);
  }, [autoFocus]);

  // The page holds still while the pen is in hand, and is released when the paper is put away.
  useEffect(() => {
    host?.lock(drawingOn);
    return () => host?.lock(false);
  }, [host, drawingOn]);

  /** Puts the current note down; a note left without words is removed. */
  const putDown = (): void => {
    setPlaced((list) => list.filter(hasWords));
    setChosen(null);
  };

  const choose = (next: PaperTool): void => {
    setAsking(false);
    setNotesFull(false);
    if (next !== 'text') putDown();
    setTool(next);
    if (next === 'write') {
      setTimeout(() => input.current?.focus(), 0);
      return;
    }
    input.current?.blur();
    Keyboard.dismiss();
    // Brings the tools and the sheet into sight together, to draw or choose a paper.
    if (next === 'draw' || next === 'paper') host?.reveal(canvas.current, { once: true });
  };

  // ── drawing

  const hand = useRef<Hand | null>(null);
  const [, setFrame] = useState(0);
  const frame = useRef<unknown>(null);
  // A moving finger is drawn once a frame, however often the phone reports it.
  const redraw = (): void => {
    if (frame.current !== null) return;
    frame.current = nextFrame(() => {
      frame.current = null;
      setFrame((f) => f + 1);
    });
  };
  useEffect(
    () => () => {
      if (frame.current !== null) dropFrame(frame.current);
    },
    [],
  );

  // The responder is created once; this keeps what it reads current.
  const now = useRef({ drawingOn, pen, scale, length, decor, host });
  now.current = { drawingOn, pen, scale, length, decor, host };
  const lift = useRef<() => void>(() => undefined);
  lift.current = () => {
    const h = hand.current;
    hand.current = null;
    if (h?.line && !h.page) {
      const stroke = h.line.done();
      setDrawing((d) => addStroke(d, stroke));
    }
    redraw();
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => now.current.drawingOn,
      onMoveShouldSetPanResponder: () => now.current.drawingOn,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        const n = now.current;
        const ev = e.nativeEvent;
        const s = n.scale || 1;
        const left = pointsLeft(n.decor);
        const line = left >= 2 ? new PenLine(n.pen.tool, n.pen.paint, widthFor(n.pen.tool, n.pen.size), ev.locationX / s, ev.locationY / s, n.length, left) : null;
        const seen = new Map<string, { x: number; y: number }>();
        for (const touch of (ev.touches ?? []) as Touch[]) seen.set(nameOf(touch), { x: touch.pageX, y: touch.pageY });
        // The sheet's screen offset, from where the finger landed; every later point is measured from it.
        hand.current = { line, id: nameOf(ev), ox: ev.pageX - ev.locationX, oy: ev.pageY - ev.locationY, page: false, y: 0, seen };
        redraw();
      },
      onPanResponderMove: (e: GestureResponderEvent) => {
        const h = hand.current;
        if (!h) return;
        const n = now.current;
        const s = n.scale || 1;
        const reported = (e.nativeEvent.touches ?? []) as Touch[];
        const touches = reported.length > 0 ? reported : [e.nativeEvent as Touch];
        const remember = (): void => {
          for (const touch of touches) h.seen.set(nameOf(touch), { x: touch.pageX, y: touch.pageY });
        };
        if (h.page) {
          if (touches.length >= 2) {
            const y = between(touches);
            n.host?.by(h.y - y);
            h.y = y;
          }
          return;
        }
        if (touches.length >= 2 && !h.line?.moved) {
          // Two touches before anything is drawn: two fingers scrolling, or a resting hand and the drawing finger.
          const moved = (touch: Touch): boolean => {
            const was = h.seen.get(nameOf(touch));
            return was !== undefined && Math.hypot(touch.pageX - was.x, touch.pageY - was.y) > STILL;
          };
          const own = touches.find((touch) => nameOf(touch) === h.id);
          const other = touches.find((touch) => nameOf(touch) !== h.id && moved(touch));
          if (other && own && moved(own)) {
            h.page = true;
            h.line = null;
            h.y = between(touches);
            remember();
            redraw();
            return;
          }
          if (other && h.line) {
            // The first touch was a resting hand, so the pen is the finger that moves.
            h.id = nameOf(other);
            h.line = new PenLine(h.line.tool, h.line.color, h.line.width, (other.pageX - h.ox) / s, (other.pageY - h.oy) / s, n.length, pointsLeft(n.decor));
            remember();
            redraw();
            return;
          }
          // Only the pen's finger moved, beside a resting hand, so it draws on.
        }
        // Once a line is under way, other touches are a resting hand and are ignored.
        const own = touches.find((touch) => nameOf(touch) === h.id);
        if (own && h.line?.to((own.pageX - h.ox) / s, (own.pageY - h.oy) / s)) redraw();
        remember();
      },
      onPanResponderRelease: () => lift.current(),
      onPanResponderTerminate: () => lift.current(),
    }),
  ).current;

  const inHand = hand.current?.line && !hand.current.page ? hand.current.line : null;
  const liveLine = inHand ? { tool: inHand.tool, color: inHand.color, width: inHand.width, points: inHand.points } : null;

  // ── notes

  const chosenOne = chosen !== null ? (placed.find((p) => p.key === chosen) ?? null) : null;
  const chosenNote = chosenOne?.note ?? null;

  const addNote = (at?: { x: number; y: number }): void => {
    setNotesFull(false);
    const list = placed.filter(hasWords);
    if (list.length >= NOTES_MAX) {
      setNotesFull(true);
      return;
    }
    const place = at ?? placeForNote(list.map((p) => p.note), writing, length);
    const key = nextKey.current++;
    setPlaced([...list, { key, note: { text: '', x: Math.round(place.x), y: Math.round(place.y), size: 'm', color: paper.ink, turn: 0 } }]);
    setChosen(key);
    setTimeout(() => noteField.current?.focus(), 0);
  };

  const changeNote = (key: number, change: (note: PaperNote) => PaperNote): void => {
    setPlaced((list) => list.map((p) => (p.key === key ? { key, note: change(p.note) } : p)));
  };

  const pickNote = (key: number): void => {
    if (chosen === key) return;
    // The note being edited is put down first, and removed if left without words.
    setPlaced((list) => list.filter((p) => p.key === key || hasWords(p)));
    setChosen(key);
  };

  const deleteNote = (key: number): void => {
    setPlaced((list) => list.filter((p) => p.key !== key));
    setChosen(null);
    setNotesFull(false);
  };

  /** A tap on the paper with the Text tool: adds a note there, or puts down the one being edited. */
  const tapPaper = (x: number, y: number): void => {
    if (chosen !== null) {
      putDown();
      noteField.current?.blur();
      return;
    }
    // A tap without coordinates (screen reader, keyboard) puts the note in the default spot.
    addNote(Number.isFinite(x) && Number.isFinite(y) ? { x: x / (scale || 1), y: y / (scale || 1) } : undefined);
  };

  const noteProblem = chosenNote ? letterProblem(chosenNote.text) : null;
  const noteSaid = noteProblem === 'contact' ? t('letters.paper.noteContact') : noteProblem === 'link' ? t('letters.paper.noteLink') : null;

  // ── the paper

  const changePaper = (next: LetterPaper): void => {
    // A pen in the writing's ink follows the ink when it changes.
    if (next.ink !== paper.ink && pen.paint === paper.ink) setPen((p) => ({ ...p, paint: next.ink }));
    setPaper(next);
  };

  // ── sending

  // The letter and its notes are checked together, as the server does, so a number split between them is still caught;
  // a note that holds one by itself is named as the one to change.
  const noteHoldsOne = kept.some((n) => ['contact', 'link'].includes(letterProblem(n.text) ?? ''));
  const together = kept.length > 0 && !noteHoldsOne ? letterProblem([body, ...kept.map((n) => n.text)].join(' ')) : null;
  const problem = letterProblem(body) ?? (together === 'contact' || together === 'link' ? together : null);
  const typed = [...body.trim()].length;
  const send = (): void => {
    setTried(true);
    setDecorProblem(null);
    if (problem || busy) return;
    const check = checkLetterDecor(decor, { strokes: canDraw });
    if (!check.ok) {
      haptic('error');
      setDecorProblem(check.problem);
      return;
    }
    rememberPaper(paper);
    onSend({ body, decor: check.value });
  };
  const bodySaid = problem && (problem !== 'short' || tried) ? t(PROBLEM[problem]) : null;
  const decorSaid = decorProblem ? t(DECOR_PROBLEM[decorProblem], { max: NOTES_MAX, most: NOTE_MAX }) : null;
  const said = bodySaid ?? decorSaid ?? error ?? null;

  const sheetLabel = `${label}. ${describePaper(t, decor)}`;
  const keepCaretInSight = (): void => {
    if (typing.current) host?.reveal(caret.current);
  };

  // ── the panel under the tools

  const paints = (value: Paint, onPick: (paint: Paint) => void): React.JSX.Element => (
    <SwatchRow label={t('letters.paper.colour')} testID={id('paints')}>
      {PAINTS.map((paint) => (
        <Choice key={paint} label={t(PAINT_NAME[paint])} checked={paint === value} onPress={() => onPick(paint)} testID={id(`paint-${paint}`)}>
          <PaintDot paint={paint} tone={paper.tone} />
        </Choice>
      ))}
    </SwatchRow>
  );

  let panel: React.JSX.Element | null = null;
  if (tool === 'draw' && !canDraw) {
    panel = (
      <View style={[styles.reason, { flexDirection: dir.row }]} accessibilityLiveRegion="polite" testID={id('draw-locked')}>
        <Icon name="lock" size={15} color={colors.textSecondary} />
        <Text style={[styles.quiet, styles.fill, dir.text, { color: colors.textSecondary }]}>{t('letters.paper.drawLocked')}</Text>
      </View>
    );
  } else if (tool === 'draw') {
    panel = (
      <View style={styles.panel}>
        {asking ? (
          <View style={styles.ask} accessibilityLiveRegion="polite">
            <Text style={[styles.quiet, dir.text, { color: colors.textPrimary }]}>{t('letters.paper.clearAsk')}</Text>
            <View style={[styles.askActions, { flexDirection: dir.row }]}>
              <ClayButton
                label={t('letters.paper.clearYes')}
                onPress={() => {
                  setDrawing((d) => clearDrawing(d));
                  setAsking(false);
                }}
                variant="outline"
                style={styles.askAction}
                testID={id('clear-yes')}
              />
              <ClayButton label={t('letters.paper.clearKeep')} onPress={() => setAsking(false)} variant="outline" style={styles.askAction} testID={id('clear-keep')} />
            </View>
          </View>
        ) : (
          <View style={[styles.line, { flexDirection: dir.row }]}>
            <View style={[styles.group, { flexDirection: dir.row }]} accessibilityRole="radiogroup" accessibilityLabel={t('letters.paper.draw')}>
              {DRAW_TOOLS.map((each) => (
                <Choice key={each} label={t(`letters.paper.${each}`)} checked={pen.tool === each} onPress={() => setPen((p) => ({ ...p, tool: each }))} testID={id(`pen-${each}`)}>
                  <ToolSample tool={each} paint={pen.paint} tone={paper.tone} />
                </Choice>
              ))}
            </View>
            <View style={[styles.group, { flexDirection: dir.row }]}>
              <ToolAction label={t('common.undo')} onPress={() => setDrawing((d) => undo(d))} disabled={drawing.done.length === 0} testID={id('undo')}>
                <Glyph kind={rtl ? 'redo' : 'undo'} color={colors.textPrimary} size={20} />
              </ToolAction>
              <ToolAction label={t('letters.paper.redo')} onPress={() => setDrawing((d) => redo(d))} disabled={drawing.undone.length === 0} testID={id('redo')}>
                <Glyph kind={rtl ? 'undo' : 'redo'} color={colors.textPrimary} size={20} />
              </ToolAction>
              <ToolAction label={t('letters.paper.clear')} onPress={() => setAsking(true)} disabled={drawing.strokes.length === 0} testID={id('clear')}>
                <Icon name="trash" size={19} color={colors.textPrimary} />
              </ToolAction>
            </View>
          </View>
        )}
        <View style={[styles.line, { flexDirection: dir.row }]}>
          <View style={[styles.group, { flexDirection: dir.row }]} accessibilityRole="radiogroup" accessibilityLabel={t('letters.paper.size')}>
            {PEN_SIZES.map((size) => (
              <Choice key={size} label={t(`letters.paper.size.${size}`)} checked={pen.size === size} onPress={() => setPen((p) => ({ ...p, size }))} testID={id(`size-${size}`)}>
                <SizeDot tool={pen.tool} size={size} paint={pen.paint} tone={paper.tone} />
              </Choice>
            ))}
          </View>
          <View style={styles.fill}>{paints(pen.paint, (paint) => setPen((p) => ({ ...p, paint })))}</View>
        </View>
        <Text style={[styles.caption, dir.text, { color: room ? colors.textSecondary : colors.danger }]} accessibilityLiveRegion="polite" testID={id('draw-note')}>
          {room ? t('letters.paper.twoFingers') : t('letters.paper.full')}
        </Text>
      </View>
    );
  } else if (tool === 'text' && chosenOne && chosenNote) {
    const key = chosenOne.key;
    panel = (
      <View style={styles.panel}>
        <View style={[styles.line, { flexDirection: dir.row }]}>
          <TextInput
            ref={noteField}
            value={chosenNote.text}
            onChangeText={(text) => changeNote(key, (n) => ({ ...n, text }))}
            onFocus={() => host?.reveal(noteField.current as unknown as View)}
            onBlur={() => host?.reveal(null)}
            maxLength={NOTE_MAX}
            accessibilityLabel={t('letters.paper.note')}
            returnKeyType="done"
            onSubmitEditing={() => noteField.current?.blur()}
            testID={id('note-input')}
            style={[styles.noteField, writingDirection(chosenNote.text, rtl), { color: colors.textPrimary, backgroundColor: colors.controlTrack }]}
          />
          <ClayButton label={t('common.done')} onPress={putDown} variant="outline" testID={id('note-done')} />
        </View>
        <View style={[styles.line, { flexDirection: dir.row }]}>
          <View style={[styles.group, { flexDirection: dir.row }]} accessibilityRole="radiogroup" accessibilityLabel={t('letters.paper.size')}>
            {NOTE_SIZES.map((size) => (
              <Choice key={size} label={t(`letters.paper.size.${size}`)} checked={chosenNote.size === size} onPress={() => changeNote(key, (n) => ({ ...n, size }))} testID={id(`note-size-${size}`)}>
                <Text allowFontScaling={false} style={[styles.sizeA, { fontSize: LETTER_A[size], color: colors.textPrimary }]}>
                  A
                </Text>
              </Choice>
            ))}
          </View>
          <View style={[styles.group, { flexDirection: dir.row }]}>
            <ToolAction label={t('letters.paper.tiltLeft')} onPress={() => changeNote(key, (n) => turnNote(n, -1))} testID={id('note-tilt-left')}>
              <View style={styles.tiltLeft}>
                <Icon name="text-t" size={19} color={colors.textPrimary} />
              </View>
            </ToolAction>
            <ToolAction label={t('letters.paper.tiltRight')} onPress={() => changeNote(key, (n) => turnNote(n, 1))} testID={id('note-tilt-right')}>
              <View style={styles.tiltRight}>
                <Icon name="text-t" size={19} color={colors.textPrimary} />
              </View>
            </ToolAction>
            <ToolAction label={t('letters.paper.deleteNote')} onPress={() => deleteNote(key)} testID={id('note-delete')}>
              <Icon name="trash" size={19} color={colors.textPrimary} />
            </ToolAction>
          </View>
        </View>
        {paints(chosenNote.color, (paint) => changeNote(key, (n) => ({ ...n, color: paint })))}
        {noteSaid ? (
          <Text style={[styles.quiet, dir.text, { color: colors.danger }]} accessibilityLiveRegion="polite" testID={id('note-problem')}>
            {noteSaid}
          </Text>
        ) : null}
      </View>
    );
  } else if (tool === 'text') {
    const full = notesFull || kept.length >= NOTES_MAX;
    panel = (
      <View style={styles.panel}>
        <ClayButton label={t('letters.paper.addNote')} onPress={() => addNote()} variant="outline" icon="plus" disabled={kept.length >= NOTES_MAX} testID={id('add-note')} />
        <Text style={[styles.caption, dir.text, { color: full ? colors.textPrimary : colors.textSecondary }]} accessibilityLiveRegion="polite" testID={id('note-hint')}>
          {full ? t('letters.paper.notesFull', { max: NOTES_MAX }) : t('letters.paper.noteHint')}
        </Text>
      </View>
    );
  } else if (tool === 'paper') {
    panel = (
      <View style={styles.panel}>
        <SwatchRow label={t('letters.paper.lines')} shown testID={id('styles')}>
          {PAPER_STYLES.map((style) => (
            <Choice key={style} label={t(STYLE_NAME[style])} checked={paper.style === style} onPress={() => changePaper({ ...paper, style })} testID={id(`style-${style}`)}>
              <MiniSheet paper={{ ...paper, style }} />
            </Choice>
          ))}
        </SwatchRow>
        <SwatchRow label={t('letters.paper.sheet')} shown testID={id('tones')}>
          {PAPER_TONES.map((tone) => (
            <Choice key={tone} label={t(TONE_NAME[tone])} checked={paper.tone === tone} onPress={() => changePaper({ ...paper, tone })} testID={id(`tone-${tone}`)}>
              <MiniSheet paper={{ ...paper, tone }} />
            </Choice>
          ))}
        </SwatchRow>
        <SwatchRow label={t('letters.paper.ink')} shown testID={id('inks')}>
          {INKS.map((ink) => (
            <Choice key={ink} label={t(inkName(ink))} checked={paper.ink === ink} onPress={() => changePaper({ ...paper, ink })} testID={id(`ink-${ink}`)}>
              <InkSample ink={ink} tone={paper.tone} />
            </Choice>
          ))}
        </SwatchRow>
      </View>
    );
  }

  // The last written line and the two under it are kept above the keyboard.
  const caretTop = Math.max(0, written - (WRITING_FOOT + PAPER_RULE * 2) * scale);

  return (
    <View style={styles.block}>
      <Text style={[styles.label, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
        {label}
      </Text>
      <View ref={canvas} collapsable={false} style={styles.block}>
        <ToolBar tool={tool} onTool={choose} canDraw={canDraw} />
        {panel}

        <View
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          style={[styles.sheet, { height: length * scale, backgroundColor: sheet.sheet, borderColor: sheet.edge }]}
          testID={id('sheet')}
        >
          <PaperPicture paper={paper} length={length} width={width} />
          <StrokeLines strokes={drawing.strokes} live={liveLine} tone={paper.tone} length={length} width={width} />

          {/* The writing, on the rules, in the paper's ink. */}
          <View pointerEvents={tool === 'write' ? 'box-none' : 'none'} style={StyleSheet.absoluteFill}>
            <TextInput
              ref={input}
              value={body}
              onChangeText={setBody}
              multiline
              scrollEnabled={false}
              allowFontScaling={false}
              maxLength={LETTER_MAX + 200}
              placeholder={t('letters.placeholder')}
              placeholderTextColor={sheet.muted}
              accessibilityLabel={sheetLabel}
              accessibilityHint={t('letters.hint')}
              onFocus={() => {
                typing.current = true;
                if (tool !== 'write') choose('write');
                keepCaretInSight();
              }}
              onBlur={() => {
                typing.current = false;
                host?.reveal(null);
              }}
              onContentSizeChange={keepCaretInSight}
              testID={id('input')}
              style={[
                styles.writing,
                writingType(scale),
                writingFrame(paper.style, scale),
                writingDirection(body, rtl),
                { paddingBottom: WRITING_FOOT * scale, minHeight: PAPER_H * scale, color: sheet.ink },
              ]}
            />
            <View ref={caret} collapsable={false} pointerEvents="none" style={[styles.caret, { top: caretTop, height: PAPER_RULE * 3 * scale }]} />
          </View>
          {/*
            The writing's hidden twin in the same type and width, measured to know how far down the writing reaches. A
            field's content size is not reliable across platforms, and the sheet length and new-note placement use this.
          */}
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            allowFontScaling={false}
            onLayout={(e) => {
              setWritten(e.nativeEvent.layout.height + WRITING_FOOT * scale);
              keepCaretInSight();
            }}
            style={[styles.twin, writingType(scale), writingFrame(paper.style, scale), writingDirection(body, rtl)]}
          >
            {body.endsWith('\n') || body.length === 0 ? `${body} ` : body}
          </Text>

          {/* The paper without a pen in hand: a tap adds a note (Text) or picks up the pen to write. */}
          {tool === 'text' ? (
            <Pressable
              accessible={false}
              importantForAccessibility="no"
              onPress={(e) => tapPaper(e.nativeEvent.locationX, e.nativeEvent.locationY)}
              style={StyleSheet.absoluteFill}
              testID={id('paper-tap')}
            />
          ) : tool !== 'write' && !drawingOn ? (
            <Pressable accessible={false} importantForAccessibility="no" onPress={() => choose('write')} style={StyleSheet.absoluteFill} testID={id('paper-tap')} />
          ) : null}

          {placed.map((p) => (
            <NoteOnSheet
              key={p.key}
              note={p.note}
              scale={scale}
              tone={paper.tone}
              active={tool === 'text'}
              selected={tool === 'text' && chosen === p.key}
              host={host}
              onPick={() => pickNote(p.key)}
              onMove={(x, y) => changeNote(p.key, (n) => moveNote(n, x, y, length))}
              testID={id(`note-${p.key}`)}
            />
          ))}

          {drawingOn ? (
            <View {...responder.panHandlers} accessible accessibilityRole="image" accessibilityLabel={sheetLabel} style={StyleSheet.absoluteFill} testID={id('canvas')} />
          ) : null}
        </View>
      </View>

      <View style={[styles.foot, { flexDirection: dir.row }]}>
        <Text style={[styles.hint, dir.text, { color: colors.textSecondary }]}>{t('letters.hint')}</Text>
        <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.count, { color: typed > LETTER_MAX ? colors.danger : colors.textSecondary }]}>
          {typed} / {LETTER_MAX}
        </Text>
      </View>
      {said ? (
        <Text accessibilityLiveRegion="polite" testID={id('problem')} style={[styles.problem, dir.text, { color: colors.danger }]}>
          {said}
        </Text>
      ) : null}
      <View style={[styles.actions, { flexDirection: dir.row }]}>
        {onCancel ? <ClayButton label={t('common.cancel')} onPress={onCancel} variant="outline" disabled={busy} testID={id('cancel')} /> : null}
        <ClayButton label={busy ? t('letters.sending') : (sendLabel ?? t('letters.send'))} onPress={send} tone="primary" busy={busy} style={styles.send} testID={id('send')} />
      </View>
    </View>
  );
}

/** The size of the "A" each note size shows as, in points. */
const LETTER_A: Readonly<Record<PaperNote['size'], number>> = { s: 13, m: 17, l: 23 };

/**
 * A note on the sheet being written. With the Text tool, a touch selects it and a drag moves it while the page holds
 * still; screen readers select and move it with actions instead, a step at a time.
 */
function NoteOnSheet({
  note,
  scale,
  tone,
  active,
  selected,
  host,
  onPick,
  onMove,
  testID,
}: {
  note: PaperNote;
  scale: number;
  tone: PaperTone;
  active: boolean;
  selected: boolean;
  host?: PaperHost;
  onPick: () => void;
  onMove: (x: number, y: number) => void;
  testID?: string;
}): React.JSX.Element {
  const { t } = useI18n();
  const now = useRef({ note, scale, active, host, onPick, onMove });
  now.current = { note, scale, active, host, onPick, onMove };
  const from = useRef({ x: 0, y: 0 });
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => now.current.active,
      onMoveShouldSetPanResponder: () => now.current.active,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        from.current = { x: now.current.note.x, y: now.current.note.y };
        now.current.host?.lock(true);
        now.current.onPick();
      },
      onPanResponderMove: (_e, g) => {
        const s = now.current.scale || 1;
        now.current.onMove(from.current.x + g.dx / s, from.current.y + g.dy / s);
      },
      onPanResponderRelease: () => now.current.host?.lock(false),
      onPanResponderTerminate: () => now.current.host?.lock(false),
    }),
  ).current;
  const moves = [
    { name: 'up', label: t('letters.paper.move.up'), dx: 0, dy: -NUDGE.y },
    { name: 'down', label: t('letters.paper.move.down'), dx: 0, dy: NUDGE.y },
    { name: 'left', label: t('letters.paper.move.left'), dx: -NUDGE.x, dy: 0 },
    { name: 'right', label: t('letters.paper.move.right'), dx: NUDGE.x, dy: 0 },
  ];
  return (
    <View pointerEvents={active ? 'box-none' : 'none'} style={StyleSheet.absoluteFill}>
      <NoteMark
        note={note}
        tone={tone}
        scale={scale}
        selected={selected}
        handlers={active ? responder.panHandlers : undefined}
        label={note.text ? t('letters.paper.noteSaid', { text: note.text }) : t('letters.paper.note')}
        actions={active ? [{ name: 'activate', label: t('letters.paper.note') }, ...moves.map(({ name, label }) => ({ name, label }))] : undefined}
        onAction={(name) => {
          if (name === 'activate') {
            onPick();
            return;
          }
          const move = moves.find((m) => m.name === name);
          if (move) onMove(note.x + move.dx, note.y + move.dy);
        }}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm },
  label: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  panel: { gap: spacing.xs + 2 },
  line: { alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  group: { alignItems: 'center', gap: 2 },
  fill: { flex: 1 },
  reason: { alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.xs },
  quiet: { fontSize: typography.sizes.sm, lineHeight: 20 },
  caption: { fontSize: typography.sizes.xs, lineHeight: 17 },
  ask: { gap: spacing.sm },
  askActions: { flexWrap: 'wrap', gap: spacing.sm },
  askAction: { flexGrow: 1 },
  sizeA: { fontWeight: typography.weights.semibold },
  tiltLeft: { transform: [{ rotate: '-15deg' }] },
  tiltRight: { transform: [{ rotate: '15deg' }] },
  noteField: { flex: 1, minWidth: 0, minHeight: MIN_TOUCH_TARGET, borderRadius: radii.md, paddingHorizontal: spacing.md - 4, fontSize: typography.sizes.md },
  // Barely rounded corners, and a hairline where the paper meets the screen.
  sheet: { alignSelf: 'stretch', overflow: 'hidden', borderRadius: radii.xs, borderWidth: StyleSheet.hairlineWidth },
  writing: { minHeight: MIN_TOUCH_TARGET, textAlignVertical: 'top', includeFontPadding: false },
  caret: { position: 'absolute', left: 0, right: 0 },
  twin: { position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 },
  foot: { justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  hint: { flex: 1, fontSize: typography.sizes.xs, lineHeight: 17 },
  count: { fontSize: typography.sizes.xs, fontVariant: ['tabular-nums'] },
  problem: { fontSize: typography.sizes.sm, lineHeight: 19 },
  actions: { alignItems: 'center', gap: spacing.sm },
  send: { flex: 1 },
});
