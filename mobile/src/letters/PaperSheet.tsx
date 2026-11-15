import { memo, useMemo, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions, type GestureResponderHandlers, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Path, SvgXml } from 'react-native-svg';
import {
  DEFAULT_PAPER,
  NOTE_TEXT,
  PAPER_H,
  PAPER_RULE,
  PAPER_TEXT,
  PAPER_W,
  STROKE_LOOK,
  isRtlText,
  letterPaperSvg,
  paintColor,
  paperColors,
  strokePath,
  type Ink,
  type LetterDecor,
  type LetterPaper,
  type Paint,
  type PaperColors,
  type PaperNote,
  type PaperStroke,
  type PaperStyle,
  type PaperTone,
} from '@kurda/shared';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import type { Translate } from '../api/errors';
import { useTheme } from '../theme/ThemeProvider';
import { fontScaleCap, layout, radii, typography } from '../theme/tokens';
import { displayFont } from '../theme/fonts';
import { Icon } from '../theme/Icon';
import { DRAWING_DEEPEST, NOTE_WIDTH, WRITING_TOP, pagesFor, writingInsets } from './paperKit';

/**
 * A sheet of letter paper on the phone, as it is read and as it is written
 * on (LetterComposer.tsx): the paper itself from the shared picture
 * (art/letter-paper.ts), what is drawn on it, the writing on its rules in the
 * paper's ink, and the notes stuck to it. The website draws the same page.
 *
 * The page is laid out in its own units (shared PAPER_W across) and shown as
 * wide as the screen allows, so the writing is set at the page's own size for
 * its width — a line's height is one rule — and wraps where it wrapped for the
 * one who wrote it, on any phone. A paper keeps its colours in the dark: it is
 * paper, not part of the screen. The writing and the notes are the phone's own
 * text, so Kurmancî and Soranî shape properly and a screen reader reads them;
 * the picture under them is decoration, and the sheet says in words what it is
 * — its paper, and that something is drawn on it.
 */

export const HIDDEN = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

/** Each paper, line style and colour by its name, for whoever cannot see it. */
export const STYLE_NAME: Readonly<Record<PaperStyle, TranslationKey>> = {
  plain: 'letters.paper.style.plain',
  lined: 'letters.paper.style.lined',
  margin: 'letters.paper.style.margin',
  grid: 'letters.paper.style.grid',
  dotted: 'letters.paper.style.dotted',
};
export const TONE_NAME: Readonly<Record<PaperTone, TranslationKey>> = {
  cream: 'letters.paper.tone.cream',
  white: 'letters.paper.tone.white',
  rose: 'letters.paper.tone.rose',
  sky: 'letters.paper.tone.sky',
  sage: 'letters.paper.tone.sage',
  lavender: 'letters.paper.tone.lavender',
  kraft: 'letters.paper.tone.kraft',
  night: 'letters.paper.tone.night',
};
export const PAINT_NAME: Readonly<Record<Paint, TranslationKey>> = {
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
export const inkName = (ink: Ink): TranslationKey => PAINT_NAME[ink];

/** What a sheet is, in words: its paper, and whether something is drawn or stuck on it. */
export function describePaper(t: Translate, decor: { paper: LetterPaper; strokes: readonly PaperStroke[]; notes: readonly PaperNote[] }): string {
  const { paper, strokes, notes } = decor;
  const parts = [t('letters.paper.describe', { tone: t(TONE_NAME[paper.tone]), style: t(STYLE_NAME[paper.style]) })];
  if (strokes.length > 0) parts.push(t('letters.paper.hasDrawing'));
  if (notes.length === 1) parts.push(t('letters.paper.hasNote'));
  else if (notes.length > 1) parts.push(t('letters.paper.hasNotes', { count: notes.length }));
  return parts.join(' ');
}

/**
 * How wide a sheet is shown before the screen has said: the screen's width
 * inside its gutters, or, where there is no screen to ask (a test), a phone's.
 */
export function useSheetWidth(): [number, (w: number) => void] {
  const { width: screen } = useWindowDimensions();
  const [measured, setMeasured] = useState(0);
  const guess = screen > 0 ? screen - layout.gutter * 2 : 340;
  return [measured > 0 ? measured : guess, setMeasured];
}

/** The colours of a sheet on this screen: its own, whatever the theme, but for the hairline round it. */
export function useSheetColors(paper: LetterPaper): PaperColors {
  const { scheme } = useTheme();
  return useMemo(() => paperColors(paper, scheme), [paper, scheme]);
}

/** The writing's type on a sheet `scale` points to a page unit: the page's own size, its lines one rule apart. */
export function writingType(scale: number): TextStyle {
  return { fontSize: PAPER_TEXT * scale, lineHeight: PAPER_RULE * scale, includeFontPadding: false };
}

/** Where the writing sits on a sheet: from its first line down, inset from the edges as the paper's style asks. */
export function writingFrame(style: PaperStyle, scale: number): ViewStyle {
  const inset = writingInsets(style);
  return { paddingTop: WRITING_TOP * scale, paddingLeft: inset.left * scale, paddingRight: inset.right * scale };
}

/** Which way a letter reads and lines up: its own script decides, and an empty one follows the screen. */
export function writingDirection(body: string, screenRtl: boolean): TextStyle {
  const rtl = body.trim().length > 0 ? isRtlText(body) : screenRtl;
  return { writingDirection: rtl ? 'rtl' : 'ltr', textAlign: rtl ? 'right' : 'left' };
}

/** The paper itself, its rules, margin, squares or dots, and what is drawn on it when it is only to be looked at. */
export const PaperPicture = memo(function PaperPicture({
  paper,
  strokes,
  length,
  width,
}: {
  paper: LetterPaper;
  strokes?: readonly PaperStroke[];
  /** in page units: the picture goes no further than a drawing may, and the sheet's own colour is under the rest */
  length: number;
  width: number;
}): React.JSX.Element | null {
  const { t } = useI18n();
  const drawn = Math.min(length, DRAWING_DEEPEST);
  // the picture names itself in the reader's language (it would say so in English otherwise), though the sheet round it is what is read out
  const title = describePaper(t, { paper, strokes: NONE, notes: NONE_NOTES });
  const xml = useMemo(() => (width > 0 ? letterPaperSvg({ paper, strokes, length: drawn, width, title }) : ''), [paper, strokes, drawn, width, title]);
  if (!xml) return null;
  return (
    <View {...HIDDEN} pointerEvents="none" style={[styles.picture, { height: (drawn * width) / PAPER_W }]}>
      <SvgXml xml={xml} width={width} height={(drawn * width) / PAPER_W} />
    </View>
  );
});

/** One line drawn on the paper, as the shared picture draws it: the brush with its soft edge, the marker see-through. */
const StrokeShape = memo(function StrokeShape({ stroke, tone }: { stroke: Pick<PaperStroke, 'tool' | 'color' | 'width' | 'points'>; tone: PaperTone }) {
  const d = strokePath(stroke);
  if (!d) return null;
  const look = STROKE_LOOK[stroke.tool] ?? STROKE_LOOK.pen;
  const color = paintColor(stroke.color, tone);
  return (
    <>
      {look.halo ? <Path d={d} stroke={color} strokeWidth={stroke.width * look.halo.width} strokeOpacity={look.halo.opacity} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
      <Path d={d} stroke={color} strokeWidth={stroke.width} strokeOpacity={look.opacity} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
});

/**
 * The drawing as lines the phone draws itself, over the paper, while it is
 * being made: a line added draws only that line, and the one under the finger
 * follows it (`live`) without the page being drawn again.
 */
export function StrokeLines({
  strokes,
  live,
  tone,
  length,
  width,
}: {
  strokes: readonly PaperStroke[];
  live: Pick<PaperStroke, 'tool' | 'color' | 'width' | 'points'> | null;
  tone: PaperTone;
  length: number;
  width: number;
}): React.JSX.Element {
  const drawn = Math.min(length, DRAWING_DEEPEST);
  return (
    <View {...HIDDEN} pointerEvents="none" style={[styles.picture, { height: (drawn * width) / PAPER_W }]}>
      <Svg width={width} height={(drawn * width) / PAPER_W} viewBox={`0 0 ${PAPER_W} ${drawn}`} testID="letter-paper-strokes">
        {strokes.map((s, i) => (
          <StrokeShape key={i} stroke={s} tone={tone} />
        ))}
        {live ? <StrokeShape key="live" stroke={live} tone={tone} /> : null}
      </Svg>
    </View>
  );
}

/** How tall the box a note is centred in is, in page units: taller than any note, so the note is in its middle whatever its lines. */
const NOTE_BOX = 520;

/**
 * A note stuck on the paper: its words in its colour and size, centred where
 * it was put and turned as it was placed. Its box lets touches through except
 * on the note itself, so the paper round it can still be touched.
 */
export function NoteMark({
  note,
  tone,
  scale,
  selected = false,
  handlers,
  label,
  actions,
  onAction,
  testID,
}: {
  note: PaperNote;
  tone: PaperTone;
  scale: number;
  /** the note being changed: ringed, so it is clear which one the tools are for */
  selected?: boolean;
  handlers?: GestureResponderHandlers;
  label: string;
  actions?: { name: string; label: string }[];
  onAction?: (name: string) => void;
  testID?: string;
}): React.JSX.Element {
  const colors = paperColors({ ...DEFAULT_PAPER, tone });
  const size = NOTE_TEXT[note.size] * scale;
  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.noteBox,
        { left: (note.x - NOTE_WIDTH / 2) * scale, top: (note.y - NOTE_BOX / 2) * scale, width: NOTE_WIDTH * scale, height: NOTE_BOX * scale },
      ]}
    >
      <View
        {...handlers}
        accessible
        accessibilityLabel={label}
        accessibilityActions={actions}
        onAccessibilityAction={onAction ? (e) => onAction(e.nativeEvent.actionName) : undefined}
        testID={testID}
        style={[
          styles.note,
          { transform: [{ rotate: `${note.turn}deg` }], paddingHorizontal: 10 * scale, paddingVertical: 4 * scale },
          selected ? { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.muted } : styles.noteQuiet,
        ]}
      >
        <Text
          allowFontScaling={false}
          style={[styles.noteText, writingDirection(note.text, false), { fontSize: size, lineHeight: size * 1.25, color: paintColor(note.color, tone), textAlign: 'center' }]}
        >
          {note.text || ' '}
        </Text>
      </View>
    </View>
  );
}

/**
 * A letter as it is read, on its own paper: who wrote it and when at the top
 * of the sheet, the writing on its rules, the drawing and the notes. A letter
 * with no decor is on the default paper with nothing on it.
 */
export function LetterOnPaper({
  body,
  decor,
  from,
  when,
  pinned = false,
  testID,
}: {
  body: string;
  decor: LetterDecor | null;
  from: string;
  when: string;
  /** the letter is the one on your widget */
  pinned?: boolean;
  testID?: string;
}): React.JSX.Element {
  const { t, rtl } = useI18n();
  const paper = decor?.paper ?? DEFAULT_PAPER;
  const strokes = decor?.strokes ?? NONE;
  const notes = decor?.notes ?? NONE_NOTES;
  const colors = useSheetColors(paper);
  const [width, setWidth] = useSheetWidth();
  const [written, setWritten] = useState(0);
  const scale = width / PAPER_W;
  const length = pagesFor(scale > 0 ? WRITING_TOP + written / scale : 0, strokes, notes) * PAPER_H;
  const inset = writingInsets(paper.style);
  const head = `${t('letters.fromWhom', { name: from })}, ${when}. ${describePaper(t, { paper, strokes, notes })}${pinned ? ` ${t('letters.pin.mark')}.` : ''}`;
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.sheet, { height: length * scale, backgroundColor: colors.sheet, borderColor: colors.edge }]}
      testID={testID}
    >
      <PaperPicture paper={paper} strokes={strokes} length={length} width={width} />
      <View
        accessible
        accessibilityLabel={head}
        style={[styles.head, { top: 34 * scale, left: inset.left * scale, right: inset.right * scale, flexDirection: rtl ? 'row-reverse' : 'row' }]}
      >
        <Text maxFontSizeMultiplier={fontScaleCap.fixedBox} numberOfLines={1} style={[styles.from, { color: colors.ink }]}>
          {from}
        </Text>
        <View style={[styles.headEnd, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          {pinned ? <Icon name="pin" size={12} color={colors.muted} /> : null}
          <Text maxFontSizeMultiplier={fontScaleCap.fixedBox} numberOfLines={1} style={[styles.when, { color: colors.muted }]}>
            {when}
          </Text>
        </View>
      </View>
      <View pointerEvents="box-none" style={writingFrame(paper.style, scale)}>
        <Text
          allowFontScaling={false}
          selectable
          onLayout={(e) => setWritten(e.nativeEvent.layout.height)}
          style={[writingType(scale), writingDirection(body, rtl), { color: colors.ink }]}
        >
          {body}
        </Text>
      </View>
      {notes.map((note, i) => (
        <NoteMark key={i} note={note} tone={paper.tone} scale={scale} label={t('letters.paper.noteSaid', { text: note.text })} testID={`letter-note-${i}`} />
      ))}
    </View>
  );
}

const NONE: readonly PaperStroke[] = [];
const NONE_NOTES: readonly PaperNote[] = [];

const styles = StyleSheet.create({
  // a sheet of paper: its corners barely rounded, a hairline where it meets the screen
  sheet: { alignSelf: 'stretch', overflow: 'hidden', borderRadius: radii.xs, borderWidth: StyleSheet.hairlineWidth },
  picture: { position: 'absolute', left: 0, right: 0, top: 0 },
  head: { position: 'absolute', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  headEnd: { alignItems: 'center', gap: 4, flexShrink: 0 },
  from: { flexShrink: 1, fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
  when: { fontSize: typography.sizes.xs },
  noteBox: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  note: { borderRadius: radii.xs, maxWidth: '100%' },
  noteQuiet: { borderWidth: 1.5, borderColor: 'transparent' },
  noteText: { fontFamily: displayFont, fontWeight: typography.weights.semibold },
});
