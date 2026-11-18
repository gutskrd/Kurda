import { useRef, useState } from 'react';
import { StyleSheet, type NativeSyntheticEvent, type TextInputSelectionChangeEventData } from 'react-native';
import { USERNAME_KURDISH_LETTERS, insertAtSelection, lowercaseAsTyped, type Selection } from '@kurda/shared';
import { KeyBar } from '../keyboard/KeyBar';
import { spacing } from '../theme/tokens';

/**
 * What a username field does with typed input. Usernames are lowercase (shared/src/username.ts), so capitals are
 * lowercased as typed; nothing else is changed, so a disallowed character stays for the screen to explain.
 * Lowercasing keeps the text's length, so the native caret stays put.
 *
 * A key from the row below the field (`UsernameKeys`) inserts at the caret. The caret is set once, right after a
 * key, because a permanently controlled `selection` makes a React Native caret jump while typing
 * (lesson/components/KurdishAnswerInput.tsx does the same).
 */
export function useUsernameTyping(
  value: string,
  onChange: (next: string) => void,
): {
  onChangeText: (text: string) => void;
  onSelectionChange: (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => void;
  selection: Selection | undefined;
  typeKey: (letter: string) => void;
} {
  const selection = useRef<Selection>({ start: value.length, end: value.length });
  const [place, setPlace] = useState<Selection | undefined>(undefined);

  return {
    onChangeText: (text) => onChange(lowercaseAsTyped(text).text),
    onSelectionChange: (e) => {
      selection.current = e.nativeEvent.selection;
      if (place && e.nativeEvent.selection.start === place.start) setPlace(undefined);
    },
    selection: place,
    typeKey: (letter) => {
      const next = insertAtSelection(value, selection.current, letter);
      const typed = lowercaseAsTyped(next.text, next.caret);
      selection.current = { start: typed.caret, end: typed.caret };
      onChange(typed.text);
      setPlace({ start: typed.caret, end: typed.caret });
    },
  };
}

/** The five Kurdish letters a username may contain, as keys for keyboards without them. Lowercase only, with no shift. */
export function UsernameKeys({ onKey, disabled = false }: { onKey: (letter: string) => void; disabled?: boolean }): React.JSX.Element {
  return <KeyBar dialect="kurmanci" keys={USERNAME_KURDISH_LETTERS} withShift={false} onKey={onKey} disabled={disabled} style={styles.keys} />;
}

const styles = StyleSheet.create({
  // They sit with the field they type into, not in the middle of the screen.
  keys: { justifyContent: 'flex-start', marginTop: spacing.sm },
});
