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
 * A lesson's answer box with the Kurdish key bar above it (Translate, Listening, Writing), in the course's variety:
 * the letters come from `typingKeys` as on the website, the row wraps, and Soranî is typed right to left.
 *
 * A key is inserted at the cursor. The cursor position is set once right after a key and released as soon as the
 * field reports it, since a permanently held `selection` makes a React Native cursor jump while typing.
 *
 * Once graded the field reacts: green with a small pop when accepted, red with one shake when not (under Reduce
 * Motion only the colour changes).
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
  /** The course's variety (`SessionView.dialect`); Kurmancî when unknown. */
  dialect?: string | null;
  disabled: boolean;
  placeholder: string;
  placeholderTextColor: string;
  accessibilityLabel: string;
  multiline?: boolean;
  /** How the answer was graded, once it has been. */
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
  // The lesson's column starts at the left edge, and the keys line up with it.
  bar: { justifyContent: 'flex-start' },
  rtl: { writingDirection: 'rtl', textAlign: 'right' },
  field: { borderWidth: CARD.edge, borderRadius: CARD.radius, fontFamily: displayFont, fontSize: typography.sizes.lg - 2 },
});
