import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../auth/AuthContext';
import { FIELD_ERROR_COPY, validateEmail, validatePassword, FIELD_ERROR_VARS } from '../../auth/validators';
import type { AuthStackParamList } from '../../navigation/authStack';
import { AuthScreenShell, Field, FormError, LinkText, SubmitButton } from './AuthForm';
import { useI18n } from '../../i18n/I18nContext';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
    const error = await login(email.trim(), password);
    setBusy(false);
    if (error) setFormError(error);
  };

  return (
    <AuthScreenShell
      title={t('auth.login.title')}
      subtitle={t('auth.login.subtitle')}
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
        onPress={() => navigation.navigate('ForgotPassword')}
      />
      {/* one sentence with the action in it, the way the browser asks */}
      <LinkText
        label={`${t('auth.login.noAccount')} ${t('auth.login.createAccount')}`}
        onPress={() => navigation.navigate('Register')}
      />
    </AuthScreenShell>
  );
}
