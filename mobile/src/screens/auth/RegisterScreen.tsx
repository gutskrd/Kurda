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
import { USERNAME_RULE_VARS, checkUsername, cleanUsername } from '../../username/validate';
import type { AuthStackParamList } from '../../navigation/authStack';
import { LinkText } from './AuthForm';
import { useI18n } from '../../i18n/I18nContext';
import { AgreeLine } from '../../legal/links';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

/**
 * Signing up, one question at a time, with Hevalo asking them.
 *
 * It was one form with every field on it. Now it is six steps (auth/guide):
 * a name, an age on the ruler, the month, an email, a password with its
 * strength under it, and a last look over the answers with the rules and the
 * Create button. Each is checked as it is answered, and the server's own
 * refusals go back to the step they are about — a leaked password to the
 * password, a taken name to the name — rather than landing under a form.
 * Nothing is answered for them: the age and the month both start unchosen,
 * and Continue waits until each is picked.
 *
 * What is sent is exactly what the form sent: the name, the address, the
 * password, the language chosen in the intro, and the birth month and year
 * the age and month come to (guide/age.ts). Under 13 no account was made and
 * the explanation takes the screen (AgeStopScreen, shown by the app root);
 * an address that may already have an account gets the calm notice with the
 * two ways on, said without saying so. On success the verify-email gate takes
 * over, as it always did.
 */
export function RegisterScreen({ navigation }: Props) {
  const { register, stopForAge } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const [username, setUsername] = useState('');
  const [age, setAge] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // the address may already have an account: said without saying so, with the two ways on
  const [mayHaveAccount, setMayHaveAccount] = useState(false);

  const steps: FlowStep[] = [
    {
      key: 'name',
      question: t('guide.register.name.question'),
      says: t('guide.register.name.says'),
      check: () => {
        const checked = checkUsername(username);
        return checked.ok ? null : t(checked.message, USERNAME_RULE_VARS);
      },
      render: (tools) => (
        <GuideField
          tools={tools}
          value={username}
          onChangeText={setUsername}
          label={t('auth.username')}
          complete="username"
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
      question: t('guide.register.terms.question', { name: cleanUsername(username.normalize('NFC')) }),
      says: t('guide.register.terms.says'),
      action: t('auth.register.submit'),
      render: () => (
        <AnswerSummary
          rows={[
            { label: t('auth.username'), value: cleanUsername(username.normalize('NFC')) },
            { label: t('auth.email'), value: cleanEmail(email) },
          ]}
        />
      ),
      // the rules and the privacy policy, each a link, before an account exists
      footer: <AgreeLine style={styles.terms} />,
      commit: async () => {
        // the age and the month are answered on their own steps; this is only for the types
        if (age === null) return { ok: false, error: t('guide.register.age.required'), at: 'age' };
        if (month === null) return { ok: false, error: t('guide.register.month.required'), at: 'month' };
        setMayHaveAccount(false);
        const error = await register({
          email: cleanEmail(email),
          username: cleanUsername(username.normalize('NFC')),
          password,
          // the language chosen in the intro is the account's from the first
          // moment, so the confirmation email and a later sign-in on the web
          // already speak it
          locale,
          birthYear: birthYearFrom(age, month),
          birthMonth: month,
        });
        if (!error) return { ok: true };
        // under 13 no account was made: the explanation replaces the flow (the
        // app root shows it), and stays for as long as the app is open
        if (error.code === 'UNDER_MINIMUM_AGE') {
          void stopForAge('refused');
          return { ok: false, error: null };
        }
        if (error.code === 'REGISTRATION_FAILED') {
          setMayHaveAccount(true);
          return { ok: false, error: null };
        }
        // a password found in a data leak is about the password, so it is said on its step
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
      <Text style={[styles.noticeText, { color: colors.textPrimary }]}>{t('error.code.registrationFailed')}</Text>
      <View style={styles.noticeActions}>
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

  // on success the app root replaces the sign-in screens with the verify-email gate: nothing to do here
  return <StepFlow steps={steps} onFinish={() => undefined} onExit={navigation.canGoBack() ? () => navigation.goBack() : undefined} notice={notice} testID="register-flow" />;
}

const styles = StyleSheet.create({
  /*
   * Not the red line a refused answer gets: nothing was done wrong, the address
   * may simply have an account already, and the answer is a way forward.
   */
  notice: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.md, marginBottom: spacing.md },
  noticeText: { fontSize: typography.sizes.sm, lineHeight: 21 },
  noticeActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  noticeAction: { flexGrow: 1 },
  terms: { marginTop: spacing.lg },
});
