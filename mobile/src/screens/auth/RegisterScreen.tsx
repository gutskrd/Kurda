import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { spacing, typography } from '../../theme/tokens';
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
import type { AuthStackParamList } from '../../navigation/authStack';
import { AuthScreenShell, Field, FormError, LinkText, SubmitButton } from './AuthForm';
import { useI18n } from '../../i18n/I18nContext';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const { register } = useAuth();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string | null | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { t, locale } = useI18n();

  const submit = async () => {
    const emailError = validateEmail(email);
    const usernameError = validateUsername(username);
    const passwordError = validatePassword(password);
    setErrors({
      email: emailError ? t(FIELD_ERROR_COPY[emailError], FIELD_ERROR_VARS) : null,
      username: usernameError ? t(FIELD_ERROR_COPY[usernameError], FIELD_ERROR_VARS) : null,
      password: passwordError ? t(FIELD_ERROR_COPY[passwordError], FIELD_ERROR_VARS) : null,
    });
    if (emailError || usernameError || passwordError) return;

    setBusy(true);
    setFormError(null);
    const error = await register({
      email: email.trim(),
      username: username.normalize('NFC').trim(),
      password,
      // the language chosen in the intro is the account's from the first
      // moment, so the confirmation email and a later sign-in on the web
      // already speak it. The browser has always sent this; the phone asked
      // the question, remembered the answer locally, and never told the server
      locale,
    });
    setBusy(false);
    if (error) setFormError(error);
  };

  return (
    <AuthScreenShell
      title={t('auth.register.title')}
      subtitle={t('auth.register.freeToStart')}
      onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
    >
      <FormError message={formError} />
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
      <SubmitButton label={busy ? t('auth.register.submitting') : t('auth.register.submit')} busy={busy} onPress={submit} />
      <Text style={[styles.terms, { color: colors.textSecondary }]}>{t('auth.register.terms')}</Text>
      <LinkText
        label={`${t('auth.register.haveAccount')} ${t('auth.register.signIn')}`}
        onPress={() => navigation.navigate('Login')}
      />
    </AuthScreenShell>
  );
}

const styles = StyleSheet.create({
  hint: {
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
    fontSize: typography.sizes.xs,
  },
  terms: {
    marginTop: spacing.sm,
    fontSize: typography.sizes.xs,
    textAlign: 'center',
  },
});
