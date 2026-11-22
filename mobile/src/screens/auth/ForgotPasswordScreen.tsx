import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../auth/AuthContext';
import { AnswerSummary } from '../../auth/guide/AnswerSummary';
import { GuideField } from '../../auth/guide/GuideField';
import { StepFlow, type FlowStep } from '../../auth/guide/StepFlow';
import { FIELD_ERROR_COPY, FIELD_ERROR_VARS, cleanEmail, validateEmail } from '../../auth/validators';
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
 * Requests a reset link: signed out from the sign-in form, or signed in from Change password for a Google or Apple
 * account without a password. Asked as a StepFlow step with the sign-in's address prefilled.
 *
 * The confirmation step shows the address as typed so a typo can be caught, with the chevron going back to fix it.
 * It says "if an account exists" so it never reveals whether one does. A request that never reached the server
 * stays on the question and says why.
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
        const failure = await requestPasswordReset(cleanEmail(email));
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
      footer: onBackToLogin ? <LinkText label={t('auth.reset.backToLogin')} onPress={() => onBackToLogin(cleanEmail(email))} /> : undefined,
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
          <AnswerSummary rows={[{ label: t('auth.email'), value: cleanEmail(email) }]} testID="reset-sent-to" />
        </View>
      ),
    },
  ];

  return (
    <StepFlow
      steps={steps}
      progress={false}
      onFinish={() => (onBackToLogin ? onBackToLogin(cleanEmail(email)) : onBack?.())}
      onExit={onBack}
      testID="reset-flow"
    />
  );
}

const styles = StyleSheet.create({
  sent: { gap: spacing.md },
  lead: { fontSize: typography.sizes.text, lineHeight: 22, marginTop: -spacing.sm },
});
