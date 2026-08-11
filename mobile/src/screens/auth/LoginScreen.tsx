import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../auth/AuthContext';
import { FIELD_ERROR_COPY, validateEmail, validatePassword } from '../../auth/validators';
import type { AuthStackParamList } from '../../navigation/authStack';
import { AuthScreenShell, Field, FormError, LinkText, SubmitButton } from './AuthForm';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const emailError = validateEmail(email);
    const passwordError = password ? null : validatePassword(password);
    setErrors({
      email: emailError && FIELD_ERROR_COPY[emailError],
      password: passwordError && FIELD_ERROR_COPY[passwordError],
    });
    if (emailError || passwordError) return;

    setBusy(true);
    setFormError(null);
    const error = await login(email.trim(), password);
    setBusy(false);
    if (error) setFormError(error);
  };

  return (
    <AuthScreenShell title="Log in" onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}>
      <FormError message={formError} />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        keyboardType="email-address"
        testID="email"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secure
        testID="password"
      />
      <SubmitButton label="Log in" busy={busy} onPress={submit} />
      <LinkText
        label="Forgot password?"
        onPress={() => navigation.navigate('ForgotPassword')}
      />
      <LinkText
        label="Create an account"
        onPress={() => navigation.navigate('Register')}
      />
    </AuthScreenShell>
  );
}
