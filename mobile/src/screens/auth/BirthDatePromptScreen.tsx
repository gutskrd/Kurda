import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import { describeError } from '../../api/errors';
import { BirthMonthFields } from '../../auth/BirthMonthFields';
import { birthMonthOf, EMPTY_BIRTH_MONTH } from '../../auth/birthMonth';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, typography } from '../../theme/tokens';
import { useI18n } from '../../i18n/I18nContext';
import { AuthScreenShell, FormError, LinkText, SubmitButton } from './AuthForm';

/**
 * The one question an account without a birth month is asked before anything
 * else: a Google or Apple sign-up, which tells us nothing about age, and every
 * account made before the question existed.
 *
 * Blocking, because the answer decides what the rest of the app may do — who
 * can find you, who can send you a request, whether you are in a league — and
 * every one of those would otherwise run on a guess. Small, because it is one
 * question. It can be answered once, which the screen says before it is saved,
 * and it can be left by signing out.
 *
 * Under 13 the server closes the account; the session goes with it and the
 * explanation takes over (AgeStopScreen).
 */
export function BirthDatePromptScreen() {
  const { client, refreshUser, stopForAge, logout } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [birth, setBirth] = useState(EMPTY_BIRTH_MONTH);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const chosen = birthMonthOf(birth);
    if (!chosen) {
      setFieldError(t('age.required'));
      return;
    }
    setFieldError(null);
    setFormError(null);
    setBusy(true);
    const res = await client.post('/me/birth-date', chosen);
    if (res.ok) {
      // the gate lifts once the account no longer says a birth month is needed
      await refreshUser();
      setBusy(false);
      return;
    }
    setBusy(false);
    if (res.error.code === 'UNDER_MINIMUM_AGE') {
      await stopForAge('closed');
      return;
    }
    // answered from another device in the meantime: nothing left to ask
    if (res.error.code === 'BIRTH_DATE_ALREADY_SET') {
      await refreshUser();
      return;
    }
    setFormError(describeError(res.error, t));
  };

  return (
    <AuthScreenShell title={t('age.prompt.title')} subtitle={t('age.prompt.body')}>
      <FormError message={formError} />
      <BirthMonthFields value={birth} onChange={setBirth} error={fieldError} disabled={busy} />
      <Text style={[styles.once, { color: colors.textSecondary }]}>{t('age.prompt.once')}</Text>
      <SubmitButton label={busy ? t('age.prompt.saving') : t('age.prompt.save')} busy={busy} onPress={save} />
      <LinkText label={t('profile.logout')} onPress={() => void logout()} />
    </AuthScreenShell>
  );
}

const styles = StyleSheet.create({
  once: { fontSize: typography.sizes.xs, marginBottom: spacing.sm },
});
