import { useState } from 'react';
import { Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../auth/AuthContext';
import { FIELD_ERROR_COPY, validateEmail } from '../../auth/validators';
import type { AuthStackParamList } from '../../navigation/authStack';
import { colors, spacing, typography } from '../../theme/tokens';
import { AuthScreenShell, Field, LinkText, SubmitButton } from './AuthForm';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen({ navigation }: Props) {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    const emailError = validateEmail(email);
    setError(emailError && FIELD_ERROR_COPY[emailError]);
    if (emailError) return;
    setBusy(true);
    await requestPasswordReset(email.trim());
    setBusy(false);
    setSent(true);
  };

  return (
    <AuthScreenShell title="Şîfreyê vegerîne — Reset password">
      {sent ? (
        <Text
          style={{
            color: colors.textPrimary,
            fontSize: typography.sizes.md,
            marginBottom: spacing.md,
            textAlign: 'center',
          }}
        >
          Eger hesabek bi vê e-nameyê hebe, lînka veguherandinê hat şandin. — If an account
          exists for this email, a reset link is on its way.
        </Text>
      ) : (
        <>
          <Field
            label="E-name — Email"
            value={email}
            onChangeText={setEmail}
            error={error}
            keyboardType="email-address"
            testID="email"
          />
          <SubmitButton label="Bişîne — Send" busy={busy} onPress={submit} />
        </>
      )}
      <LinkText label="Vegere têketinê — Back to log in" onPress={() => navigation.navigate('Login')} />
    </AuthScreenShell>
  );
}
