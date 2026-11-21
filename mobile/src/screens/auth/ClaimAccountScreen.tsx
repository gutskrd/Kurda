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
import { checkUsername } from '../../username/validate';
import { UsernameStepField } from '../../username/UsernameStepField';
import { LinkText } from './AuthForm';
import { AppleButton, GoogleButton, ProviderNote, useSocialSignIn } from './SocialSignIn';
import { useI18n } from '../../i18n/I18nContext';
import { AgreeLine } from '../../legal/links';
import { useDirection } from '../../reports/direction';

/**
 * A guest claiming their account: the sign-up steps (RegisterScreen) over the app, posting `claimAccount`, so the
 * same account and its progress gain an email, password and birth month. The name step starts with the guest's
 * generated name and sends it only if changed.
 *
 * On success the app root swaps in the verify-email gate, which removes this screen; if an account ever comes back
 * already verified, the effect below closes the flow. Where Apple or Google is offered, the flow opens on that
 * choice (SocialSignIn), which also claims the guest account (api/src/auth/oauth.ts).
 *
 * Refusals match sign-up's. Under 13 the account cannot be claimed and the guest cannot keep using it either, so
 * the session ends and the explanation takes over.
 */
export function ClaimAccountScreen({
  onExit,
  onSignIn,
  onForgotPassword,
  presented = false,
}: {
  onExit: () => void;
  /** Opened over the app (✕ on the first step) rather than pushed within a flow. */
  presented?: boolean;
  /** "I already have an account": the sign-in flow, which replaces the guest session. */
  onSignIn: (email?: string) => void;
  onForgotPassword: (email: string) => void;
}): React.JSX.Element {
  const { user, claimAccount, stopForAge, logout } = useAuth();
  const { colors } = useTheme();
  const dir = useDirection();
  const { t, locale } = useI18n();
  const [username, setUsername] = useState(user?.username ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Unset until the ruler moves, so an age is never chosen for someone who only taps on.
  const [age, setAge] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [mayHaveAccount, setMayHaveAccount] = useState(false);
  // Apple's button where available, and both sign-in sheets, as on the sign-in screen.
  const { appleAvailable, onApple, onGoogle } = useSocialSignIn();
  // Every iOS version the app supports has Sign in with Apple, so this is known before Apple answers.
  const offersProvider = Platform.OS === 'ios' || isGoogleConfigured;
  const haveAccount = <LinkText label={t('welcome.haveAccount')} onPress={() => onSignIn()} />;

  // Claimed and already verified, or signed in to another account meanwhile.
  const claimed = user !== null && user.guest !== true;
  // The route passes a new `onExit` on every render, and it must close only once.
  const closed = useRef(false);
  useEffect(() => {
    if (!claimed || closed.current) return;
    closed.current = true;
    onExit();
  }, [claimed, onExit]);

  // The name normalised by the rule (lowercase, trimmed); the step only continues once it passes.
  const named = checkUsername(username);
  const chosenName = named.ok ? named.value : username.trim();

  const method: FlowStep = {
    key: 'method',
    question: t('guide.claim.method.question'),
    says: t('guide.claim.method.says'),
    // The flow's own button continues with email; the provider buttons sign in directly.
    action: t('welcome.email'),
    render: () => (
      <View style={styles.methods}>
        {appleAvailable ? <AppleButton onPress={() => void onApple()} /> : null}
        {isGoogleConfigured ? <GoogleButton onPress={() => void onGoogle()} /> : null}
        {appleAvailable || isGoogleConfigured ? <ProviderNote /> : null}
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
      // The way to an existing account sits on the first step, whichever that is.
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
      // Terms and privacy links: agreed as a guest, and again as the account's owner.
      footer: <AgreeLine style={styles.terms} />,
      commit: async () => {
        if (age === null) return { ok: false, error: t('guide.register.age.required'), at: 'age' };
        if (month === null) return { ok: false, error: t('guide.register.month.required'), at: 'month' };
        setMayHaveAccount(false);
        const error = await claimAccount({
          email: cleanEmail(email),
          // Keeping the generated name is not a change to send.
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
      <Text style={[styles.noticeText, dir.text, { color: colors.textPrimary }]}>{t('error.code.registrationFailed')}</Text>
      {/* The two ways on, the first on the side the language starts from. */}
      <View style={[styles.noticeActions, { flexDirection: dir.row }]}>
        <ClayButton label={t('auth.login.submit')} tone="primary" onPress={() => onSignIn(cleanEmail(email))} style={styles.noticeAction} />
        <ClayButton label={t('auth.reset.title')} variant="outline" tone="primary" onPress={() => onForgotPassword(cleanEmail(email))} style={styles.noticeAction} />
      </View>
    </View>
  ) : null;

  return <StepFlow steps={steps} onFinish={() => undefined} onExit={onExit} presented={presented} notice={notice} testID="claim-flow" />;
}

const styles = StyleSheet.create({
  methods: { gap: spacing.md },
  // The sign-up notice's calm panel (RegisterScreen.tsx).
  notice: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.md, marginBottom: spacing.md },
  noticeText: { fontSize: typography.sizes.text, lineHeight: 21 },
  noticeActions: { flexWrap: 'wrap', gap: spacing.sm },
  noticeAction: { flexGrow: 1 },
  terms: { marginTop: spacing.lg },
});
