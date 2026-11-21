import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Pressable, ReachGroup, useReachLimit } from './Pressable';
import { MIN_TOUCH_TARGET, reachSlop } from '../a11y/a11y';
import { haptic } from '../feedback/haptics';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { BottomSheet, SheetScrollView } from './BottomSheet';
import { ClayButton } from './glass';
import { Icon, type IconName } from './Icon';
import { useTheme } from './ThemeProvider';
import { ToggleRow } from './Toggle';
import { layout, radii, spacing, typography } from './tokens';
import { pressedDim } from './motion';
import { heldDim } from './MotionParts';

/**
 * The pieces of one sort-and-filter sheet, shared by the community wall (feed/FeedFilter.tsx) and the stories
 * library (stories/LibraryFilter.tsx) so the two match. `FilterSheet` scrolls the choices under its title with Reset
 * and the apply button always in reach; its content is a draft the owner keeps, applied only by that button.
 * `FilterOptions`/`FilterOption` are a titled radio list, `FilterPills`/`FilterPill` a row of chips, `FilterToggle`
 * a switch, and `FilterChip` shows what is on under the screen's header, reopening the sheet or removing that part.
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
  /** Applies the draft; the sheet closes after. */
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

      {/* The two ways to finish, always in reach under the choices. */}
      <View style={[styles.footer, { flexDirection: dir.row, borderTopColor: colors.separator }]}>
        <Pressable
          onPress={onReset}
          disabled={resetDisabled}
          accessibilityRole="button"
          accessibilityLabel={resetLabel}
          accessibilityState={{ disabled: resetDisabled }}
          // A word with room round it: it reaches past every edge and stays clear of the button 16 away.
          reach="open"
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

/** A smaller title within a group, over related choices (the wall's Writing, Pictures). */
export function FilterSubheading({ children }: { children: string }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return <Text style={[styles.subheading, dir.text, { color: colors.textSecondary }]}>{children}</Text>;
}

/** A list of choices with one chosen, heard by screen readers as one radio group. */
export function FilterOptions({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label}>
      {children}
    </View>
  );
}

/** One choice: an optional glyph, its name, a line of meaning, and a tick when chosen. */
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
      {/* The chosen option's tick, in the chosen violet. */}
      {on ? <Icon name="check" size={20} color={colors.primary} /> : null}
    </Pressable>
  );
}

/** A row of chips with one chosen, wrapping when they do not fit. */
export function FilterPills({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  const dir = useDirection();
  return (
    <View style={[styles.pills, { flexDirection: dir.row }]} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {/* Each 36-tall pill reaches halfway into the gap round it, so rows answer without a seam. */}
      <ReachGroup gap={spacing.sm} rowGap={spacing.sm}>
        {children}
      </ReachGroup>
    </View>
  );
}

/** One chip, filled in ink when chosen, with a count after its word where worth knowing. */
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

/** An on-or-off choice: its words and the system switch at the row's end; the whole row toggles it and highlights when held. */
export function FilterToggle({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (on: boolean) => void }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <ToggleRow
      label={label}
      hint={hint}
      value={on}
      onValueChange={onChange}
      style={({ pressed }) => [styles.toggle, pressed && { backgroundColor: colors.controlTrack }]}
    >
      <View style={styles.optionWords}>
        <Text style={[styles.optionText, dir.text, { color: colors.textPrimary }, on && styles.optionOn]}>{label}</Text>
        {hint ? <Text style={[styles.optionHint, dir.text, { color: colors.textSecondary }]}>{hint}</Text> : null}
      </View>
    </ToggleRow>
  );
}

/** A filter chip's height, and its ✕'s, which sits inside the chip 2 short of its top and bottom. */
const CHIP_H = 36;
const CLEAR = 32;

/**
 * One way the screen differs from how it opens: a chip that reopens the sheet on tap and has a ✕ undoing just that
 * part. The chip is two touching controls with paired reaches: the words take the chip from its leading edge up to
 * the ✕ and no further, and the ✕ reaches 8 past its circle on the other three sides within its group's half-gap.
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
  const limit = useReachLimit();
  // The words come before the ✕: on its left, or its right where the row is mirrored.
  const mirrored = dir.row === 'row-reverse';
  const toward = mirrored ? 'right' : 'left';
  // The group caps the chip's edges; the ✕ is this far inside them, so it may reach that much further.
  const past = (cap: number | undefined, inside: number): number | undefined => (cap === undefined ? undefined : cap + inside);
  const across = (side: 'left' | 'right'): number | undefined => (side === toward ? 0 : past(limit?.[side], spacing.xs));
  const inset = (CHIP_H - CLEAR) / 2;
  const clearReach = reachSlop(CLEAR, CLEAR, {
    limit: { top: past(limit?.top, inset), bottom: past(limit?.bottom, inset), left: across('left'), right: across('right') },
  });
  return (
    <View style={[styles.chip, { flexDirection: dir.row, backgroundColor: colors.controlTrack }, mirrored ? styles.chipEndLeft : styles.chipEndRight]}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t('feed.sortFilter.button')}
        // Drawn 36 tall: it reaches up and down to 48, or to half the gap where its group says so.
        style={({ pressed }) => [styles.chipMain, { flexDirection: dir.row }, mirrored ? styles.chipLeadRight : styles.chipLeadLeft, pressed && heldDim]}
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
        hitSlop={clearReach}
        style={({ pressed }) => [styles.chipClear, pressed && heldDim]}
      >
        <Icon name="close" size={14} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

/** The chips side by side, wrapping when they do not fit; `style` places the row on its screen. */
export function FilterChips({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }): React.JSX.Element {
  const dir = useDirection();
  return (
    <View style={[styles.chipRow, { flexDirection: dir.row }, style]}>
      {/* Chips share the gaps between them, across and between rows, half each. */}
      <ReachGroup gap={spacing.sm} rowGap={spacing.sm}>
        {children}
      </ReachGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexShrink: 1, marginHorizontal: -layout.gutter },
  body: { paddingHorizontal: layout.gutter, paddingBottom: spacing.md },
  heading: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, marginTop: spacing.md, marginBottom: spacing.xs },
  subheading: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, letterSpacing: 0.4, textTransform: 'uppercase', marginTop: spacing.sm, marginBottom: 2 },
  option: { alignItems: 'center', gap: spacing.sm + 2, minHeight: MIN_TOUCH_TARGET + 4, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.md },
  optionWords: { flex: 1, minWidth: 0 },
  optionText: { fontSize: typography.sizes.text },
  optionOn: { fontWeight: typography.weights.semibold },
  optionHint: { fontSize: typography.sizes.text, marginTop: 1 },
  pills: { flexWrap: 'wrap', gap: spacing.sm },
  pill: { alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: spacing.md - 2, borderRadius: radii.pill, justifyContent: 'center' },
  pillText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  pillCount: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, fontVariant: ['tabular-nums'] },
  pressed: { opacity: pressedDim },
  toggle: { alignItems: 'center', gap: spacing.sm + 2, minHeight: MIN_TOUCH_TARGET + 4, paddingHorizontal: spacing.sm, marginTop: spacing.sm, borderRadius: radii.md },
  footer: { alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingTop: spacing.sm + 4, borderTopWidth: StyleSheet.hairlineWidth, marginHorizontal: -layout.gutter, paddingHorizontal: layout.gutter },
  reset: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.xs },
  resetText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  apply: { flexGrow: 1, maxWidth: 260 },
  chipRow: { flexWrap: 'wrap', gap: spacing.sm },
  chip: { alignItems: 'center', borderRadius: radii.pill, minHeight: CHIP_H, maxWidth: '100%' },
  // The chip's padding by the side it is drawn on, since the row is mirrored by hand: the ✕'s end and the words' lead.
  chipEndRight: { paddingRight: spacing.xs },
  chipEndLeft: { paddingLeft: spacing.xs },
  chipMain: { alignItems: 'center', gap: 6, minHeight: CHIP_H, flexShrink: 1 },
  chipLeadLeft: { paddingLeft: spacing.md },
  chipLeadRight: { paddingRight: spacing.md },
  chipText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, flexShrink: 1 },
  chipClear: { width: CLEAR, height: CLEAR, alignItems: 'center', justifyContent: 'center' },
});
