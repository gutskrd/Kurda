import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View, type AccessibilityRole } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from '../theme/Pressable';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { timing } from '../theme/animate';
import { PressableScale } from '../theme/MotionParts';
import { duration } from '../theme/motion';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useFontScale } from '../a11y/useFontScale';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useDirection } from '../reports/direction';
import { GradientBackground } from '../theme/glass';
import { Icon, type IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { ToggleRow } from '../theme/Toggle';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { usePageWidth } from '../theme/pageWidth';

/**
 * Settings and the app's other lists of rows. Each row shows an icon, a name, the current value and a chevron when a
 * page is behind it. A section is a rounded card on the page under a plain name, as the app's other pages lay out
 * their cards, so a list page and a card page look like one app. Sections stay short, and values are shown on the
 * row. The Settings home adds two pieces of its own: quick tiles, and categories drawn on the page itself.
 */

/** A group of rows on a card under a plain name. */
export function SettingsSection({
  title,
  footer,
  first = false,
  children,
}: {
  title?: string;
  /** A sentence under the rows: what the setting above it does, said once. */
  footer?: string;
  first?: boolean;
  children: ReactNode;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <View style={first ? null : styles.apart}>
      {title ? (
        <Text style={[styles.header, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
          {title}
        </Text>
      ) : (
        <View style={styles.headless} />
      )}
      <View style={[styles.group, { backgroundColor: colors.glassFill, shadowColor: colors.softShadow }]}>{children}</View>
      {footer ? <SettingsNote>{footer}</SettingsNote> : null}
    </View>
  );
}

/** The room between two sections, on its own, for a section that may or may not be there above the next. */
export function SettingsBand(): React.JSX.Element {
  return <View style={styles.apart} />;
}

/** A sentence of explanation under a list, in the list's own gutter. */
export function SettingsNote({ children }: { children: ReactNode }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return <Text style={[styles.note, dir.text, { color: colors.textSecondary }]}>{children}</Text>;
}

interface RowLook {
  icon?: IconName;
  title: string;
  subtitle?: string;
  /** The current value, before the chevron. */
  value?: string;
  /** Cannot be undone (deleting the account): red, the one red on the screen. */
  destructive?: boolean;
  /** Needs action (notifications blocked, a limited account): icon, value and subtitle in the ink, kept for what needs acting on. */
  attention?: boolean;
}

/**
 * Estimated width of a letter in a row's name, as a share of its size: a little over average for Latin at 17 pt,
 * well over for Arabic script, to err toward the name.
 */
const LETTER = 0.6;

/**
 * The width a row's name keeps beside its value: its longest word, estimated from its letters since text cannot
 * be measured before layout. The value takes what is left and ends in an ellipsis, so the name is never broken
 * inside a word. The name takes at most three fifths of the row, so the value always keeps some.
 */
export function titleRoom(title: string, fontScale: number, rowWidth: number): number {
  const longest = Math.max(0, ...title.split(/\s+/).map((word) => [...word].length));
  return Math.min(Math.ceil(longest * typography.sizes.text * LETTER * fontScale), Math.floor(rowWidth * 0.6));
}

/** A row's inset inside its card, and the room between its icon, words and end: a little under the page's gutter, so names keep their line. */
const ROW_INSET = spacing.sm + 4;

/** The inside of a row: icon, name and what is under it, then whatever ends the row. */
function RowBody({ icon, title, subtitle, value, destructive, attention, end }: RowLook & { end?: ReactNode }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const fontScale = useFontScale();
  const width = usePageWidth();
  const ink = destructive ? colors.danger : colors.textPrimary;
  const note = attention ? colors.primary : colors.textSecondary;
  return (
    <View style={[styles.row, { flexDirection: dir.row }]}>
      {icon ? <Icon name={icon} size={24} color={attention ? colors.primary : ink} /> : null}
      <View style={[styles.words, value ? { minWidth: titleRoom(title, fontScale, Math.min(width, layout.column) - layout.gutter * 2 - ROW_INSET * 2) } : null]}>
        <Text style={[styles.title, dir.text, { color: ink }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, dir.text, { color: note }]}>{subtitle}</Text> : null}
      </View>
      {value ? (
        <Text style={[styles.value, { color: note }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {end}
    </View>
  );
}

/**
 * One row. With `onPress` it is a button, with a chevron when it opens a page (`opens`, the default). A `badge`
 * counts what waits behind it (requests to answer), in the ink, and is read out in words.
 */
export function SettingsRow({
  onPress,
  opens = true,
  trailing,
  badge,
  accessibilityHint,
  testID,
  ...look
}: RowLook & {
  onPress?: () => void;
  /** A page behind it, so a chevron at its end. */
  opens?: boolean;
  trailing?: ReactNode;
  /** How many wait behind it, and that number in words for a screen reader. */
  badge?: { count: number; label: string };
  accessibilityHint?: string;
  testID?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const chevron = onPress && opens ? <Icon name="chevron-right" size={18} color={colors.textSecondary} style={dir.flip ?? undefined} /> : null;
  const count = badge ? (
    <View style={[styles.badge, { backgroundColor: colors.primary }]}>
      <Text style={[styles.badgeText, { color: colors.textOnPrimary }]}>{badge.count > 99 ? '99+' : badge.count}</Text>
    </View>
  ) : null;
  const end = trailing ?? (count ? (
    <>
      {count}
      {chevron}
    </>
  ) : (
    chevron
  ));
  if (!onPress) {
    return (
      <View testID={testID}>
        <RowBody {...look} end={end} />
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[look.title, look.value, badge?.label].filter(Boolean).join(', ')}
      accessibilityHint={accessibilityHint}
      testID={testID}
      style={({ pressed }) => pressed && { backgroundColor: colors.controlTrack }}
    >
      <RowBody {...look} end={end} />
    </Pressable>
  );
}

/** A switch row: the whole row toggles it. The app's `ToggleRow`, laid out like other rows and as tall (56). */
export function SettingsSwitch({
  icon,
  title,
  subtitle,
  value,
  onValueChange,
  disabled = false,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (on: boolean) => void;
  disabled?: boolean;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <ToggleRow
      label={title}
      hint={subtitle}
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      style={({ pressed }) => pressed && { backgroundColor: colors.controlTrack }}
    >
      {(toggle) => <RowBody icon={icon} title={title} subtitle={subtitle} end={toggle} />}
    </ToggleRow>
  );
}

/** One of a few: each choice a row with its meaning under its name, and a check on the chosen one. */
export function SettingsChoice<T extends string>({
  label,
  options,
  value,
  labelOf,
  hintOf,
  isDisabled,
  onChange,
}: {
  /** What is being chosen, for a screen reader. */
  label: string;
  options: readonly T[];
  /** Nothing chosen yet (still loading) when null. */
  value: T | null;
  labelOf: (option: T) => string;
  hintOf?: (option: T) => string | undefined;
  isDisabled?: (option: T) => boolean;
  onChange: (option: T) => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((option) => {
        const chosen = option === value;
        const disabled = isDisabled?.(option) === true;
        return (
          <Pressable
            key={option}
            onPress={() => {
              if (chosen) return;
              haptic('select');
              onChange(option);
            }}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityLabel={labelOf(option)}
            accessibilityHint={hintOf?.(option)}
            accessibilityState={{ checked: chosen, disabled }}
            style={({ pressed }) => [pressed && { backgroundColor: colors.controlTrack }, disabled && styles.disabled]}
          >
            <RowBody
              title={labelOf(option)}
              subtitle={hintOf?.(option)}
              // The choice that is on is ticked in the ink everything chosen wears.
              end={<View style={styles.check}>{chosen ? <Icon name="check" size={22} color={colors.primary} /> : null}</View>}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A kind of setting on the Settings home: its icon, its name, what is inside it in grey, and a chevron. Drawn on the
 * page itself rather than a card, a little taller than a row, so the list reads as a table of contents.
 */
export function SettingsCategory({
  icon,
  title,
  subtitle,
  attention = false,
  destructive = false,
  opens = true,
  onPress,
  testID,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  /** Something inside needs acting on (a limited account): the icon and subtitle in the ink kept for that. */
  attention?: boolean;
  destructive?: boolean;
  /** A page behind it, so a chevron. */
  opens?: boolean;
  onPress: () => void;
  testID?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const ink = destructive ? colors.danger : colors.textPrimary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      testID={testID}
      style={({ pressed }) => [styles.category, { flexDirection: dir.row }, pressed && { backgroundColor: colors.controlTrack }]}
    >
      <Icon name={icon} size={24} color={attention ? colors.primary : ink} />
      <View style={styles.words}>
        <Text style={[styles.categoryTitle, dir.text, { color: ink }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, dir.text, { color: attention ? colors.primary : colors.textSecondary }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {opens ? <Icon name="chevron-right" size={18} color={colors.textSecondary} style={dir.flip ?? undefined} /> : null}
    </Pressable>
  );
}

/**
 * One of the two quick settings at the top of the home: an icon over its name and value, on a tile a step up from the
 * page. A tap changes the value in place; the new value fades in over the old.
 */
export function QuickTile({
  icon,
  name,
  value,
  onPress,
  role = 'button',
  checked,
  testID,
}: {
  icon: IconName;
  name: string;
  value: string;
  onPress: () => void;
  role?: AccessibilityRole;
  /** For a tile that is a switch. */
  checked?: boolean;
  testID?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (value === shown) return;
    if (reduce) {
      setShown(value);
      return;
    }
    const out = timing(fade, 0, duration.quick);
    out.start(() => {
      setShown(value);
      timing(fade, 1, duration.base).start();
    });
    return () => out.stop();
  }, [value, shown, reduce, fade]);
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={`${name}, ${value}`}
      accessibilityState={checked === undefined ? undefined : { checked }}
      aria-checked={checked}
      testID={testID}
      style={[styles.tile, { backgroundColor: colors.glassFill, shadowColor: colors.softShadow }]}
    >
      <Icon name={icon} size={26} color={colors.textPrimary} />
      <Text style={[styles.tileName, { color: colors.textPrimary }]} numberOfLines={1}>
        {name}
      </Text>
      <Animated.Text style={[styles.tileValue, { color: colors.textSecondary, opacity: fade }]} numberOfLines={1}>
        {shown}
      </Animated.Text>
    </PressableScale>
  );
}

/**
 * A page of settings behind a row: its name in the header, the way back, any action of its own opposite, and its list.
 * `overlay` is drawn over the whole page, header included (a moment of success).
 */
export function SettingsPage({
  title,
  onExit,
  right,
  overlay,
  children,
}: {
  title: string;
  onExit: () => void;
  right?: ReactNode;
  overlay?: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  // The end of the list clears the home indicator or a phone's own button bar, whichever is taller, by a step.
  const bottom = Math.max(spacing.xxl, useSafeAreaInsets().bottom + spacing.lg);
  return (
    <GradientBackground>
      {/* Never the search-and-bell pill: Settings has its own search, and the bell would lead away mid-change. */}
      <ScreenHeader title={title} onBack={onExit} right={right} browse={false} />
      <ScrollView contentContainerStyle={{ paddingBottom: bottom }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {overlay}
    </GradientBackground>
  );
}

/** A page's data could not be read: the reason and Try again, rather than a page left empty or a switch greyed out. */
export function SettingsNotRead({ failed, retry }: { failed: string; retry: () => void }): React.JSX.Element {
  const { t } = useI18n();
  return (
    <SettingsSection first>
      <SettingsNote>{failed}</SettingsNote>
      <SettingsRow icon="history" title={t('common.retry')} opens={false} onPress={retry} />
    </SettingsSection>
  );
}

/** The words for "on" and "off" a row shows as its value. */
export function useOnOff(): (on: boolean) => string {
  const { t } = useI18n();
  return (on) => t(on ? 'settings.on' : 'settings.off');
}

const styles = StyleSheet.create({
  apart: { marginTop: spacing.md },
  // A card as the app's others are: a little lift off the page, clipped so a pressed row stays inside its corners.
  group: {
    marginHorizontal: layout.gutter,
    borderRadius: radii.lg,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
  header: {
    fontSize: typography.sizes.text,
    fontWeight: typography.weights.semibold,
    paddingHorizontal: layout.gutter,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  headless: { height: spacing.sm },
  row: {
    alignItems: 'center',
    gap: ROW_INSET,
    minHeight: Math.max(MIN_TOUCH_TARGET, 56),
    paddingHorizontal: ROW_INSET,
    paddingVertical: spacing.sm + 2,
  },
  words: { flex: 1, gap: 2 },
  title: { fontSize: typography.sizes.text },
  subtitle: { fontSize: typography.sizes.text, lineHeight: 20 },
  value: { fontSize: typography.sizes.text, maxWidth: '45%', flexShrink: 1 },
  check: { width: 22, alignItems: 'center' },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  note: { fontSize: typography.sizes.text, lineHeight: 20, paddingHorizontal: layout.gutter, paddingTop: spacing.sm },
  disabled: { opacity: 0.45 },
  // Inset by a step so the held fill keeps clear of the screen's edges, the words still on the gutter.
  category: {
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 68,
    marginHorizontal: spacing.sm,
    paddingHorizontal: layout.gutter - spacing.sm,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.md,
  },
  categoryTitle: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  tile: {
    flex: 1,
    minHeight: 108,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
  tileName: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, marginTop: spacing.xs },
  tileValue: { fontSize: typography.sizes.text },
});
