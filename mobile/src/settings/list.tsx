import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useDirection } from '../reports/direction';
import { GradientBackground } from '../theme/glass';
import { Icon, type IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { Toggle } from '../theme/Toggle';
import { layout, radii, spacing, typography } from '../theme/tokens';

/**
 * Settings as a list: what a phone's own settings look like, so nothing has
 * to be learned to use them.
 *
 * Rows run the width of the screen, one thing each — an icon, its name, what
 * it is set to now, and a chevron when there is a page behind it. Sections
 * have a plain name and a band between them, rather than a box around each:
 * a box per group made the screen a stack of cards to read one by one, where
 * a list is scanned down its left edge. Only a few rows to a section, so a
 * section can be taken in at a glance; what each row is set to is shown on
 * the row, so it need not be opened to be known.
 */

/** A group of rows under a plain name; every section after the first has a band above it. */
export function SettingsSection({
  title,
  footer,
  first = false,
  children,
}: {
  title?: string;
  /** a sentence under the rows: what the setting above it does, said once */
  footer?: string;
  first?: boolean;
  children: ReactNode;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <View>
      {first ? null : <View style={[styles.band, { backgroundColor: colors.separator }]} />}
      {title ? (
        <Text style={[styles.header, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
          {title}
        </Text>
      ) : (
        <View style={styles.headless} />
      )}
      {children}
      {footer ? <SettingsNote>{footer}</SettingsNote> : null}
    </View>
  );
}

/** The band between two sections, on its own: for a section that may or may not be there above the next. */
export function SettingsBand(): React.JSX.Element {
  const { colors } = useTheme();
  return <View style={[styles.band, { backgroundColor: colors.separator }]} />;
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
  /** what it is set to now, before the chevron */
  value?: string;
  /** cannot be undone (deleting the account): red, the one red on the screen */
  destructive?: boolean;
  /**
   * Wants something done (notifications blocked on the phone, an account
   * that is limited): its icon, value and what is under it in gold, the colour
   * this app keeps for "notice this". Only then; a row that is merely set to
   * something stays in ink, so the one that is gold is seen.
   */
  attention?: boolean;
}

/** The inside of a row: icon, name and what is under it, then whatever ends the row. */
function RowBody({ icon, title, subtitle, value, destructive, attention, end }: RowLook & { end?: ReactNode }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const ink = destructive ? colors.danger : colors.textPrimary;
  const note = attention ? colors.goldText : colors.textSecondary;
  return (
    <View style={[styles.row, { flexDirection: dir.row }]}>
      {icon ? <Icon name={icon} size={24} color={attention ? colors.goldText : ink} /> : null}
      <View style={styles.words}>
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
 * One row. With `onPress` it is a button, with a chevron when it opens a page
 * (`opens`, the default) and none when it does something there and then. A
 * `badge` counts what waits behind it (requests to answer), in the gold of
 * "notice this", and is read out in words.
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
  /** a page behind it, so a chevron at its end */
  opens?: boolean;
  trailing?: ReactNode;
  /** how many wait behind it, and that number in words for a screen reader */
  badge?: { count: number; label: string };
  accessibilityHint?: string;
  testID?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const chevron = onPress && opens ? <Icon name="chevron-right" size={18} color={colors.textSecondary} style={dir.flip ?? undefined} /> : null;
  const count = badge ? (
    <View style={[styles.badge, { backgroundColor: colors.goldText }]}>
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

/** A row that is a switch: the whole row turns it, not only the switch at its end. */
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
    <Pressable
      onPress={() => {
        haptic('select');
        onValueChange(!value);
      }}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ checked: value, disabled }}
      style={({ pressed }) => [pressed && { backgroundColor: colors.controlTrack }, disabled && styles.disabled]}
    >
      <RowBody
        icon={icon}
        title={title}
        subtitle={subtitle}
        end={
          // the row speaks for the switch, so a screen reader meets one control, not two
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Toggle value={value} disabled={disabled} onValueChange={onValueChange} />
          </View>
        }
      />
    </Pressable>
  );
}

/**
 * One of a few: each choice a row, with what it means under its name, and a
 * check at the end of the one chosen. Every choice's consequence is read
 * before it is made, rather than after.
 */
export function SettingsChoice<T extends string>({
  label,
  options,
  value,
  labelOf,
  hintOf,
  isDisabled,
  onChange,
}: {
  /** what is being chosen, for a screen reader */
  label: string;
  options: readonly T[];
  /** nothing chosen yet (still loading) when null */
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
              end={<View style={styles.check}>{chosen ? <Icon name="check" size={22} color={colors.textPrimary} /> : null}</View>}
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
  band: { height: 8, marginTop: spacing.md },
  header: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    paddingHorizontal: layout.gutter,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  headless: { height: spacing.sm },
  row: {
    alignItems: 'center',
    gap: spacing.md,
    minHeight: Math.max(MIN_TOUCH_TARGET, 56),
    paddingHorizontal: layout.gutter,
    paddingVertical: spacing.sm + 2,
  },
  words: { flex: 1, gap: 2 },
  title: { fontSize: typography.sizes.md },
  subtitle: { fontSize: typography.sizes.sm, lineHeight: 20 },
  value: { fontSize: typography.sizes.md, maxWidth: '45%', flexShrink: 1 },
  check: { width: 22, alignItems: 'center' },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
  note: { fontSize: typography.sizes.sm, lineHeight: 20, paddingHorizontal: layout.gutter, paddingTop: spacing.sm },
  disabled: { opacity: 0.45 },
});
