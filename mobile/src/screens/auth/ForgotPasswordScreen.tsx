import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../auth/AuthContext';
import { AnswerSummary } from '../../auth/guide/AnswerSummary';
import { GuideField } from '../../auth/guide/GuideField';
import { StepFlow, type FlowStep } from '../../auth/guide/StepFlow';
import { FIELD_ERROR_COPY, FIELD_ERROR_VARS, validateEmail } from '../../auth/validators';
import { useI18n } from '../../i18n/I18nContext';
import type { AuthStackParamList } from '../../navigation/authStack';
import { useDirection } from '../../reports/direction';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, typography } from '../../theme/tokens';
import { LinkText } from './AuthForm';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen({ navigation, route }: Props) {
  return (
    <ForgotPasswordForm
      email={route.params?.email}
      onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      onBackToLogin={(email) => navigation.navigate('Login', { email })}
    />
  );
}

/**
 * Ask for a reset link. Signed out, from the sign-in form; signed in, from
 * Change password, for an account that signs in with Google or Apple and has
 * no password to change yet — where there is no sign-in to go back to.
 *
 * It is asked the way signing in is (auth/guide/StepFlow), because it is
 * reached from there: Hevalo asks where to send the link, over the one
 * field, with the address the sign-in had already filled in. It was a card of
 * its own, and what came after sending was one grey sentence in its middle.
 *
 * What comes after is now a step: the address is shown back as it was typed,
 * since a typo is only ever caught by seeing it, and the chevron goes back to
 * put it right. The sentence still says "if an account exists": whether one
 * does is not something to tell whoever is asking. A request that never
 * reached the server (offline, a fault, too many tries) stays on the question
 * and says why, because "on its way" would not be true.
 */
export function ForgotPasswordForm({
  email: initialEmail,
  onBack,
  onBackToLogin,
}: {
  email?: string;
  onBack?: () => void;
  onBackToLogin?: (email: string) => void;
}) {
  const { requestPasswordReset } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [email, setEmail] = useState(initialEmail ?? '');

  const steps: FlowStep[] = [
    {
      key: 'email',
      question: t('guide.email.question'),
      says: t('guide.reset.says'),
      action: t('auth.reset.sendLink'),
      check: () => {
        const why = validateEmail(email);
        return why ? t(FIELD_ERROR_COPY[why], FIELD_ERROR_VARS) : null;
      },
      commit: async () => {
        const failure = await requestPasswordReset(email.trim());
        return failure ? { ok: false, error: failure } : { ok: true };
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
          last
          testID="email"
        />
      ),
      footer: onBackToLogin ? <LinkText label={t('auth.reset.backToLogin')} onPress={() => onBackToLogin(email.trim())} /> : undefined,
    },
    {
      key: 'sent',
      question: t('guide.reset.sent.question'),
      says: t('guide.reset.sent.says'),
      action: onBackToLogin ? t('auth.reset.backToLogin') : t('common.done'),
      render: () => (
        <View style={styles.sent}>
          <Text style={[styles.lead, dir.text, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
            {t('auth.reset.sent')}
          </Text>
          <AnswerSummary rows={[{ label: t('auth.email'), value: email.trim() }]} testID="reset-sent-to" />
        </View>
      ),
    },
  ];

  return (
    <StepFlow
      steps={steps}
      progress={false}
      onFinish={() => (onBackToLogin ? onBackToLogin(email.trim()) : onBack?.())}
      onExit={onBack}
      testID="reset-flow"
    />
  );
}

const styles = StyleSheet.create({
  sent: { gap: spacing.md },
  lead: { fontSize: typography.sizes.md, lineHeight: 22, marginTop: -spacing.sm },
});
