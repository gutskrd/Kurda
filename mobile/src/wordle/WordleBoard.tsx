import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { springTo, timing } from '../theme/animate';
import { fontScaleCap, radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { Palette } from '../theme/palette';
import { tileTone } from '../theme/tileTones';
import type { BoardCell, BoardRow, Feedback } from './board';

/**
 * A scored row turns its cells in sequence, each this long after the last and taking this long, the same timing
 * as the join-code boxes (play/JoinByCode.tsx).
 */
export const TURN_STAGGER_MS = 80;
export const TURN_MS = 300;

/** How long a row of `cells` takes to turn, first to last: nothing under Reduce Motion, where the colours just appear. */
export function turnMs(cells: number, reduce: boolean): number {
  return reduce || cells <= 0 ? 0 : (cells - 1) * TURN_STAGGER_MS + TURN_MS;
}

/** How small a letter starts as it is typed into its cell, before it springs to its size. */
const TYPED_FROM = 0.86;

/**
 * The grid of guessed letters, shared by the solo screen and Peyvok Battle so the colours, sizing and
 * announcements stay in one place.
 *
 * A typed letter pops into its cell, and a scored guess turns over cell by cell, each revealing its colour. Only
 * rows scored while the board is on screen turn; a reopened game's rows are static. Under Reduce Motion nothing
 * moves. A caller gives a new game a new `key`, so the board starts afresh.
 */
export function WordleBoard({
  board,
  cellSize,
  shake,
}: {
  board: BoardRow[];
  cellSize: number;
  /** Solo shakes the board on a rejected guess (`useShake`'s points sideways); a battle need not. */
  shake?: Animated.Value;
}): React.JSX.Element {
  const reduce = useReducedMotion();
  const done = board.reduce((n, r) => n + (r.state === 'done' ? 1 : 0), 0);
  // Rows already scored when the board first drew are shown as they are.
  const base = useRef(done).current;
  // Each row scored since, by its place: one value a cell, 0 before it has turned and 1 after.
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

  // A letter typed into the row being written: its cell pops, once, as it lands.
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
    // Once for each change to what is typed.
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
 * One square. When scored and turning (`turn`) it is drawn twice, as typed until edge-on and in its colour after,
 * on one native-driver value, so the colour changes exactly at side-on with no timer.
 */
function Cell({ cell, size, turn, pop }: { cell: BoardCell; size: number; turn: Animated.Value | null; pop: Animated.Value | null }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const letter = cell.letter.toUpperCase();
  const box = { width: size, height: size };
  const text = { fontSize: size * 0.42 };
  // An empty square has the quiet edge of a tile waiting to be chosen, visible on the day's pale page.
  const typedFace = { backgroundColor: 'transparent', borderColor: cell.letter ? colors.primary : tileTone(colors, 'idle').edge };
  const fill = feedbackColor(cell.feedback, colors);
  const scoredFace = { backgroundColor: fill, borderColor: fill };
  // The square is sized in points, so its letter grows only as far as still fits it.
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
 * The colour a letter is written in on its `feedbackColor` fill. A misplaced letter sits on gold, where the white
 * label colour is only 2.1:1 by day, so it uses the ink made for gold. Green and grey suit the label colour in
 * either scheme; an unscored letter has no fill and is plain text.
 */
export function feedbackInk(f: Feedback | null, colors: Palette): string {
  if (f === 'yellow') return colors.textOnGold;
  return f ? colors.textOnPrimary : colors.textPrimary;
}

/**
 * What a letter is announced as: the letter and its score ("K, correct"), since a bare letter tells someone who
 * cannot see the colour nothing.
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
  // The two faces of a square that is turning, one over the other.
  face: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  cellText: { fontWeight: typography.weights.bold },
});
