import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { springTo, timing } from '../theme/animate';
import { fontScaleCap, radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { Palette } from '../theme/palette';
import type { BoardCell, BoardRow, Feedback } from './board';

/**
 * A scored row turns its cells one after another, each this long after the
 * one before it and taking this long to turn: the numbers a join code's boxes
 * turn green on (play/JoinByCode.tsx), so the two feel like one thing.
 */
export const TURN_STAGGER_MS = 80;
export const TURN_MS = 300;

/** How long a row of `cells` takes to turn, first cell to last: nothing under Reduce Motion, where the colours are simply there. */
export function turnMs(cells: number, reduce: boolean): number {
  return reduce || cells <= 0 ? 0 : (cells - 1) * TURN_STAGGER_MS + TURN_MS;
}

/** How small a letter starts as it is typed into its cell, before it springs to its size. */
const TYPED_FROM = 0.86;

/**
 * The grid of guessed letters.
 *
 * Pulled out of the solo screen so Peyvok Battle can show the same board rather
 * than a second one that drifts — the colours, the sizing rule and the letter
 * announcements are all decisions worth having in one place.
 *
 * It answers the two things done on it. A letter typed pops into its cell, so
 * the key is seen to have landed where the eye already is. And a guess the
 * server has scored turns over a cell at a time, each showing its colour as it
 * comes round: what the guess was worth is the moment of the game, and it used
 * to be five squares changing colour between two frames. Only a row scored
 * while the board is on screen turns; the rows of a game opened again are
 * simply there. Under Reduce Motion nothing moves and the colours say it all.
 *
 * A caller gives a new game a new `key`, so the board starts afresh with it.
 */
export function WordleBoard({
  board,
  cellSize,
  shake,
}: {
  board: BoardRow[];
  cellSize: number;
  /** solo shakes the board on a rejected guess (`useShake`'s points sideways); a battle need not */
  shake?: Animated.Value;
}): React.JSX.Element {
  const reduce = useReducedMotion();
  const done = board.reduce((n, r) => n + (r.state === 'done' ? 1 : 0), 0);
  // the rows already scored when the board was first drawn: those are shown as they are
  const base = useRef(done).current;
  // each row scored since, by its place: one value a cell, 0 before it has turned and 1 after
  const turns = useRef(new Map<number, Animated.Value[]>()).current;
  const turning = useRef(new Set<number>()).current;
  const turnOf = (row: number, cells: number): Animated.Value[] | null => {
    if (reduce || row < base) return null;
    let values = turns.get(row);
    if (!values) {
      values = Array.from({ length: cells }, () => new Animated.Value(0));
      turns.set(row, values);
    }
    return values;
  };
  useEffect(() => {
    for (const [row, values] of turns) {
      if (turning.has(row)) continue;
      turning.add(row);
      Animated.stagger(
        TURN_STAGGER_MS,
        values.map((v) => timing(v, 1, TURN_MS, { easing: Easing.inOut(Easing.quad) })),
      ).start();
    }
  }, [done, turns, turning]);

  // a letter typed into the row being written: its cell pops, once, as it lands
  const active = board.find((r) => r.state === 'active');
  const typed = active ? active.cells.map((c) => c.letter) : [];
  const typedKey = typed.join('|');
  const pops = useRef<Animated.Value[]>([]).current;
  while (pops.length < typed.length) pops.push(new Animated.Value(1));
  const before = useRef<string[]>(typed);
  useEffect(() => {
    const was = before.current;
    before.current = typed;
    if (reduce) return;
    typed.forEach((letter, i) => {
      if (!letter || was[i]) return;
      const v = pops[i]!;
      v.stopAnimation();
      v.setValue(TYPED_FROM);
      springTo(v, 1, 'bouncy').start();
    });
    // once for each change to what is typed
  }, [typedKey, reduce]);

  const rows = board.map((row, ri) => {
    const turn = row.state === 'done' ? turnOf(ri, row.cells.length) : null;
    return (
      <View key={ri} style={styles.row}>
        {row.cells.map((cell, ci) => (
          <Cell key={ci} cell={cell} size={cellSize} turn={turn?.[ci] ?? null} pop={row.state === 'active' ? (pops[ci] ?? null) : null} />
        ))}
      </View>
    );
  });

  if (!shake) return <View style={styles.board}>{rows}</View>;
  return (
    <Animated.View style={[styles.board, { transform: [{ translateX: shake }] }]}>
      {rows}
    </Animated.View>
  );
}

/**
 * One square. Scored and turning (`turn`), it is drawn twice over: as it was
 * typed, until it is edge-on, and in its colour from there — one value on the
 * native driver, so the colour changes exactly as the square is side-on and
 * nothing waits on a timer.
 */
function Cell({ cell, size, turn, pop }: { cell: BoardCell; size: number; turn: Animated.Value | null; pop: Animated.Value | null }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const letter = cell.letter.toUpperCase();
  const box = { width: size, height: size };
  const text = { fontSize: size * 0.42 };
  const typedFace = { backgroundColor: 'transparent', borderColor: cell.letter ? colors.primary : colors.glassBorder };
  const scoredFace = { backgroundColor: feedbackColor(cell.feedback, colors), borderColor: colors.glassBorder };
  // the square is sized in points, so its letter grows only as far as still fits it
  const glyph = (ink: string) => (
    <Text style={[styles.cellText, text, { color: ink }]} maxFontSizeMultiplier={fontScaleCap.fixedBox}>
      {letter}
    </Text>
  );
  if (cell.feedback && turn) {
    const rotateX = turn.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '90deg', '0deg'] });
    const scored = turn.interpolate({ inputRange: [0, 0.49, 0.51, 1], outputRange: [0, 0, 1, 1] });
    const typed = turn.interpolate({ inputRange: [0, 0.49, 0.51, 1], outputRange: [1, 1, 0, 0] });
    return (
      <Animated.View accessibilityLabel={cellLabel(cell.letter, cell.feedback, t)} style={[box, { transform: [{ perspective: 500 }, { rotateX }] }]} testID="peyvok-cell-turning">
        <Animated.View style={[styles.cell, styles.face, typedFace, { opacity: typed }]}>{glyph(colors.textPrimary)}</Animated.View>
        <Animated.View style={[styles.cell, styles.face, scoredFace, { opacity: scored }]}>{glyph(feedbackInk(cell.feedback, colors))}</Animated.View>
      </Animated.View>
    );
  }
  return (
    <Animated.View
      accessibilityLabel={cellLabel(cell.letter, cell.feedback, t)}
      style={[styles.cell, box, cell.feedback ? scoredFace : typedFace, pop ? { transform: [{ scale: pop }] } : null]}
    >
      {glyph(feedbackInk(cell.feedback, colors))}
    </Animated.View>
  );
}

/** The colour a scored letter is shown in — the solo screen's palette, unchanged. */
export function feedbackColor(f: Feedback | null, colors: Palette): string {
  if (f === 'green') return colors.success;
  if (f === 'yellow') return colors.gold;
  if (f === 'gray') return colors.textSecondary;
  return 'transparent';
}

/**
 * The colour a letter is written in on the fill `feedbackColor` gives it.
 *
 * A letter in the wrong square sits on the gold, and the white of a button's
 * label is 2.1:1 there by day, so it takes the ink made for gold. Green and
 * grey are dark enough by day, and light enough by evening, for the label
 * colour; a letter not scored yet has no fill and is plain text.
 */
export function feedbackInk(f: Feedback | null, colors: Palette): string {
  if (f === 'yellow') return colors.textOnGold;
  return f ? colors.textOnPrimary : colors.textPrimary;
}

/**
 * What a letter is called out as.
 *
 * A screen reader gets the letter and how it scored — "K, correct" — because a
 * bare letter tells somebody who cannot see the colour nothing at all.
 */
export function cellLabel(
  letter: string,
  feedback: Feedback | null,
  t: (key: 'games.wordle.emptyCell' | 'games.wordle.letterCorrect' | 'games.wordle.letterPresent' | 'games.wordle.letterAbsent') => string,
): string {
  if (!letter) return t('games.wordle.emptyCell');
  if (!feedback) return letter;
  return `${letter}, ${feedbackWord(feedback, t)}`;
}

export function feedbackWord(
  feedback: Feedback,
  t: (key: 'games.wordle.letterCorrect' | 'games.wordle.letterPresent' | 'games.wordle.letterAbsent') => string,
): string {
  if (feedback === 'green') return t('games.wordle.letterCorrect');
  if (feedback === 'yellow') return t('games.wordle.letterPresent');
  return t('games.wordle.letterAbsent');
}

/** Cells shrink to fit a longer word, and never grow past a comfortable tap. */
export const cellSizeFor = (targetLength: number): number => Math.min(56, Math.floor(300 / Math.max(5, targetLength)));

const styles = StyleSheet.create({
  board: { alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  row: { flexDirection: 'row', gap: spacing.xs },
  cell: { borderRadius: radii.sm, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  // the two faces of a square that is turning, one over the other
  face: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  cellText: { fontWeight: typography.weights.bold },
});
