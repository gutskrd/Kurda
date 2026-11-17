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
 * The system switch, felt as it flips: the lightest tick there is, for a value
 * that changed under the person's own finger (iOS's switch gives it itself). Everything else is the
 * platform's own control, in the app's ink (see `switchOn` in palette.ts):
 * a dark track and a white knob when it is on in light mode, a pale track and
 * a dark knob in dark mode, a grey track with a white knob when it is off.
 */
export function Toggle({ onValueChange, ...rest }: SwitchProps): React.JSX.Element {
  const { colors } = useTheme();
  const onThumb = onKnob(colors.switchOnThumb, colors.scheme);
  return (
    <Switch
      thumbColor={rest.value ? onThumb : colors.switchOffThumb}
      trackColor={{ true: colors.switchOn, false: colors.switchOff }}
      // iOS paints the track of a switch that is off from this, not from trackColor
      ios_backgroundColor={colors.switchOff}
      // react-native-web takes the knob of a switch that is on from its own prop (teal when left out)
      {...({ activeThumbColor: onThumb } as object)}
      {...rest}
      onValueChange={(next) => {
        // iOS's own switch already ticks as it flips; a second one of ours was the same moment felt twice
        if (Platform.OS !== 'ios') haptic('select');
        onValueChange?.(next);
      }}
    />
  );
}

/**
 * The knob of a switch that is on.
 *
 * On iOS the knob sits inside its track, so in dark mode it is dark on the
 * pale track. Android and a browser draw it bigger than the track, standing
 * out past its edges onto the page, where a dark knob would vanish into a
 * dark page; there it is white, and stands out against the page instead.
 */
function onKnob(knob: string, scheme: 'light' | 'dark'): string {
  return Platform.OS === 'ios' || scheme === 'light' ? knob : '#FFFFFF';
}

export interface ToggleRowProps {
  /** what it turns on: the switch's name for a screen reader, and the row's words unless `children` draws its own */
  label: string;
  /** what turning it on means, under the label, and read out after it */
  hint?: string;
  value: boolean;
  onValueChange: (on: boolean) => void;
  disabled?: boolean;
  /**
   * The row's own content in place of the label and hint, with the switch
   * after it; or a function that is handed the switch and places it itself,
   * for a row that already has a slot for what ends it.
   */
  children?: ReactNode | ((toggle: ReactNode) => ReactNode);
  /** the row's style; a function of `pressed` also takes over how the row looks while held */
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  testID?: string;
}

/**
 * A switch with its words, where the whole row turns it: the words are the
 * bigger target and the one the eye goes to, and a switch alone is 31pt
 * tall, under what a fingertip needs. The row is at least `MIN_REACH` tall.
 *
 * The row is the one control. It speaks as a switch, with its state, so a
 * screen reader meets one control rather than a label and a switch, and the
 * switch inside is hidden from it. The switch takes no touches of its own
 * either, so a tap on it is the row's tap and flips the value once: in the
 * browser build a click on the switch would otherwise reach the row too and
 * flip it twice. The tick is felt here on every platform, because a value
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
      // the same state again under the name the browser build reads
      aria-checked={value}
      testID={testID}
      style={({ pressed }) => [
        // a row that places the switch itself brings its own layout, and only needs to be tall enough
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
  label: { fontSize: typography.sizes.md },
  hint: { fontSize: typography.sizes.sm, lineHeight: 20 },
  inert: { pointerEvents: 'none' },
  held: { opacity: pressedDim },
  disabled: { opacity: 0.45 },
});
