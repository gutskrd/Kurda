import type { ReactNode } from 'react';
import { Platform, StyleSheet, Switch, Text, View, type StyleProp, type SwitchProps, type ViewStyle } from 'react-native';
import { MIN_REACH } from '../a11y/a11y';
import { haptic } from '../feedback/haptics';
import { useDirection } from '../reports/direction';
import { pressedDim } from './motion';
import { Pressable } from './Pressable';
import { useTheme } from './ThemeProvider';
import { spacing, typography } from './tokens';

/**
 * The system switch with a light haptic as it flips (iOS's switch provides its own). Otherwise the platform control
 * in the app's colours (see `switchOn` in palette.ts).
 */
export function Toggle({ onValueChange, ...rest }: SwitchProps): React.JSX.Element {
  const { colors } = useTheme();
  const onThumb = onKnob(colors.switchOnThumb, colors.scheme);
  return (
    <Switch
      thumbColor={rest.value ? onThumb : colors.switchOffThumb}
      trackColor={{ true: colors.switchOn, false: colors.switchOff }}
      // iOS paints an off switch's track from this, not from trackColor.
      ios_backgroundColor={colors.switchOff}
      // react-native-web takes an on switch's knob colour from its own prop (teal when omitted).
      {...({ activeThumbColor: onThumb } as object)}
      {...rest}
      onValueChange={(next) => {
        // iOS's switch already ticks as it flips; a second haptic would double the moment.
        if (Platform.OS !== 'ios') haptic('select');
        onValueChange?.(next);
      }}
    />
  );
}

/**
 * An on switch's knob colour. On iOS the knob sits inside the track, so in dark mode it is dark on the pale track.
 * Android and the web draw it larger than the track, over the page, where a dark knob would vanish on a dark page, so
 * there it is white.
 */
function onKnob(knob: string, scheme: 'light' | 'dark'): string {
  return Platform.OS === 'ios' || scheme === 'light' ? knob : '#FFFFFF';
}

interface ToggleRowProps {
  /** What it turns on: the switch's screen-reader name, and the row's text unless `children` draws its own. */
  label: string;
  /** What turning it on means, shown under the label and read after it. */
  hint?: string;
  value: boolean;
  onValueChange: (on: boolean) => void;
  disabled?: boolean;
  /** The row's own content in place of label and hint, with the switch after it; or a function given the switch to place itself. */
  children?: ReactNode | ((toggle: ReactNode) => ReactNode);
  /** The row's style; a function of `pressed` also controls how the row looks while held. */
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  testID?: string;
}

/**
 * A switch with its words where the whole row toggles it, since the words are the bigger target and a bare switch
 * (31 points) is below a fingertip; the row is at least `MIN_REACH` tall. The row is the one control: it speaks as a
 * switch with its state, and the inner switch is hidden from screen readers and takes no touches, so a tap flips the
 * value once (on the web a click would otherwise reach both). The haptic plays here on every platform, since a value
 * set from outside the system switch does not tick by itself.
 */
export function ToggleRow({ label, hint, value, onValueChange, disabled = false, children, style, testID }: ToggleRowProps): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const toggle = (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden focusable={false} style={styles.inert}>
      <Toggle value={value} disabled={disabled} />
    </View>
  );
  const placesToggle = typeof children === 'function';
  const content = placesToggle ? (
    children(toggle)
  ) : (
    <>
      {children ?? (
        <View style={styles.words}>
          <Text style={[styles.label, dir.text, { color: colors.textPrimary }]}>{label}</Text>
          {hint ? <Text style={[styles.hint, dir.text, { color: colors.textSecondary }]}>{hint}</Text> : null}
        </View>
      )}
      {toggle}
    </>
  );
  return (
    <Pressable
      onPress={() => {
        haptic('select');
        onValueChange(!value);
      }}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked: value, disabled }}
      // The same state under the name the web build reads.
      aria-checked={value}
      testID={testID}
      style={({ pressed }) => [
        // A row that places the switch itself brings its own layout and only needs the height.
        placesToggle ? styles.tall : [styles.row, { flexDirection: dir.row }],
        typeof style === 'function' ? style({ pressed }) : [style, pressed && styles.held],
        disabled && styles.disabled,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', gap: spacing.md, minHeight: MIN_REACH },
  tall: { minHeight: MIN_REACH },
  words: { flex: 1, gap: 2 },
  label: { fontSize: typography.sizes.text },
  hint: { fontSize: typography.sizes.text, lineHeight: 20 },
  inert: { pointerEvents: 'none' },
  held: { opacity: pressedDim },
  disabled: { opacity: 0.45 },
});
