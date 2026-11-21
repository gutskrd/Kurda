import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Pressable } from '../theme/Pressable';
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

/**
 * Settings and the app's other lists of rows. Each row shows an icon, a name, the current value and a chevron when a
 * page is behind it. A section is a rounded card on the page under a plain name, as the app's other pages lay out
 * their cards, so a list page and a card page look like one app. Sections stay short, and values are shown on the
 * row.
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
  /** Needs action (notifications blocked, a limited account): icon, value and subtitle in violet, kept for what needs acting on. */
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
  const { width } = useWindowDimensions();
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
 * counts what waits behind it (requests to answer), in violet, and is read out in words.
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
  if (!onPress) return <RowBody {...look} end={end} />;
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
              // The choice that is on is ticked in the violet everything chosen wears.
              end={<View style={styles.check}>{chosen ? <Icon name="check" size={22} color={colors.primary} /> : null}</View>}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

/** A page of settings behind a row: its name in the header, the way back, and its list. */
export function SettingsPage({ title, onExit, children }: { title: string; onExit: () => void; children: ReactNode }): React.JSX.Element {
  return (
    <GradientBackground>
      <ScreenHeader title={title} onBack={onExit} />
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </GradientBackground>
  );
}

/** The words for "on" and "off" a row shows as its value. */
export function useOnOff(): (on: boolean) => string {
  const { t } = useI18n();
  return (on) => t(on ? 'settings.on' : 'settings.off');
}

const styles = StyleSheet.create({
  page: { paddingBottom: spacing.xxl },
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
});
