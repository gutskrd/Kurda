import { useState } from 'react';
import { Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../auth/AuthContext';
import { FIELD_ERROR_COPY, validateEmail } from '../../auth/validators';
import type { AuthStackParamList } from '../../navigation/authStack';
import { spacing, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { AuthScreenShell, Field, LinkText, SubmitButton } from './AuthForm';
import { useI18n } from '../../i18n/I18nContext';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen({ navigation }: Props) {
  const { requestPasswordReset } = useAuth();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { t } = useI18n();
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
    <AuthScreenShell title={t('auth.reset.title')} onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}>
      {sent ? (
        <Text
          style={{
            color: colors.textPrimary,
            fontSize: typography.sizes.md,
            marginBottom: spacing.md,
            textAlign: 'center',
          }}
        >
          {t('auth.reset.sent')}
        </Text>
      ) : (
        <>
          <Field
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            error={error}
            keyboardType="email-address"
            testID="email"
          />
          <SubmitButton label={t('auth.reset.sendLink')} busy={busy} onPress={submit} />
        </>
      )}
      <LinkText label={t('auth.reset.backToLogin')} onPress={() => navigation.navigate('Login')} />
    </AuthScreenShell>
  );
}
