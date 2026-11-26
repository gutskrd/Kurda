import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { PIN_MAX_LENGTH, isValidPin, type FamilyPerson } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useI18n } from '../i18n/I18nContext';
import type { PersonRef } from '../parental/api';
import { useDirection } from '../reports/direction';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';

/** The pieces the family pages share: a person as the parental rows take them, a code shown large, and a PIN field. */

/** A family member as the parental pages' rows draw a person: the family knows them by one name. */
export function asPerson(p: Pick<FamilyPerson, 'userId' | 'name' | 'avatarUrl'>): PersonRef {
  return { userId: p.userId, username: p.name, displayName: p.name, avatarUrl: p.avatarUrl };
}

/**
 * A code in a card, large and spaced to be read across a room, with how long it works under it; while it is being
 * made, `children` stand in its place.
 */
export function CodeCard({ code, label, valid, testID }: { code: string; label: string; valid: string; testID?: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.glassFill, shadowColor: colors.softShadow }]}>
      <Text
        selectable
        style={[styles.code, { color: colors.textPrimary }]}
        accessibilityLabel={`${label}: ${code.split('').join(' ')}`}
        maxFontSizeMultiplier={1.3}
        testID={testID}
      >
        {code}
      </Text>
      <Text style={[styles.valid, { color: colors.textSecondary }]}>{valid}</Text>
    </View>
  );
}

/** Minutes and seconds left until `until`, ticking each second; zero once it has passed. */
export function useCountdown(until: string | null): number {
  const [left, setLeft] = useState(() => (until ? Math.max(0, Date.parse(until) - Date.now()) : 0));
  useEffect(() => {
    if (!until) return;
    const tick = () => setLeft(Math.max(0, Date.parse(until) - Date.now()));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [until]);
  return left;
}

/**
 * A PIN's digits, hidden as they are typed, on the number pad. A wrong one is said under it in the danger colour with
 * the alert glyph, so the colour is never the only sign.
 */
export function PinField({
  value,
  onChange,
  label,
  error,
  onSubmit,
  autoFocus = false,
  testID,
}: {
  value: string;
  onChange: (pin: string) => void;
  label: string;
  error?: string | null;
  onSubmit?: () => void;
  autoFocus?: boolean;
  testID?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <View style={styles.pinWrap}>
      <Text style={[styles.pinLabel, dir.text, { color: colors.textPrimary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, PIN_MAX_LENGTH))}
        onSubmitEditing={onSubmit}
        keyboardType="number-pad"
        secureTextEntry
        autoFocus={autoFocus}
        autoComplete="off"
        textContentType="oneTimeCode"
        maxLength={PIN_MAX_LENGTH}
        accessibilityLabel={label}
        testID={testID}
        style={[styles.pin, { color: colors.textPrimary, backgroundColor: colors.controlTrack, borderColor: error ? colors.danger : 'transparent' }]}
      />
      {error ? (
        <View style={[styles.error, { flexDirection: dir.row }]} accessibilityLiveRegion="polite">
          <Icon name="alert" size={16} color={colors.danger} />
          <Text style={[styles.errorText, dir.text, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Whether a PIN is complete enough to send: four to six digits. */
export function pinReady(pin: string): boolean {
  return isValidPin(pin);
}

/** A sentence in the danger colour with the alert glyph, for what went wrong on a form. */
export function FormError({ text, testID }: { text: string; testID?: string }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <View style={[styles.error, { flexDirection: dir.row }]} accessibilityLiveRegion="polite" testID={testID}>
      <Icon name="alert" size={16} color={colors.danger} />
      <Text style={[styles.errorText, dir.text, { color: colors.danger }]}>{text}</Text>
    </View>
  );
}

/** The time left on a code as "9:41". */
export function minutesSeconds(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** A line under a code saying how long it still works, or that it has run out. */
export function useValidLine(expiresAt: string | null): { left: number; line: string } {
  const { t } = useI18n();
  const left = useCountdown(expiresAt);
  return { left, line: left > 0 ? t('family.code.left', { time: minutesSeconds(left) }) : t('family.code.expired') };
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
  code: { fontSize: typography.sizes.title, fontWeight: typography.weights.semibold, letterSpacing: 6, fontVariant: ['tabular-nums'] },
  valid: { fontSize: typography.sizes.text },
  pinWrap: { alignSelf: 'stretch', gap: spacing.xs + 2 },
  pinLabel: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  pin: {
    minHeight: MIN_TOUCH_TARGET + 8,
    borderRadius: radii.md,
    borderWidth: 2,
    paddingHorizontal: spacing.md,
    fontSize: typography.sizes.title,
    letterSpacing: 8,
    textAlign: 'center',
  },
  error: { alignItems: 'flex-start', gap: spacing.sm },
  errorText: { flex: 1, fontSize: typography.sizes.text, lineHeight: 20 },
});
