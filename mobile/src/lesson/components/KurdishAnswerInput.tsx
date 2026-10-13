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
import { spacing } from '../../theme/tokens';

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
  style?: StyleProp<TextStyle>;
}): React.JSX.Element {
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
        style={[style, sorani && styles.rtl]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  // the lesson's own column starts at the left edge; the keys sit with it
  bar: { justifyContent: 'flex-start' },
  rtl: { writingDirection: 'rtl', textAlign: 'right' },
});
