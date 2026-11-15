import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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

/*
 * The answers of two kinds of question that are not a list of lines: the
 * pictures a word is chosen among, and the short Kurdish words one of which
 * fills a line's gap. Both answer back as the option cards do — the one
 * chosen ringed in the pomegranate's red, then green with a check when it was
 * right, or red with a cross and the right one checked beside it.
 */

interface ChoiceProps {
  options: string[];
  choice: number | null;
  onSelect: (index: number) => void;
  disabled: boolean;
  /** graded: whether an option is the right one; false for all while choosing */
  isRight: (index: number) => boolean;
  graded: boolean;
}

/** How a choice stands, by its place: what the option cards are told. */
function stateOf(i: number, { choice, isRight, graded }: Pick<ChoiceProps, 'choice' | 'isRight' | 'graded'>): TileState {
  const selected = choice === i;
  if (isRight(i)) return 'right';
  if (graded && selected) return 'wrong';
  if (graded) return 'disabled';
  return selected ? 'picked' : 'idle';
}

/** Between picture cards, along a row and from one row to the next. */
const GRID_GAP = spacing.sm + 4;

/** A picture card is at least this wide to stand three in a row, and never wider than the last. */
const MIN_CARD = 100;
const MAX_CARD = 168;

/** The picture on its card: at least this, and at most that, whatever the card's size. */
const MIN_PICTURE = 72;
const MAX_PICTURE = 112;

/** How many cards stand in a row: three in a row where three fit, four where four do, otherwise two by two. */
export function pictureColumns(count: number, width: number): number {
  const fits = (n: number): boolean => MIN_CARD <= (width - (n - 1) * GRID_GAP) / n;
  if (count < 3) return Math.max(1, count);
  if (count === 3) return fits(3) ? 3 : 2;
  // four in a row only where each could be as large as a card gets: a tablet, not a phone held sideways
  return count === 4 && 4 * MAX_CARD <= width ? 4 : 2;
}

let grids = 0;

/**
 * Which picture the word in the bubble is: square cream cards, each with its
 * picture and its number in the corner, and no word under it — reading the
 * answer off the card would be no question at all. Two by two, or three in a
 * row where three fit. A screen reader hears each card by what it shows, in
 * English, the language the pictures were named in; a picture the app cannot
 * draw (a newer server's) is a card with that name on it instead.
 */
export function PictureChoices({ options, choice, onSelect, disabled, isRight, graded }: ChoiceProps): React.JSX.Element {
  const { t, locale } = useI18n();
  const dir = useDirection();
  const screen = useWindowDimensions();
  const [width, setWidth] = useState(screen.width - 2 * layout.gutter);
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

/** One card's picture, or the picture's name when the app has none of that name. */
function PictureOf({ option, size, ink, idPrefix }: { option: string; size: number; ink: string; idPrefix: string }): React.JSX.Element {
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
 * The words one of which fills the line's gap: short Kurdish tiles in a row
 * that wraps, like the word bank's. The one chosen leaves a ghost of its own
 * size where it was and stands in the gap instead (`GapSlot`), so the line
 * reads as it would be said; another tap puts another there. Once graded, the
 * right one is checked where it stands, if it was not the one chosen.
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
  card: { alignItems: 'center', justifyContent: 'center', borderRadius: CARD.radius, borderWidth: CARD.edge, padding: spacing.sm },
  corner: { position: 'absolute', top: spacing.sm, zIndex: 1 },
  cornerLeft: { left: spacing.sm },
  cornerRight: { right: spacing.sm },
  unknown: { alignItems: 'center', justifyContent: 'center' },
  words: { flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm + 2 },
  // a word tile, as the word bank's are: a smaller card than an answer, on the same hairline edge
  word: { alignItems: 'center', gap: spacing.xs + 2, borderRadius: radii.md + 2, borderWidth: CARD.edge, paddingHorizontal: spacing.md + 2 },
  wordText: { ...display(typography.sizes.md + 2) },
  ghost: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radii.md + 2 },
  hidden: { opacity: 0 },
});
