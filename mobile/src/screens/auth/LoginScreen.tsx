import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { radii, spacing, typography } from '../../theme/tokens';
import { ClayButton } from '../../theme/glass';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuth } from '../../auth/AuthContext';
import { FIELD_ERROR_COPY, FIELD_ERROR_VARS, cleanEmail, validateEmail } from '../../auth/validators';
import { StepFlow, type FlowStep } from '../../auth/guide/StepFlow';
import { GuideField } from '../../auth/guide/GuideField';
import type { AuthStackParamList } from '../../navigation/authStack';
import { LinkText } from './AuthForm';
import { useI18n } from '../../i18n/I18nContext';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

/** Sign-in held back after several failed attempts: nothing was mistyped, so they get the notice with a reset link. */
const HELD_BACK = new Set(['CAPTCHA_REQUIRED', 'LOCKED']);

/**
 * Signing in, in two steps (auth/guide): email, then password with a reset link. A wrong password shows the
 * server's message under the field; a held-back sign-in shows the notice with Reset password. An address passed in
 * is prefilled.
 */
export function LoginScreen({ navigation, route }: Props) {
  const { login } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [email, setEmail] = useState(route.params?.email ?? '');
  const [password, setPassword] = useState('');
  const [heldBack, setHeldBack] = useState<string | null>(null);

  const steps: FlowStep[] = [
    {
      key: 'email',
      question: t('guide.email.question'),
      says: t('guide.login.email.says'),
      check: () => {
        const why = validateEmail(email);
        return why ? t(FIELD_ERROR_COPY[why], FIELD_ERROR_VARS) : null;
      },
      render: (tools) => (
        <GuideField
          tools={tools}
          value={email}
          onChangeText={setEmail}
          label={t('auth.email')}
          keyboardType="email-address"
          complete="email"
          placeholder="you@example.com"
          testID="email"
        />
      ),
      // One sentence with the action in it, as on the website.
      footer: <LinkText label={`${t('auth.login.noAccount')} ${t('auth.login.createAccount')}`} onPress={() => navigation.navigate('Register')} />,
    },
    {
      key: 'password',
      question: t('guide.password.question'),
      says: t('guide.login.password.says'),
      action: t('auth.login.submit'),
      check: () => (password ? null : t(FIELD_ERROR_COPY.required, FIELD_ERROR_VARS)),
      render: (tools) => (
        <GuideField tools={tools} value={password} onChangeText={setPassword} label={t('auth.password')} secure complete="current-password" last testID="password" />
      ),
      footer: <LinkText label={t('auth.login.forgot')} onPress={() => navigation.navigate('ForgotPassword', { email: cleanEmail(email) })} />,
      commit: async () => {
        setHeldBack(null);
        const error = await login(cleanEmail(email), password);
        if (!error) return { ok: true };
        if (error.code && HELD_BACK.has(error.code)) {
          setHeldBack(error.message);
          return { ok: false, error: null };
        }
        return { ok: false, error: error.message, says: t('guide.login.wrong.says') };
      },
    },
  ];

  const notice = heldBack ? (
    <View style={[styles.notice, { backgroundColor: colors.controlTrack }]} accessibilityLiveRegion="polite" testID="login-held-back">
      <Text style={[styles.noticeText, { color: colors.textPrimary }]}>{heldBack}</Text>
      <ClayButton label={t('auth.reset.title')} variant="outline" tone="primary" onPress={() => navigation.navigate('ForgotPassword', { email: cleanEmail(email) })} />
    </View>
  ) : null;

  // On success the app root shows the signed-in screens.
  return <StepFlow steps={steps} onFinish={() => undefined} onExit={navigation.canGoBack() ? () => navigation.goBack() : undefined} notice={notice} testID="login-flow" />;
}

const styles = StyleSheet.create({
  // The sign-up notice's calm panel (RegisterScreen.tsx).
  notice: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.md, marginBottom: spacing.md },
  noticeText: { fontSize: typography.sizes.sm, lineHeight: 21 },
});
