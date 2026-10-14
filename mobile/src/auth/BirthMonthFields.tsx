import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GlassCard } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useI18n } from '../i18n/I18nContext';
import { MONTH_KEYS, yearChoices, type BirthMonthValue } from './birthMonth';

/**
 * Birth month and year, asked the neutral way — the browser's form, on a phone.
 *
 * Both start empty, with no default to accept and no year pre-chosen, and every
 * year back to 1900 is listed, the young ones too, so nothing on the form hints
 * at which answer gets you in or gets you more. Each half opens a list rather
 * than a wheel: a wheel has to rest on some year, and whichever it rests on is
 * a suggestion.
 */
export function BirthMonthFields({
  value,
  onChange,
  error,
  disabled = false,
}: {
  value: BirthMonthValue;
  onChange: (next: BirthMonthValue) => void;
  error?: string | null;
  disabled?: boolean;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const years = useMemo(() => yearChoices(), []);
  const months = useMemo(() => MONTH_KEYS.map((key, i) => ({ value: i + 1, label: t(key) })), [t]);

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{t('age.label')}</Text>
      <View style={styles.row}>
        <Picker
          title={t('age.month')}
          options={months}
          value={value.month}
          onChange={(month) => onChange({ ...value, month })}
          invalid={Boolean(error)}
          disabled={disabled}
          wide
          testID="birth-month"
        />
        <Picker
          title={t('age.year')}
          options={years.map((y) => ({ value: y, label: String(y) }))}
          value={value.year}
          onChange={(year) => onChange({ ...value, year })}
          invalid={Boolean(error)}
          disabled={disabled}
          testID="birth-year"
        />
      </View>
      {error ? (
        <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
      ) : (
        <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('age.help')}</Text>
      )}
    </View>
  );
}

/** One half: a field that reads like the others on the form, opening a list. */
function Picker({
  title,
  options,
  value,
  onChange,
  invalid,
  disabled,
  wide = false,
  testID,
}: {
  title: string;
  options: { value: number; label: string }[];
  value: number | null;
  onChange: (next: number) => void;
  invalid: boolean;
  disabled: boolean;
  wide?: boolean;
  testID: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const chosen = options.find((o) => o.value === value) ?? null;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={chosen ? `${title}: ${chosen.label}` : title}
        testID={testID}
        style={[
          styles.input,
          wide ? styles.inputWide : styles.inputNarrow,
          { backgroundColor: colors.controlTrack, borderColor: invalid ? colors.danger : colors.glassBorder },
          disabled && styles.inputDisabled,
        ]}
      >
        <Text style={[styles.inputText, { color: chosen ? colors.textPrimary : colors.textSecondary }]} numberOfLines={1}>
          {chosen ? chosen.label : title}
        </Text>
        <Icon name="chevron-down" size={14} color={colors.textSecondary} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable onPress={() => undefined} style={styles.sheetWrap}>
            <GlassCard style={styles.sheet}>
              <Text style={[styles.sheetTitle, { color: colors.textSecondary }]}>{title}</Text>
              <ScrollView style={styles.list} showsVerticalScrollIndicator>
                {options.map((opt) => {
                  const active = opt.value === value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => {
                        onChange(opt.value);
                        setOpen(false);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={styles.option}
                    >
                      <Text
                        style={[styles.optionText, { color: active ? colors.primary : colors.textPrimary }, active && styles.optionActive]}
                      >
                        {opt.label}
                      </Text>
                      {active ? <Icon name="check" size={18} color={colors.primary} /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </GlassCard>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: spacing.md },
  label: { fontSize: typography.sizes.sm, marginBottom: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm },
  input: {
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  inputWide: { flex: 3 },
  inputNarrow: { flex: 2 },
  inputDisabled: { opacity: 0.6 },
  inputText: { flex: 1, fontSize: typography.sizes.md },
  hint: { fontSize: typography.sizes.xs, marginTop: spacing.xs },
  error: { fontSize: typography.sizes.xs, marginTop: spacing.xs },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  sheetWrap: { alignSelf: 'stretch' },
  sheet: { alignSelf: 'stretch', gap: spacing.xs },
  sheetTitle: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, textTransform: 'uppercase', marginBottom: spacing.xs },
  list: { maxHeight: 360 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: spacing.sm,
  },
  optionText: { fontSize: typography.sizes.lg },
  optionActive: { fontWeight: typography.weights.bold },
});
