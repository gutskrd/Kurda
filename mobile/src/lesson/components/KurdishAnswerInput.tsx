import { useRef, useState } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type StyleProp,
  type TextInputSelectionChangeEventData,
  type TextStyle,
} from 'react-native';
import { isSoraniDialect, typingKeys } from '@kurda/shared';
import { KeyBar } from '../../keyboard/KeyBar';
import { insertAtSelection, type Selection } from '../kurdishKeys';
import { spacing, typography } from '../../theme/tokens';
import { displayFont } from '../../theme/fonts';
import { useTheme } from '../../theme/ThemeProvider';
import { AnswerMotion } from '../../theme/MotionParts';
import { useValley } from '../ValleyScope';
import { CARD } from '../valley';

/**
 * A lesson's answer box with the Kurdish key bar above it — on Translate,
 * Listening and Writing alike, in the course's variety of Kurdish.
 *
 * The bar used to be on Writing only, always Kurmancî, and in one row that a
 * Soranî course's twelve letters would have run off. Now the letters are the
 * course's (`typingKeys`, the set the browser's lessons use), the row wraps,
 * and a Soranî answer is typed right to left.
 *
 * A key goes in where the cursor is. The cursor is told where to go only once,
 * right after a key: a `selection` held on the field for good is what makes a
 * React Native cursor jump about as you type, so it is let go again as soon as
 * the field reports it has moved there.
 *
 * The field is one of the lesson's cream cards, on its hairline edge, and
 * what is typed in it is set in the display face, as the Kurdish everywhere
 * else in the lesson is. Once the answer is graded the field answers back:
 * green and popping a little when it was accepted, in the red of a miss and
 * shaking once when it was not (still under Reduce Motion, where the colour
 * says it alone).
 */
export function KurdishAnswerInput({
  text,
  onChangeText,
  dialect,
  disabled,
  placeholder,
  placeholderTextColor,
  accessibilityLabel,
  multiline = false,
  verdict = null,
  style,
}: {
  text: string;
  onChangeText: (text: string) => void;
  /** the course's variety (`SessionView.dialect`); Kurmancî when unknown */
  dialect?: string | null;
  disabled: boolean;
  placeholder: string;
  placeholderTextColor: string;
  accessibilityLabel: string;
  multiline?: boolean;
  /** how the answer was graded, once it has been */
  verdict?: 'right' | 'wrong' | null;
  style?: StyleProp<TextStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const valley = useValley();
  const sorani = isSoraniDialect(dialect);
  const selection = useRef<Selection>({ start: text.length, end: text.length });
  const [place, setPlace] = useState<Selection | undefined>(undefined);

  const onSelectionChange = (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    selection.current = e.nativeEvent.selection;
    if (place && e.nativeEvent.selection.start === place.start) setPlace(undefined);
  };

  const insertKey = (key: string) => {
    const { text: next, caret } = insertAtSelection(text, selection.current, key);
    selection.current = { start: caret, end: caret };
    onChangeText(next);
    setPlace({ start: caret, end: caret });
  };

  return (
    <View style={styles.wrap}>
      <KeyBar
        dialect={sorani ? 'sorani' : 'kurmanci'}
        keys={typingKeys(dialect)}
        withShift={false}
        onKey={insertKey}
        disabled={disabled}
        style={styles.bar}
      />
      <AnswerMotion verdict={verdict}>
        <TextInput
          value={text}
          onChangeText={onChangeText}
          onSelectionChange={onSelectionChange}
          selection={place}
          editable={!disabled}
          multiline={multiline}
          placeholder={placeholder}
          placeholderTextColor={placeholderTextColor}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          accessibilityLabel={accessibilityLabel}
          style={[
            styles.field,
            { color: colors.textPrimary, backgroundColor: valley.card, borderColor: valley.line },
            style,
            sorani && styles.rtl,
            verdict &&
              (verdict === 'right'
                ? { opacity: 1, backgroundColor: valley.greenWash, borderColor: valley.green }
                : { opacity: 1, backgroundColor: valley.wrongWash, borderColor: valley.wrong }),
          ]}
        />
      </AnswerMotion>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  // the lesson's own column starts at the left edge; the keys sit with it
  bar: { justifyContent: 'flex-start' },
  rtl: { writingDirection: 'rtl', textAlign: 'right' },
  field: { borderWidth: CARD.edge, borderRadius: CARD.radius, fontFamily: displayFont, fontSize: typography.sizes.lg - 2 },
});
