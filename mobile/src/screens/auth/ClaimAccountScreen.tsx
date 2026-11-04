import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { radii, spacing, typography } from '../../theme/tokens';
import { ClayButton } from '../../theme/glass';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuth } from '../../auth/AuthContext';
import {
  FIELD_ERROR_COPY,
  PASSWORD_RULES_KEY,
  validateEmail,
  validatePassword,
  validateUsername,
  FIELD_ERROR_VARS,
} from '../../auth/validators';
import { AuthScreenShell, Field, FormError, LinkText, SubmitButton } from './AuthForm';
import { useI18n } from '../../i18n/I18nContext';
import { BirthMonthFields } from '../../auth/BirthMonthFields';
import { birthMonthOf, EMPTY_BIRTH_MONTH } from '../../auth/birthMonth';
import { AgreeLine } from '../../legal/links';

/**
 * A guest making the account their own.
 *
 * The sign-up form, over the app, posting through `claimAccount` instead of
 * `register`: the same account, with everything learned on it, gets an email,
 * a password and a birth month. The username comes filled in with the one the
 * guest was given, so it can be kept with no typing or changed in the one
 * field; it is sent only when it changed.
 *
 * On success the screen does nothing of its own. The server answers with the
 * account unverified and a code on its way, and the app's root replaces the
 * whole signed-in tree with the verify-email gate — this screen is gone with
 * it. Should an account ever come back already verified, the effect below
 * closes the form, so a finished claim never leaves the form standing.
 *
 * Refusals are the register form's: an address that may already have an
 * account gets the calm notice with Sign in and Reset password; a leaked
 * password is said at its field; under 13 the account cannot be claimed, and
 * since a guest that age may not keep learning on it either, the session ends
 * and the explanation takes the screen, as a refused sign-up's does.
 */
export function ClaimAccountScreen({
  onExit,
  onSignIn,
  onForgotPassword,
}: {
  onExit: () => void;
  /** "I already have an account": the sign-in form, which replaces the guest session */
  onSignIn: (email?: string) => void;
  onForgotPassword: (email: string) => void;
}): React.JSX.Element {
  const { user, claimAccount, stopForAge, logout } = useAuth();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState(user?.username ?? '');
  const [password, setPassword] = useState('');
  const [birth, setBirth] = useState(EMPTY_BIRTH_MONTH);
  const [errors, setErrors] = useState<Record<string, string | null | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [mayHaveAccount, setMayHaveAccount] = useState(false);
  const [busy, setBusy] = useState(false);
  const { t, locale } = useI18n();

  // a claim that came back already verified, or an account signed in to meanwhile: the form has nothing left to do
  const claimed = user !== null && user.guest !== true;
  // once: the route hands a fresh `onExit` on every render, and closing is not a thing to do twice
  const closed = useRef(false);
  useEffect(() => {
    if (!claimed || closed.current) return;
    closed.current = true;
    onExit();
  }, [claimed, onExit]);

  const submit = async () => {
    const emailError = validateEmail(email);
    const usernameError = validateUsername(username);
    const passwordError = validatePassword(password);
    const chosen = birthMonthOf(birth);
    setErrors({
      email: emailError ? t(FIELD_ERROR_COPY[emailError], FIELD_ERROR_VARS) : null,
      username: usernameError ? t(FIELD_ERROR_COPY[usernameError], FIELD_ERROR_VARS) : null,
      password: passwordError ? t(FIELD_ERROR_COPY[passwordError], FIELD_ERROR_VARS) : null,
      birth: chosen ? null : t('age.required'),
    });
    if (emailError || usernameError || passwordError || !chosen) return;

    setBusy(true);
    setFormError(null);
    setMayHaveAccount(false);
    const chosenName = username.normalize('NFC').trim();
    const error = await claimAccount({
      email: email.trim(),
      // the generated name kept is not a change to send
      ...(chosenName !== user?.username ? { username: chosenName } : {}),
      password,
      locale,
      ...chosen,
    });
    setBusy(false);
    if (error?.code === 'UNDER_MINIMUM_AGE') {
      await logout();
      void stopForAge('refused');
    } else if (error?.code === 'REGISTRATION_FAILED') setMayHaveAccount(true);
    else if (error?.code === 'PASSWORD_BREACHED') setErrors((was) => ({ ...was, password: error.message }));
    else if (error) setFormError(error.message);
  };

  return (
    <AuthScreenShell title={t('claim.title')} subtitle={t('claim.subtitle')} onBack={onExit}>
      <FormError message={formError} />
      {mayHaveAccount ? (
        <View style={[styles.notice, { backgroundColor: colors.controlTrack }]} accessibilityLiveRegion="polite" testID="claim-may-have-account">
          <Text style={[styles.noticeText, { color: colors.textPrimary }]}>{t('error.code.registrationFailed')}</Text>
          <View style={styles.noticeActions}>
            <ClayButton label={t('auth.login.submit')} tone="primary" onPress={() => onSignIn(email.trim())} style={styles.noticeAction} />
            <ClayButton
              label={t('auth.reset.title')}
              variant="outline"
              tone="primary"
              onPress={() => onForgotPassword(email.trim())}
              style={styles.noticeAction}
            />
          </View>
        </View>
      ) : null}
      <Field
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        keyboardType="email-address"
        placeholder="you@example.com"
        complete="email"
        testID="email"
      />
      <Field
        label={t('auth.username')}
        value={username}
        onChangeText={setUsername}
        error={errors.username}
        placeholder={t('auth.register.usernameHelp')}
        complete="username"
        testID="username"
      />
      <Field
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secure
        complete="new-password"
        testID="password"
      />
      {!errors.password ? (
        <Text style={[styles.hint, { color: colors.textSecondary }]}>{t(PASSWORD_RULES_KEY, FIELD_ERROR_VARS)}</Text>
      ) : null}
      <BirthMonthFields value={birth} onChange={setBirth} error={errors.birth} disabled={busy} />
      <SubmitButton label={busy ? t('auth.register.submitting') : t('guest.createAccount')} busy={busy} onPress={submit} />
      {/* the rules and the privacy policy, each a link: the guest agreed as a guest, and agrees again as the account's owner */}
      <AgreeLine style={styles.terms} />
      <LinkText label={t('welcome.haveAccount')} onPress={() => onSignIn()} />
    </AuthScreenShell>
  );
}

const styles = StyleSheet.create({
  // the sign-up notice's calm panel (RegisterScreen.tsx): a pause, not a mistake
  notice: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.md, marginBottom: spacing.md },
  noticeText: { fontSize: typography.sizes.sm, lineHeight: 21 },
  noticeActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  noticeAction: { flexGrow: 1 },
  hint: {
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
    fontSize: typography.sizes.xs,
  },
  terms: { marginTop: spacing.sm },
});
