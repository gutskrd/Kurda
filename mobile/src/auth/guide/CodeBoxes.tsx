import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TextInput, View } from 'react-native';
import { codeDigits } from '@kurda/shared';
import { useMotionAlive } from '../../a11y/useMotionAlive';
import { useReducedMotion } from '../../a11y/useReducedMotion';
import { springTo, timing } from '../../theme/animate';
import { duration } from '../../theme/motion';
import { useTheme } from '../../theme/ThemeProvider';
import { fontScaleCap, radii, spacing, typography } from '../../theme/tokens';

/** How tall a box is: a digit somebody is copying out of an email wants room. */
const BOX_HEIGHT = 60;

/**
 * A code typed a digit to a box, with the next box lit and a gap after the third (three and three, as read off an
 * email).
 *
 * Underneath it is one invisible text field over the boxes, so the phone can offer the emailed code, a screen reader
 * meets one control, and backspace just works. The field has no length limit, so a pasted "482 913" is not cut short
 * (shared `codeDigits` keeps the six digits). `onComplete` fires as the last digit lands. A refused code shows in the
 * refusal's colour until edited; one being checked dims. Digits run left to right in every language; under Reduce
 * Motion a digit simply appears and the lit box does not pulse.
 */
export function CodeBoxes({
  value,
  onChange,
  onComplete,
  length = 6,
  label,
  refused = false,
  busy = false,
}: {
  value: string;
  onChange: (code: string) => void;
  /** Every box is full: told once, with the code. */
  onComplete?: (code: string) => void;
  length?: number;
  /** What the field is, for a screen reader. */
  label: string;
  /** The last code sent was not right. */
  refused?: boolean;
  /** The code is with the server. */
  busy?: boolean;
}): React.JSX.Element {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(true);
  const input = useRef<TextInput>(null);
  const digits = value.slice(0, length).split('');
  // The box the next digit goes in; none once the code is whole.
  const next = focused && digits.length < length ? digits.length : -1;

  const type = (text: string): void => {
    // Read as meant: the digits of an Arabic or Soranî keyboard, or a code pasted with its space or its sentence.
    const code = codeDigits(text, length);
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
        autoFocus
        editable={!busy}
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        caretHidden
        accessibilityLabel={label}
        // Over the boxes with nothing of its own drawn: the field takes the touch and typing, the boxes show it. Its
        // text is transparent rather than the field faded out, because a phone gives no touch to a fully faded view.
        style={styles.field}
        testID="code"
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
  const alive = useMotionAlive();

  // A digit arrives with a small settle; one taken back is simply gone.
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
    // Typing is the interface answering a key: there within 300 ms, as a tab or a switch is.
    const run = springTo(settle, 1, 'chrome');
    run.start();
    return () => run.stop();
  }, [digit, reduce, settle]);

  // The lit box's mark breathes like a caret, while the page is in front.
  useEffect(() => {
    if (!lit || !alive) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(Animated.sequence([timing(pulse, 0.25, duration.progress), timing(pulse, 1, duration.progress)]));
    loop.start();
    return () => loop.stop();
  }, [lit, alive, pulse]);

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
  // Digits read left to right in every language.
  row: { flexDirection: 'row', direction: 'ltr', gap: spacing.sm, alignSelf: 'stretch' },
  busy: { opacity: 0.6 },
  slot: { flex: 1 },
  // Three and three, as a code is read off an email.
  afterGap: { marginLeft: spacing.sm },
  box: { height: BOX_HEIGHT, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  digit: { fontSize: typography.sizes.title, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  mark: { width: 2, height: 26, borderRadius: radii.pill },
  // No focus ring of its own: the lit box shows where typing goes. In a browser the ring comes from its style, so the
  // style is turned off there too.
  field: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    fontSize: typography.sizes.text,
    color: 'transparent',
    outlineWidth: 0,
    ...({ outlineStyle: 'none' } as object),
  },
});
