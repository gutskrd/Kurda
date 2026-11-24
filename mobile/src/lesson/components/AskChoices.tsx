import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { WORD_PICTURES, wordPictureSvg, type WordPictureId } from '@kurda/shared';
import { haptic } from '../../feedback/haptics';
import { useI18n } from '../../i18n/I18nContext';
import { formatNumber } from '../../i18n/format';
import { useDirection } from '../../reports/direction';
import { Icon } from '../../theme/Icon';
import { AnswerMotion } from '../../theme/MotionParts';
import { Tile, type TileState } from '../../theme/Tile';
import { useTheme } from '../../theme/ThemeProvider';
import { display } from '../../theme/fonts';
import { layout, radii, spacing, typography } from '../../theme/tokens';
import { useValley } from '../ValleyScope';
import { CARD } from '../valley';
import { OptionChip } from './OptionChip';
import { usePageWidth } from '../../theme/pageWidth';

/*
 * Answers that are not a list of lines: pictures to choose a word's meaning among, and short Kurdish words to fill a
 * line's gap. Both react like the option cards: ringed red when chosen, then a green check when right, or a red
 * cross with the right one checked.
 */

interface ChoiceProps {
  options: string[];
  choice: number | null;
  onSelect: (index: number) => void;
  disabled: boolean;
  /** Once graded, whether an option is the right one; false for all while choosing. */
  isRight: (index: number) => boolean;
  graded: boolean;
}

/** A choice's tile state by its index, as the option cards are told. */
function stateOf(i: number, { choice, isRight, graded }: Pick<ChoiceProps, 'choice' | 'isRight' | 'graded'>): TileState {
  const selected = choice === i;
  if (isRight(i)) return 'right';
  if (graded && selected) return 'wrong';
  if (graded) return 'disabled';
  return selected ? 'picked' : 'idle';
}

/** The gap between picture cards, across and between rows. */
const GRID_GAP = spacing.sm + 4;

/** A picture card's minimum width for three to a row. */
const MIN_CARD = 100;
const MAX_CARD = 168;

/** The picture's size bounds on its card. */
const MIN_PICTURE = 72;
const MAX_PICTURE = 112;

/** Cards per row: three where three fit, four where four do, otherwise two by two. */
function pictureColumns(count: number, width: number): number {
  const fits = (n: number): boolean => MIN_CARD <= (width - (n - 1) * GRID_GAP) / n;
  if (count < 3) return Math.max(1, count);
  if (count === 3) return fits(3) ? 3 : 2;
  // Four only where each could be full size: a tablet, not a phone held sideways.
  return count === 4 && 4 * MAX_CARD <= width ? 4 : 2;
}

let grids = 0;

/**
 * Pictures to choose what the bubble's word is: square cards with a number but no word, since reading the answer
 * off the card would be no question. Screen readers hear each picture's English name; a picture the app cannot draw
 * (from a newer server) shows its name instead.
 */
export function PictureChoices({ options, choice, onSelect, disabled, isRight, graded }: ChoiceProps): React.JSX.Element {
  const { t, locale } = useI18n();
  const dir = useDirection();
  const pageWide = usePageWidth();
  const [width, setWidth] = useState(pageWide - 2 * layout.gutter);
  const id = useRef<string | null>(null);
  if (id.current === null) id.current = `pics${(grids += 1).toString(36)}`;
  const columns = pictureColumns(options.length, width);
  const card = Math.min(MAX_CARD, Math.floor((width - (columns - 1) * GRID_GAP) / columns));
  const picture = Math.round(Math.min(MAX_PICTURE, Math.max(MIN_PICTURE, card * 0.68)));
  const choose = (i: number): void => {
    if (i !== choice) haptic('select');
    onSelect(i);
  };
  return (
    <View style={[styles.grid, { flexDirection: dir.row }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} testID="picture-choices">
      {options.map((option, i) => {
        const state = stateOf(i, { choice, isRight, graded });
        const named = Object.prototype.hasOwnProperty.call(WORD_PICTURES, option) ? WORD_PICTURES[option as WordPictureId].en : option;
        const verdict = !graded || choice !== i ? null : state === 'right' ? 'right' : 'wrong';
        return (
          <AnswerMotion key={i} verdict={verdict}>
            <Tile
              state={state}
              disabled={disabled}
              onPress={() => choose(i)}
              accessibilityRole="radio"
              accessibilityLabel={state === 'right' ? `${named}, ${t('lesson.correct')}` : named}
              selected={choice === i}
              faceStyle={[styles.card, { width: card, height: card }]}
              testID="picture-card"
            >
              {(ink) => (
                <>
                  <PictureOf option={option} size={picture} ink={ink} idPrefix={`${id.current}-${i}`} />
                  <View style={[styles.corner, dir.rtl ? styles.cornerRight : styles.cornerLeft]}>
                    <OptionChip state={state} selected={choice === i} n={formatNumber(i + 1, locale)} />
                  </View>
                </>
              )}
            </Tile>
          </AnswerMotion>
        );
      })}
    </View>
  );
}

/** One card's picture, or its name when the app has no such picture. */
export function PictureOf({ option, size, ink, idPrefix }: { option: string; size: number; ink: string; idPrefix: string }): React.JSX.Element {
  const { scheme } = useTheme();
  const known = Object.prototype.hasOwnProperty.call(WORD_PICTURES, option);
  const xml = useMemo(
    () => (known ? wordPictureSvg({ id: option as WordPictureId, dark: scheme === 'dark', size, idPrefix }) : null),
    [known, option, scheme, size, idPrefix],
  );
  if (!xml) {
    return (
      <View style={[styles.unknown, { width: size, height: size }]}>
        <Icon name="image" size={Math.round(size * 0.4)} color={ink} />
      </View>
    );
  }
  return (
    <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SvgXml xml={xml} width={size} height={size} />
    </View>
  );
}

/**
 * Words to fill the line's gap: short Kurdish tiles in a wrapping row like the word bank's. The chosen one leaves a
 * same-size ghost and stands in the gap (`GapSlot`), so the line reads as said. Once graded, the right one is checked
 * where it stands if it was not chosen.
 */
export function WordChoices({ options, choice, onSelect, disabled, isRight, graded }: ChoiceProps): React.JSX.Element {
  const { t } = useI18n();
  const valley = useValley();
  const dir = useDirection();
  const choose = (i: number): void => {
    if (i !== choice) haptic('select');
    onSelect(i);
  };
  return (
    <View style={[styles.words, { flexDirection: dir.row }]} testID="word-choices">
      {options.map((option, i) => {
        const chosen = choice === i;
        const state = stateOf(i, { choice, isRight, graded });
        const right = state === 'right';
        return (
          <View key={i}>
            {chosen ? <View style={[styles.ghost, { backgroundColor: valley.track }]} /> : null}
            <View style={chosen ? styles.hidden : null}>
              <Tile
                state={chosen ? 'idle' : state}
                disabled={disabled || chosen}
                onPress={() => choose(i)}
                accessibilityRole="radio"
                accessibilityLabel={right ? `${option}, ${t('lesson.correct')}` : option}
                selected={chosen}
                faceStyle={[styles.word, { flexDirection: dir.row }]}
              >
                {(ink) => (
                  <>
                    {right && !chosen ? <Icon name="check" size={16} color={ink} /> : null}
                    <Text style={[styles.wordText, { color: ink }]}>{option}</Text>
                  </>
                )}
              </Tile>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexWrap: 'wrap', justifyContent: 'center', gap: GRID_GAP },
  card: { alignItems: 'center', justifyContent: 'center', borderRadius: CARD.radius, padding: spacing.sm },
  corner: { position: 'absolute', top: spacing.sm, zIndex: 1 },
  cornerLeft: { left: spacing.sm },
  cornerRight: { right: spacing.sm },
  unknown: { alignItems: 'center', justifyContent: 'center' },
  words: { flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm + 2 },
  // A word tile like the word bank's: smaller than an answer card, on the same hairline edge.
  word: { alignItems: 'center', gap: spacing.xs + 2, borderRadius: radii.md + 2, paddingHorizontal: spacing.md + 2 },
  wordText: { ...display(typography.sizes.text) },
  ghost: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radii.md + 2 },
  hidden: { opacity: 0 },
});
