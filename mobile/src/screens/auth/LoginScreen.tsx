import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { radii, spacing, typography } from '../../theme/tokens';
import { ClayButton } from '../../theme/glass';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuth } from '../../auth/AuthContext';
import { FIELD_ERROR_COPY, validateEmail, validatePassword, FIELD_ERROR_VARS } from '../../auth/validators';
import type { AuthStackParamList } from '../../navigation/authStack';
import { AuthScreenShell, Field, FormError, LinkText, SubmitButton } from './AuthForm';
import { useI18n } from '../../i18n/I18nContext';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

/**
 * Refusals that are not a wrong password: sign-in is held back for a while
 * after several failed attempts. Nothing was typed wrong just now, and a
 * reset is the way in that does not wait, so they get the notice with it.
 */
const HELD_BACK = new Set(['CAPTCHA_REQUIRED', 'LOCKED']);

export function LoginScreen({ navigation, route }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState(route.params?.email ?? '');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [heldBack, setHeldBack] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { colors } = useTheme();
  const { t } = useI18n();

  const submit = async () => {
    const emailError = validateEmail(email);
    const passwordError = password ? null : validatePassword(password);
    setErrors({
      email: emailError ? t(FIELD_ERROR_COPY[emailError], FIELD_ERROR_VARS) : null,
      password: passwordError ? t(FIELD_ERROR_COPY[passwordError], FIELD_ERROR_VARS) : null,
    });
    if (emailError || passwordError) return;

    setBusy(true);
    setFormError(null);
    setHeldBack(null);
    const error = await login(email.trim(), password);
    setBusy(false);
    if (error?.code && HELD_BACK.has(error.code)) setHeldBack(error.message);
    else if (error) setFormError(error.message);
  };

  return (
    <AuthScreenShell
      title={t('auth.login.title')}
      subtitle={t('auth.login.subtitle')}
      onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
    >
      <FormError message={formError} />
      {heldBack ? (
        <View style={[styles.notice, { backgroundColor: colors.controlTrack }]} accessibilityLiveRegion="polite" testID="login-held-back">
          <Text style={[styles.noticeText, { color: colors.textPrimary }]}>{heldBack}</Text>
          <ClayButton
            label={t('auth.reset.title')}
            variant="outline"
            tone="primary"
            onPress={() => navigation.navigate('ForgotPassword', { email: email.trim() })}
          />
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
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secure
        complete="current-password"
        testID="password"
      />
      <SubmitButton label={busy ? t('auth.login.submitting') : t('auth.login.submit')} busy={busy} onPress={submit} />
      <LinkText
        label={t('auth.login.forgot')}
        onPress={() => navigation.navigate('ForgotPassword', { email: email.trim() })}
      />
      {/* one sentence with the action in it, the way the browser asks */}
      <LinkText
        label={`${t('auth.login.noAccount')} ${t('auth.login.createAccount')}`}
        onPress={() => navigation.navigate('Register')}
      />
    </AuthScreenShell>
  );
}

const styles = StyleSheet.create({
  // the sign-up notice's calm panel (RegisterScreen.tsx): a pause, not a mistake
  notice: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.md, marginBottom: spacing.md },
  noticeText: { fontSize: typography.sizes.sm, lineHeight: 21 },
});
