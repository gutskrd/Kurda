import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { radii, spacing, typography } from '../../theme/tokens';
import { ClayButton } from '../../theme/glass';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuth } from '../../auth/AuthContext';
import { FIELD_ERROR_COPY, FIELD_ERROR_VARS, cleanEmail, validateEmail, validatePassword } from '../../auth/validators';
import { StepFlow, type FlowStep } from '../../auth/guide/StepFlow';
import { GuideField } from '../../auth/guide/GuideField';
import { AgeRuler } from '../../auth/guide/AgeRuler';
import { MonthChips } from '../../auth/guide/MonthChips';
import { PasswordStrengthMeter } from '../../auth/guide/PasswordStrength';
import { AnswerSummary } from '../../auth/guide/AnswerSummary';
import { birthYearFrom } from '../../auth/guide/age';
import { checkUsername } from '../../username/validate';
import { UsernameStepField } from '../../username/UsernameStepField';
import type { AuthStackParamList } from '../../navigation/authStack';
import { LinkText } from './AuthForm';
import { useI18n } from '../../i18n/I18nContext';
import { AgreeLine } from '../../legal/links';
import { useDirection } from '../../reports/direction';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

/**
 * Signing up in six steps (auth/guide): name, age on the ruler, month, email, password with its strength, and a
 * final review with the terms and Create. Each step is checked as answered, and server refusals go back to the step
 * they concern. Age and month start unset, so nothing is answered for the learner.
 *
 * The name is lowercased as typed, with Kurdish letter keys and invalid characters named under it
 * (username/UsernameStepField.tsx); it is sent normalised (shared/src/username.ts). The request also carries the
 * intro's language and the birth month and year (guide/age.ts). Under 13 no account is made and AgeStopScreen takes
 * over; an address that may have an account gets a neutral notice. On success the verify-email gate takes over.
 */
export function RegisterScreen({ navigation }: Props) {
  const { register, stopForAge } = useAuth();
  const { colors } = useTheme();
  const dir = useDirection();
  const { t, locale } = useI18n();
  const [username, setUsername] = useState('');
  const [age, setAge] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // The address may already have an account; the notice says so without confirming it.
  const [mayHaveAccount, setMayHaveAccount] = useState(false);
  // The normalised name, for the review and the server; the step only continues once it passes.
  const named = checkUsername(username);
  const chosenName = named.ok ? named.value : username.trim();

  const steps: FlowStep[] = [
    {
      key: 'name',
      question: t('guide.register.name.question'),
      says: t('guide.register.name.says'),
      check: () => {
        const checked = checkUsername(username);
        return checked.ok ? null : t(checked.message, checked.vars);
      },
      render: (tools) => (
        <UsernameStepField
          tools={tools}
          value={username}
          onChange={setUsername}
          label={t('auth.username')}
          placeholder={t('auth.register.usernameHelp')}
          testID="username"
        />
      ),
      footer: <LinkText label={`${t('auth.register.haveAccount')} ${t('auth.register.signIn')}`} onPress={() => navigation.navigate('Login')} />,
    },
    {
      key: 'age',
      question: t('guide.register.age.question'),
      says: t('guide.register.age.says'),
      check: () => (age === null ? t('guide.register.age.required') : null),
      render: (tools) => (
        <AgeRuler
          value={age}
          onChange={(next) => {
            tools.edited();
            setAge(next);
          }}
        />
      ),
    },
    {
      key: 'month',
      question: t('guide.register.month.question'),
      says: t('guide.register.month.says'),
      check: () => (month === null ? t('guide.register.month.required') : null),
      render: (tools) => (
        <MonthChips
          value={month}
          onChange={(next) => {
            tools.edited();
            setMonth(next);
          }}
          disabled={tools.busy}
        />
      ),
    },
    {
      key: 'email',
      question: t('guide.email.question'),
      says: t('guide.register.email.says'),
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
    },
    {
      key: 'password',
      question: t('guide.register.password.question'),
      says: t('guide.register.password.says'),
      check: () => {
        const why = validatePassword(password);
        return why ? t(FIELD_ERROR_COPY[why], FIELD_ERROR_VARS) : null;
      },
      render: (tools) => (
        <View>
          <GuideField tools={tools} value={password} onChangeText={setPassword} label={t('auth.password')} secure complete="new-password" last testID="password" />
          <PasswordStrengthMeter password={password} />
        </View>
      ),
    },
    {
      key: 'terms',
      question: t('guide.register.terms.question', { name: chosenName }),
      says: t('guide.register.terms.says'),
      action: t('auth.register.submit'),
      render: () => (
        <AnswerSummary
          rows={[
            { label: t('auth.username'), value: chosenName },
            { label: t('auth.email'), value: cleanEmail(email) },
          ]}
        />
      ),
      // Terms and privacy links, before the account exists.
      footer: <AgreeLine style={styles.terms} />,
      commit: async () => {
        // Age and month have their own steps; this only narrows the types.
        if (age === null) return { ok: false, error: t('guide.register.age.required'), at: 'age' };
        if (month === null) return { ok: false, error: t('guide.register.month.required'), at: 'month' };
        setMayHaveAccount(false);
        const error = await register({
          email: cleanEmail(email),
          username: chosenName,
          password,
          // The intro's language belongs to the account from the start, so the confirmation email is in it.
          locale,
          birthYear: birthYearFrom(age, month),
          birthMonth: month,
        });
        if (!error) return { ok: true };
        // Under 13 no account was made; the app root shows the explanation for as long as the app is open.
        if (error.code === 'UNDER_MINIMUM_AGE') {
          void stopForAge('refused');
          return { ok: false, error: null };
        }
        if (error.code === 'REGISTRATION_FAILED') {
          setMayHaveAccount(true);
          return { ok: false, error: null };
        }
        // A leaked password belongs on the password step.
        if (error.code === 'PASSWORD_BREACHED') return { ok: false, error: error.message, at: 'password' };
        if (error.code === 'USERNAME_TAKEN' || error.code === 'INVALID_USERNAME') {
          return { ok: false, error: error.message, at: 'name', says: t('guide.register.name.taken') };
        }
        return { ok: false, error: error.message };
      },
    },
  ];

  const notice = mayHaveAccount ? (
    <View style={[styles.notice, { backgroundColor: colors.controlTrack }]} accessibilityLiveRegion="polite" testID="register-may-have-account">
      <Text style={[styles.noticeText, dir.text, { color: colors.textPrimary }]}>{t('error.code.registrationFailed')}</Text>
      {/* The two ways on, the first on the side the language starts from. */}
      <View style={[styles.noticeActions, { flexDirection: dir.row }]}>
        <ClayButton label={t('auth.login.submit')} tone="primary" onPress={() => navigation.navigate('Login', { email: cleanEmail(email) })} style={styles.noticeAction} />
        <ClayButton
          label={t('auth.reset.title')}
          variant="outline"
          tone="primary"
          onPress={() => navigation.navigate('ForgotPassword', { email: cleanEmail(email) })}
          style={styles.noticeAction}
        />
      </View>
    </View>
  ) : null;

  // On success the app root replaces the sign-in screens with the verify-email gate.
  return <StepFlow steps={steps} onFinish={() => undefined} onExit={navigation.canGoBack() ? () => navigation.goBack() : undefined} notice={notice} testID="register-flow" />;
}

const styles = StyleSheet.create({
  // A calm panel rather than an error line: nothing was done wrong, and it offers a way forward.
  notice: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.md, marginBottom: spacing.md },
  noticeText: { fontSize: typography.sizes.sm, lineHeight: 21 },
  noticeActions: { flexWrap: 'wrap', gap: spacing.sm },
  noticeAction: { flexGrow: 1 },
  terms: { marginTop: spacing.lg },
});
