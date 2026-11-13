import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { haptic } from '../feedback/haptics';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { BottomSheet, SheetScrollView } from './BottomSheet';
import { ClayButton } from './glass';
import { Icon, type IconName } from './Icon';
import { useTheme } from './ThemeProvider';
import { Toggle } from './Toggle';
import { layout, radii, spacing, typography } from './tokens';
import { pressedDim } from './motion';
import { heldDim } from './MotionParts';

/**
 * Sort and filter, as one sheet: the pieces the community wall (feed/FeedFilter.tsx)
 * and the stories library (stories/LibraryFilter.tsx) are both built from, so
 * the two look and work the same.
 *
 * - `FilterSheet` is the sheet: the choices scroll under its title, and under
 *   them, always in reach, Reset and the button that shows what was chosen.
 *   What is in it is a draft its owner keeps: nothing behind the sheet moves
 *   until that button, and closing it any other way leaves things as they were.
 * - `FilterHeading`, `FilterOptions` and `FilterOption` are a titled list of
 *   choices, each a row with a tick and a line of hint; `FilterPills` and
 *   `FilterPill` are a row of chips, with a count where there is one;
 *   `FilterToggle` is an on-and-off switch with its words.
 * - `FilterChip` says what is on while something is, under the screen's
 *   header: it opens the sheet again, and its ✕ undoes just that part.
 */
export function FilterSheet({
  visible,
  onClose,
  title,
  resetLabel,
  resetDisabled,
  onReset,
  applyLabel,
  onApply,
  testID,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  resetLabel: string;
  resetDisabled: boolean;
  onReset: () => void;
  applyLabel: string;
  /** hands the draft on; the sheet closes after */
  onApply: () => void;
  testID?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} testID={testID}>
      <SheetScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {children}
      </SheetScrollView>

      {/* the two ways to finish, always in reach under the choices */}
      <View style={[styles.footer, { flexDirection: dir.row, borderTopColor: colors.separator }]}>
        <Pressable
          onPress={onReset}
          disabled={resetDisabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: resetDisabled }}
          hitSlop={8}
          style={({ pressed }) => [styles.reset, pressed && heldDim]}
        >
          <Text style={[styles.resetText, { color: resetDisabled ? colors.textSecondary : colors.textPrimary }]}>{resetLabel}</Text>
        </Pressable>
        <ClayButton
          label={applyLabel}
          tone="primary"
          onPress={() => {
            onApply();
            onClose();
          }}
          style={styles.apply}
        />
      </View>
    </BottomSheet>
  );
}

/** A group's title in the sheet. */
export function FilterHeading({ children }: { children: string }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <Text style={[styles.heading, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
      {children}
    </Text>
  );
}

/** A smaller title inside a group, over the choices that belong together (the wall's Writing, Pictures). */
export function FilterSubheading({ children }: { children: string }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return <Text style={[styles.subheading, dir.text, { color: colors.textSecondary }]}>{children}</Text>;
}

/** A list of choices, one of which is chosen: what a screen reader hears as one radio group. */
export function FilterOptions({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label}>
      {children}
    </View>
  );
}

/** One choice in a list: a glyph where it helps the eye, its name, a line saying what it means, and a tick when chosen. */
export function FilterOption({ label, hint, icon, on, onPress }: { label: string; hint?: string; icon?: IconName; on: boolean; onPress: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <Pressable
      onPress={() => {
        if (!on) haptic('select');
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={hint ? `${label}, ${hint}` : label}
      style={({ pressed }) => [styles.option, { flexDirection: dir.row }, pressed && { backgroundColor: colors.controlTrack }]}
    >
      {icon ? <Icon name={icon} size={18} color={colors.textSecondary} /> : null}
      <View style={styles.optionWords}>
        <Text style={[styles.optionText, dir.text, { color: colors.textPrimary }, on && styles.optionOn]}>{label}</Text>
        {hint ? <Text style={[styles.optionHint, dir.text, { color: colors.textSecondary }]}>{hint}</Text> : null}
      </View>
      {on ? <Icon name="check" size={20} color={colors.textPrimary} /> : null}
    </Pressable>
  );
}

/** A row of chips, one of which is chosen, wrapping when they will not fit. */
export function FilterPills({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  const dir = useDirection();
  return (
    <View style={[styles.pills, { flexDirection: dir.row }]} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {children}
    </View>
  );
}

/** One chip in a row, filled in ink when chosen; with how many there are after its word, where that is worth knowing. */
export function FilterPill({ label, count, on, onPress }: { label: string; count?: number; on: boolean; onPress: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { locale } = useI18n();
  const dir = useDirection();
  return (
    <Pressable
      onPress={() => {
        if (!on) haptic('select');
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={count !== undefined ? `${label}, ${formatNumber(count, locale)}` : label}
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => [
        styles.pill,
        { flexDirection: dir.row, backgroundColor: on ? colors.textPrimary : colors.controlTrack },
        pressed && !on && styles.pressed,
      ]}
    >
      <Text style={[styles.pillText, { color: on ? colors.background : colors.textPrimary }]}>{label}</Text>
      {count !== undefined ? (
        <Text style={[styles.pillCount, { color: on ? colors.background : colors.textSecondary }]}>{formatNumber(count, locale)}</Text>
      ) : null}
    </Pressable>
  );
}

/** A choice that is on or off: its words, and the system switch at the row's end. */
export function FilterToggle({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (on: boolean) => void }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <View style={[styles.toggle, { flexDirection: dir.row }]}>
      <View style={styles.optionWords}>
        <Text style={[styles.optionText, dir.text, { color: colors.textPrimary }, on && styles.optionOn]}>{label}</Text>
        {hint ? <Text style={[styles.optionHint, dir.text, { color: colors.textSecondary }]}>{hint}</Text> : null}
      </View>
      <Toggle value={on} onValueChange={onChange} accessibilityLabel={label} accessibilityHint={hint} />
    </View>
  );
}

/**
 * One thing a screen is set to, while it is not as it opens: a chip that says
 * so, opens the sheet again when tapped, and has a ✕ that undoes just that
 * part.
 */
export function FilterChip({
  icon,
  label,
  clearLabel,
  onOpen,
  onClear,
}: {
  icon?: IconName;
  label: string;
  clearLabel: string;
  onOpen: () => void;
  onClear: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  return (
    <View style={[styles.chip, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t('feed.sortFilter.button')}
        // drawn 36 points tall, caught at a fingertip's 44
        hitSlop={{ top: 4, bottom: 4 }}
        style={({ pressed }) => [styles.chipMain, { flexDirection: dir.row }, pressed && heldDim]}
      >
        {icon ? <Icon name={icon} size={16} color={colors.textPrimary} /> : null}
        <Text style={[styles.chipText, { color: colors.textPrimary }]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
      <Pressable
        onPress={onClear}
        accessibilityRole="button"
        accessibilityLabel={clearLabel}
        hitSlop={8}
        style={({ pressed }) => [styles.chipClear, pressed && heldDim]}
      >
        <Icon name="close" size={14} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

/** The chips side by side, wrapping when they will not fit; `style` places the row on its screen. */
export function FilterChips({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }): React.JSX.Element {
  const dir = useDirection();
  return <View style={[styles.chipRow, { flexDirection: dir.row }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  scroll: { flexShrink: 1, marginHorizontal: -layout.gutter },
  body: { paddingHorizontal: layout.gutter, paddingBottom: spacing.md },
  heading: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, marginTop: spacing.md, marginBottom: spacing.xs },
  subheading: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, letterSpacing: 0.4, textTransform: 'uppercase', marginTop: spacing.sm, marginBottom: 2 },
  option: { alignItems: 'center', gap: spacing.sm + 2, minHeight: MIN_TOUCH_TARGET + 4, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.md },
  optionWords: { flex: 1, minWidth: 0 },
  optionText: { fontSize: typography.sizes.md },
  optionOn: { fontWeight: typography.weights.semibold },
  optionHint: { fontSize: typography.sizes.xs, marginTop: 1 },
  pills: { flexWrap: 'wrap', gap: spacing.sm },
  pill: { alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: spacing.md - 2, borderRadius: radii.pill, justifyContent: 'center' },
  pillText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  pillCount: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, fontVariant: ['tabular-nums'] },
  pressed: { opacity: pressedDim },
  toggle: { alignItems: 'center', gap: spacing.sm + 2, minHeight: MIN_TOUCH_TARGET + 4, paddingHorizontal: spacing.sm, marginTop: spacing.sm },
  footer: { alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingTop: spacing.sm + 4, borderTopWidth: StyleSheet.hairlineWidth, marginHorizontal: -layout.gutter, paddingHorizontal: layout.gutter },
  reset: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.xs },
  resetText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  apply: { flexGrow: 1, maxWidth: 260 },
  chipRow: { flexWrap: 'wrap', gap: spacing.sm },
  chip: { alignItems: 'center', borderRadius: radii.pill, paddingStart: spacing.md, paddingEnd: spacing.xs, minHeight: 36, maxWidth: '100%' },
  chipMain: { alignItems: 'center', gap: 6, minHeight: 36, flexShrink: 1 },
  chipText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, flexShrink: 1 },
  chipClear: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
