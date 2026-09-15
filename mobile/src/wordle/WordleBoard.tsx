import { Animated, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { Palette } from '../theme/palette';
import type { BoardRow, Feedback } from './board';

/**
 * The grid of guessed letters.
 *
 * Pulled out of the solo screen so Wordle Battle can show the same board rather
 * than a second one that drifts — the colours, the sizing rule and the letter
 * announcements are all decisions worth having in one place.
 */
export function WordleBoard({
  board,
  cellSize,
  shake,
}: {
  board: BoardRow[];
  cellSize: number;
  /** solo shakes the board on a rejected guess; a battle need not */
  shake?: Animated.Value;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();

  const rows = board.map((row, ri) => (
    <View key={ri} style={styles.row}>
      {row.cells.map((cell, ci) => (
        <View
          key={ci}
          accessibilityLabel={cellLabel(cell.letter, cell.feedback, t)}
          style={[
            styles.cell,
            {
              width: cellSize,
              height: cellSize,
              backgroundColor: cell.feedback ? feedbackColor(cell.feedback, colors) : 'transparent',
              borderColor: cell.letter && !cell.feedback ? colors.primary : colors.glassBorder,
            },
          ]}
        >
          <Text
            style={[
              styles.cellText,
              { color: cell.feedback ? colors.textOnPrimary : colors.textPrimary, fontSize: cellSize * 0.42 },
            ]}
          >
            {cell.letter.toUpperCase()}
          </Text>
        </View>
      ))}
    </View>
  ));

  if (!shake) return <View style={styles.board}>{rows}</View>;
  return (
    <Animated.View
      style={[
        styles.board,
        { transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] }) }] },
      ]}
    >
      {rows}
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
  cellText: { fontWeight: typography.weights.bold },
});
