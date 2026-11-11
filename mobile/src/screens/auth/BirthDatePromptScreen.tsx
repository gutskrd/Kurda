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
 * The one question an account without a birth month is asked before anything
 * else: a Google or Apple sign-up, which tells us nothing about age, and every
 * account made before the question existed.
 *
 * Blocking, because the answer decides what the rest of the app may do — who
 * can find you, who can send you a request, whether you are in a league — and
 * every one of those would otherwise run on a guess. It can be answered once,
 * and it can be left by signing out or by deleting the account, which is
 * still an account while it is held here.
 *
 * It is asked the way sign-up asks it (auth/guide/StepFlow): how old, on the
 * ruler, then which month, in Hevalo's words, so somebody who came in through
 * Google or Apple meets the same two steps as somebody who typed an address.
 * It was a card with two pickers, a month and a year back to 1900. Because
 * the answer cannot be changed, the last step shows it back as the month and
 * year it comes to before it is saved; the chevron goes back to the ruler.
 *
 * Under 13 the server closes the account; the session goes with it and the
 * explanation takes over (AgeStopScreen).
 */
export function BirthDatePromptScreen() {
  const { client, refreshUser, stopForAge, logout } = useAuth();
  const confirmDelete = useConfirmDelete();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  // unchosen until the ruler is moved, as on the sign-up: an age set for them would be the answer of whoever only taps on
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
          {/* what the two answers come to, to be read over: it is saved once and for good */}
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
        // the age is answered on its own step; this is only for the types
        if (age === null) return { ok: false, error: t('guide.register.age.required'), at: 'age' };
        if (month === null) return { ok: false, error: t('guide.register.month.required') };
        const res = await client.post('/me/birth-date', { birthYear: birthYearFrom(age, month), birthMonth: month });
        if (res.ok) {
          // the gate lifts once the account no longer says a birth month is needed
          await refreshUser();
          return { ok: true };
        }
        if (res.error.code === 'UNDER_MINIMUM_AGE') {
          await stopForAge('closed');
          return { ok: false, error: null };
        }
        // answered from another device in the meantime: nothing left to ask
        if (res.error.code === 'BIRTH_DATE_ALREADY_SET') {
          await refreshUser();
          return { ok: true };
        }
        return { ok: false, error: describeError(res.error, t) };
      },
    },
  ];

  // answered, the app root shows the signed-in screens: nothing to do here
  return <StepFlow steps={steps} onFinish={() => undefined} testID="birth-flow" />;
}

const styles = StyleSheet.create({
  month: { gap: spacing.md },
  once: { fontSize: typography.sizes.xs, lineHeight: 18 },
});
