import { useRef, useState } from 'react';
import { StyleSheet, type NativeSyntheticEvent, type TextInputSelectionChangeEventData } from 'react-native';
import { USERNAME_KURDISH_LETTERS, insertAtSelection, lowercaseAsTyped, type Selection } from '@kurda/shared';
import { KeyBar } from '../keyboard/KeyBar';
import { spacing } from '../theme/tokens';

/**
 * Typing a username: what a username field does with what is typed into it.
 *
 * A username is lowercase (shared/src/username.ts), so a capital is written as
 * its lowercase letter as it is typed, Ê as ê as much as H as h. Nothing else is
 * changed and nothing is held back: a character that cannot be in a username
 * stays for the screen to say why. The caret is left to the field: lowercasing
 * keeps the text's length, and a native field whose text keeps its length keeps
 * its caret where it was.
 *
 * A key of the row below the field (`UsernameKeys`) puts its letter where the
 * caret is. The caret is told where to go only once, right after a key: a
 * `selection` held on the field for good is what makes a React Native caret
 * jump about as you type (lesson/components/KurdishAnswerInput.tsx does the
 * same).
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

/**
 * The five Kurdish letters a username may have, as keys under its field, for
 * a keyboard that has none of them. Lowercase only, with no shift: a username
 * has no capitals.
 */
export function UsernameKeys({ onKey, disabled = false }: { onKey: (letter: string) => void; disabled?: boolean }): React.JSX.Element {
  return <KeyBar dialect="kurmanci" keys={USERNAME_KURDISH_LETTERS} withShift={false} onKey={onKey} disabled={disabled} style={styles.keys} />;
}

const styles = StyleSheet.create({
  // they sit with the field they type into, not in the middle of the screen
  keys: { justifyContent: 'flex-start', marginTop: spacing.sm },
});
