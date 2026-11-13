import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, typography } from '../../theme/tokens';
import { ClayButton } from '../../theme/glass';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuth } from '../../auth/AuthContext';
import { isGoogleConfigured } from '../../auth/google';
import { FIELD_ERROR_COPY, FIELD_ERROR_VARS, cleanEmail, validateEmail, validatePassword } from '../../auth/validators';
import { StepFlow, type FlowStep } from '../../auth/guide/StepFlow';
import { GuideField } from '../../auth/guide/GuideField';
import { AgeRuler } from '../../auth/guide/AgeRuler';
import { MonthChips } from '../../auth/guide/MonthChips';
import { PasswordStrengthMeter } from '../../auth/guide/PasswordStrength';
import { AnswerSummary } from '../../auth/guide/AnswerSummary';
import { birthYearFrom } from '../../auth/guide/age';
import { USERNAME_RULE_VARS, checkUsername, cleanUsername } from '../../username/validate';
import { LinkText } from './AuthForm';
import { AppleButton, GoogleButton, useSocialSignIn } from './SocialSignIn';
import { useI18n } from '../../i18n/I18nContext';
import { AgreeLine } from '../../legal/links';

/**
 * A guest making the account their own, one question at a time.
 *
 * The sign-up steps (RegisterScreen), over the app, posting through
 * `claimAccount` instead of `register`: the same account, with everything
 * learned on it, gets an email, a password and a birth month. The name comes
 * first, filled in with the one the guest was given, so Continue keeps it
 * with no typing; it is sent only when it changed. Hevalo cheers at the end.
 *
 * On success the screen does nothing of its own. The server answers with the
 * account unverified and a code on its way, and the app's root replaces the
 * whole signed-in tree with the verify-email gate — this screen is gone with
 * it. Should an account ever come back already verified, the effect below
 * closes the flow, so a finished claim never leaves it standing.
 *
 * Where the phone offers Apple or Google, the flow opens on the choice the
 * sign-in screen gives (SocialSignIn): either one makes this same account
 * the guest's, keeping what was learned (the server claims the guest on a
 * provider sign-in, api/src/auth/oauth.ts), and Continue with email goes on
 * to the questions below. The birth month a provider does not give is asked
 * for afterwards, as after any sign-up through one.
 *
 * Refusals are the sign-up's: an address that may already have an account
 * gets the calm notice with Sign in and Reset password; a leaked password is
 * said on the password step; under 13 the account cannot be claimed, and
 * since a guest that age may not keep learning on it either, the session
 * ends and the explanation takes the screen, as a refused sign-up's does.
 */
export function ClaimAccountScreen({
  onExit,
  onSignIn,
  onForgotPassword,
}: {
  onExit: () => void;
  /** "I already have an account": the sign-in flow, which replaces the guest session */
  onSignIn: (email?: string) => void;
  onForgotPassword: (email: string) => void;
}): React.JSX.Element {
  const { user, claimAccount, stopForAge, logout } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const [username, setUsername] = useState(user?.username ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // unchosen until the ruler is moved, as on the sign-up: an age set for them would be the answer of whoever only taps on
  const [age, setAge] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [mayHaveAccount, setMayHaveAccount] = useState(false);
  // Apple's button where the phone has it, and both sheets with their answers, as on the sign-in screen
  const { appleAvailable, onApple, onGoogle } = useSocialSignIn();
  // every iOS the app runs on has Sign in with Apple, so the choice is known before Apple's own answer arrives
  const offersProvider = Platform.OS === 'ios' || isGoogleConfigured;
  const haveAccount = <LinkText label={t('welcome.haveAccount')} onPress={() => onSignIn()} />;

  // a claim that came back already verified, or an account signed in to meanwhile: the flow has nothing left to do
  const claimed = user !== null && user.guest !== true;
  // once: the route hands a fresh `onExit` on every render, and closing is not a thing to do twice
  const closed = useRef(false);
  useEffect(() => {
    if (!claimed || closed.current) return;
    closed.current = true;
    onExit();
  }, [claimed, onExit]);

  const chosenName = cleanUsername(username.normalize('NFC'));

  const method: FlowStep = {
    key: 'method',
    question: t('guide.claim.method.question'),
    says: t('guide.claim.method.says'),
    // the flow's own button goes on with the email questions; the provider buttons sign in as they are pressed
    action: t('welcome.email'),
    render: () => (
      <View style={styles.methods}>
        {appleAvailable ? <AppleButton onPress={() => void onApple()} /> : null}
        {isGoogleConfigured ? <GoogleButton onPress={() => void onGoogle()} /> : null}
      </View>
    ),
    footer: haveAccount,
  };

  const steps: FlowStep[] = [
    ...(offersProvider ? [method] : []),
    {
      key: 'name',
      question: t('guide.claim.name.question'),
      says: t('guide.claim.name.says', { name: user?.username ?? '' }),
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
      // the way to an account they already have sits on the first step, whichever that is
      footer: offersProvider ? undefined : haveAccount,
    },
    {
      key: 'email',
      question: t('guide.email.question'),
      says: t('guide.claim.email.says'),
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
      says: t('guide.claim.password.says'),
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
      key: 'age',
      question: t('guide.register.age.question'),
      says: t('guide.claim.age.says'),
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
      key: 'terms',
      question: t('guide.claim.terms.question'),
      says: t('guide.claim.terms.says'),
      action: t('guest.createAccount'),
      render: () => (
        <AnswerSummary
          rows={[
            { label: t('auth.username'), value: chosenName },
            { label: t('auth.email'), value: cleanEmail(email) },
          ]}
        />
      ),
      // the rules and the privacy policy, each a link: the guest agreed as a guest, and agrees again as the account's owner
      footer: <AgreeLine style={styles.terms} />,
      commit: async () => {
        if (age === null) return { ok: false, error: t('guide.register.age.required'), at: 'age' };
        if (month === null) return { ok: false, error: t('guide.register.month.required'), at: 'month' };
        setMayHaveAccount(false);
        const error = await claimAccount({
          email: cleanEmail(email),
          // the generated name kept is not a change to send
          ...(chosenName !== user?.username ? { username: chosenName } : {}),
          password,
          locale,
          birthYear: birthYearFrom(age, month),
          birthMonth: month,
        });
        if (!error) return { ok: true };
        if (error.code === 'UNDER_MINIMUM_AGE') {
          await logout();
          void stopForAge('refused');
          return { ok: false, error: null };
        }
        if (error.code === 'REGISTRATION_FAILED') {
          setMayHaveAccount(true);
          return { ok: false, error: null };
        }
        if (error.code === 'PASSWORD_BREACHED') return { ok: false, error: error.message, at: 'password' };
        if (error.code === 'USERNAME_TAKEN' || error.code === 'INVALID_USERNAME') {
          return { ok: false, error: error.message, at: 'name', says: t('guide.register.name.taken') };
        }
        return { ok: false, error: error.message };
      },
    },
  ];

  const notice = mayHaveAccount ? (
    <View style={[styles.notice, { backgroundColor: colors.controlTrack }]} accessibilityLiveRegion="polite" testID="claim-may-have-account">
      <Text style={[styles.noticeText, { color: colors.textPrimary }]}>{t('error.code.registrationFailed')}</Text>
      <View style={styles.noticeActions}>
        <ClayButton label={t('auth.login.submit')} tone="primary" onPress={() => onSignIn(cleanEmail(email))} style={styles.noticeAction} />
        <ClayButton label={t('auth.reset.title')} variant="outline" tone="primary" onPress={() => onForgotPassword(cleanEmail(email))} style={styles.noticeAction} />
      </View>
    </View>
  ) : null;

  return <StepFlow steps={steps} onFinish={() => undefined} onExit={onExit} notice={notice} testID="claim-flow" />;
}

const styles = StyleSheet.create({
  methods: { gap: spacing.md },
  // the sign-up notice's calm panel (RegisterScreen.tsx): a pause, not a mistake
  notice: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.md, marginBottom: spacing.md },
  noticeText: { fontSize: typography.sizes.sm, lineHeight: 21 },
  noticeActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  noticeAction: { flexGrow: 1 },
  terms: { marginTop: spacing.lg },
});
