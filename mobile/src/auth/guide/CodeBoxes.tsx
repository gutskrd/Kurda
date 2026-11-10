import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TextInput, View } from 'react-native';
import { useReducedMotion } from '../../a11y/useReducedMotion';
import { springTo, timing } from '../../theme/animate';
import { duration } from '../../theme/motion';
import { useTheme } from '../../theme/ThemeProvider';
import { fontScaleCap, radii, spacing, typography } from '../../theme/tokens';

/** How tall a box is: a digit somebody is copying out of an email wants room. */
const BOX_HEIGHT = 60;

/**
 * A code typed a digit to a box.
 *
 * One grey field with "000000" in it did not say how long the code was or how
 * far along the typing had got, and looked like any other field. Six boxes
 * do: each takes its digit as it is typed, with a small settle, the next one
 * to fill is the lit one, and a gap after the third sets the code out the way
 * people read it off an email, three and three.
 *
 * Underneath it is still one text field, laid over the boxes and invisible:
 * the phone offers the code from the email or the clipboard to a field, not
 * to six, a screen reader meets one control with one name, and a backspace
 * simply works. The boxes are only how it is drawn.
 *
 * `onComplete` is told the moment the last digit lands, so the code can be
 * sent without reaching for the button. A code that was refused is shown in
 * the refusal's colour until it is edited; one being checked dims. Digits run
 * left to right in every language. Under Reduce Motion a digit simply appears
 * and the lit box does not pulse.
 */
export function CodeBoxes({
  value,
  onChange,
  onComplete,
  length = 6,
  label,
  refused = false,
  busy = false,
  autoFocus = true,
  testID = 'code',
}: {
  value: string;
  onChange: (code: string) => void;
  /** every box is full: told once, with the code */
  onComplete?: (code: string) => void;
  length?: number;
  /** what the field is, for a screen reader */
  label: string;
  /** the last code sent was not right */
  refused?: boolean;
  /** the code is with the server */
  busy?: boolean;
  autoFocus?: boolean;
  testID?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(autoFocus);
  const input = useRef<TextInput>(null);
  const digits = value.slice(0, length).split('');
  // the box the next digit goes in; none once the code is whole
  const next = focused && digits.length < length ? digits.length : -1;

  const type = (text: string): void => {
    const code = text.replace(/\D/g, '').slice(0, length);
    if (code === value) return;
    onChange(code);
    if (code.length === length && value.length < length) onComplete?.(code);
  };

  return (
    <View style={[styles.row, busy && styles.busy]}>
      {Array.from({ length }, (_, i) => (
        <View key={i} style={[styles.slot, i === Math.floor(length / 2) && length % 2 === 0 ? styles.afterGap : null]}>
          <Box digit={digits[i] ?? null} lit={i === next} refused={refused} colors={colors} />
        </View>
      ))}
      <TextInput
        ref={input}
        value={value}
        onChangeText={type}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus={autoFocus}
        editable={!busy}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={length}
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        caretHidden
        accessibilityLabel={label}
        // over the boxes with nothing of its own drawn: the field takes the touch and the typing, the boxes show
        // it. Its letters are clear rather than the field faded out, because a phone gives no touch to a view
        // that is fully faded, and a tap on the boxes has to bring the keyboard back.
        style={styles.field}
        testID={testID}
      />
    </View>
  );
}

/** One box: empty, lit as the next to fill, or holding its digit. */
function Box({
  digit,
  lit,
  refused,
  colors,
}: {
  digit: string | null;
  lit: boolean;
  refused: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
}): React.JSX.Element {
  const reduce = useReducedMotion();
  const settle = useRef(new Animated.Value(digit ? 1 : 0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  // a digit arrives with a small settle; one taken back is simply gone
  useEffect(() => {
    if (!digit) {
      settle.setValue(0);
      return;
    }
    if (reduce) {
      settle.setValue(1);
      return;
    }
    settle.setValue(0.6);
    const run = springTo(settle, 1, 'standard');
    run.start();
    return () => run.stop();
  }, [digit, reduce, settle]);

  // the lit box's mark breathes, the way a caret does, so the eye finds where the next digit goes
  useEffect(() => {
    if (!lit || reduce) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(Animated.sequence([timing(pulse, 0.25, duration.progress), timing(pulse, 1, duration.progress)]));
    loop.start();
    return () => loop.stop();
  }, [lit, reduce, pulse]);

  const fill = refused && digit ? colors.dangerFill : lit ? colors.selectedFill : colors.controlTrack;
  return (
    <View style={[styles.box, { backgroundColor: fill }]} aria-hidden>
      {digit ? (
        <Animated.View style={{ opacity: settle, transform: [{ scale: settle }] }}>
          <Text style={[styles.digit, { color: refused ? colors.danger : colors.textPrimary }]} maxFontSizeMultiplier={fontScaleCap.fixedBox}>
            {digit}
          </Text>
        </Animated.View>
      ) : lit ? (
        <Animated.View style={[styles.mark, { backgroundColor: colors.textPrimary, opacity: pulse }]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // digits read left to right in every language
  row: { flexDirection: 'row', direction: 'ltr', gap: spacing.sm, alignSelf: 'stretch' },
  busy: { opacity: 0.6 },
  slot: { flex: 1 },
  // three and three, as a code is read off an email
  afterGap: { marginLeft: spacing.sm },
  box: { height: BOX_HEIGHT, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  digit: { fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  mark: { width: 2, height: 26, borderRadius: radii.pill },
  // no ring of its own when it has the focus: the lit box is what shows where the typing goes
  field: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, fontSize: typography.sizes.md, color: 'transparent', outlineWidth: 0 },
});
