import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { describeError } from '../../api/errors';
import { useAuth } from '../../auth/AuthContext';
import { MONTH_KEYS } from '../../auth/birthMonth';
import { AgeRuler } from '../../auth/guide/AgeRuler';
import { AnswerSummary } from '../../auth/guide/AnswerSummary';
import { MonthChips } from '../../auth/guide/MonthChips';
import { StepFlow, type FlowStep } from '../../auth/guide/StepFlow';
import { WaysOut } from '../../auth/guide/WaysOut';
import { birthYearFrom } from '../../auth/guide/age';
import { useConfirmDelete } from '../../auth/useConfirmDelete';
import { useI18n } from '../../i18n/I18nContext';
import { useDirection } from '../../reports/direction';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, typography } from '../../theme/tokens';

/**
 * The question an account without a birth month must answer first: a Google or Apple sign-up, or an account made
 * before the question existed. It blocks the app because the answer decides discoverability, requests and leagues.
 * It can be answered once, or left by signing out or deleting the account.
 *
 * Asked the way sign-up asks it (auth/guide/StepFlow): age on the ruler, then month. Since the answer is final, the
 * last step shows the resulting month and year before saving. Under 13 the server closes the account and
 * AgeStopScreen takes over.
 */
export function BirthDatePromptScreen() {
  const { client, refreshUser, stopForAge, logout } = useAuth();
  const confirmDelete = useConfirmDelete();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  // Unset until the ruler moves, so an age is never chosen for someone who only taps on.
  const [age, setAge] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);

  const waysOut = (
    <WaysOut
      ways={[
        { label: t('profile.logout'), onPress: () => void logout() },
        { label: t('settings.delete.title'), onPress: confirmDelete, danger: true, testID: 'delete-account' },
      ]}
    />
  );

  const steps: FlowStep[] = [
    {
      key: 'age',
      question: t('guide.register.age.question'),
      says: t('guide.register.age.says'),
      check: () => (age === null ? t('guide.register.age.required') : null),
      render: (tools) => (
        <AgeRuler
          value={age}
          onChange={(next) => {
            tools.edited();
            setAge(next);
          }}
        />
      ),
      footer: waysOut,
    },
    {
      key: 'month',
      question: t('guide.register.month.question'),
      says: t('guide.register.month.says'),
      action: t('age.prompt.save'),
      check: () => (month === null ? t('guide.register.month.required') : null),
      render: (tools) => (
        <View style={styles.month}>
          <MonthChips
            value={month}
            onChange={(next) => {
              tools.edited();
              setMonth(next);
            }}
            disabled={tools.busy}
          />
          {/* The resulting month and year, to check before the one-time save. */}
          {age !== null && month !== null ? (
            <View style={styles.month}>
              <AnswerSummary rows={[{ label: t('age.label'), value: `${t(MONTH_KEYS[month - 1]!)} ${birthYearFrom(age, month)}` }]} testID="birth-summary" />
              <Text style={[styles.once, dir.text, { color: colors.textSecondary }]}>{t('age.prompt.once')}</Text>
            </View>
          ) : null}
        </View>
      ),
      footer: waysOut,
      commit: async () => {
        // The age has its own step; this only narrows the type.
        if (age === null) return { ok: false, error: t('guide.register.age.required'), at: 'age' };
        if (month === null) return { ok: false, error: t('guide.register.month.required') };
        const res = await client.post('/me/birth-date', { birthYear: birthYearFrom(age, month), birthMonth: month });
        if (res.ok) {
          // The gate lifts once the account no longer needs a birth month.
          await refreshUser();
          return { ok: true };
        }
        if (res.error.code === 'UNDER_MINIMUM_AGE') {
          await stopForAge('closed');
          return { ok: false, error: null };
        }
        // Already answered from another device.
        if (res.error.code === 'BIRTH_DATE_ALREADY_SET') {
          await refreshUser();
          return { ok: true };
        }
        return { ok: false, error: describeError(res.error, t) };
      },
    },
  ];

  // Once answered, the app root shows the signed-in screens.
  return <StepFlow steps={steps} onFinish={() => undefined} testID="birth-flow" />;
}

const styles = StyleSheet.create({
  month: { gap: spacing.md },
  once: { fontSize: typography.sizes.text, lineHeight: 22 },
});
