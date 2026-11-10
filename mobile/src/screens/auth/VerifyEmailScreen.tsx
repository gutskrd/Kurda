import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { UNCONFIRMED_SIGNUP_DAYS } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../../a11y/a11y';
import { useAuth } from '../../auth/AuthContext';
import { CodeBoxes } from '../../auth/guide/CodeBoxes';
import { GuideField } from '../../auth/guide/GuideField';
import { StepFlow, type FlowStep } from '../../auth/guide/StepFlow';
import { useConfirmDelete } from '../../auth/useConfirmDelete';
import { FIELD_ERROR_COPY, FIELD_ERROR_VARS, validateEmail } from '../../auth/validators';
import { haptic } from '../../feedback/haptics';
import { useI18n } from '../../i18n/I18nContext';
import { useDirection } from '../../reports/direction';
import { Icon } from '../../theme/Icon';
import { PressableScale } from '../../theme/MotionParts';
import { useTheme } from '../../theme/ThemeProvider';
import { radii, spacing, typography } from '../../theme/tokens';

const CODE_LENGTH = 6;
/** Server allows 4 resends/hour per user — keep taps well under that (KUR-014). */
const RESEND_COOLDOWN_SEC = 45;

/**
 * Blocks the app until the signed-in user proves they own their email by
 * entering the 6-digit code we emailed at signup (KUR-014). On success the
 * auth context flips `emailVerified`, which makes the navigation root fall
 * through to the signed-in experience.
 *
 * It is the last question of signing up, so it is asked the way the others
 * were (auth/guide/StepFlow): Hevalo says what has happened, the question is
 * the heading, and there is one thing to do under it. It used to be a card of
 * its own, a glyph over a grey field and five links in a column, and read as
 * a different app from the questions that led to it.
 *
 * The code is typed a digit to a box and sent as the last one lands; the
 * button is there for whoever would rather press it. A wrong code shakes, is
 * said under the boxes, and gets Hevalo's tilt of the head.
 *
 * The address the code went to is shown as it was typed, because a typo is
 * only ever caught by seeing it back, and it is a button: tapping it turns
 * the question into "what's your email?", the code goes to the new address,
 * and the way back is the chevron. The account, its name and its password
 * stay. Starting over used to be the only way, and found the username taken
 * by the sign-up just left behind.
 *
 * Under the boxes, quietly: the way to another code, how long everything
 * lasts, and the two ways out. Deleting is offered here because the account
 * exists already, code or no code.
 */
export function VerifyEmailScreen(): React.JSX.Element {
  const { user, verifyEmailCode, resendVerificationCode, changePendingEmail, logout } = useAuth();
  const confirmDelete = useConfirmDelete();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [code, setCode] = useState('');
  // the code as it stands this instant: the last digit sends it before the state has been drawn
  const typed = useRef('');
  const [changing, setChanging] = useState(false);
  const [address, setAddress] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const tick = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(tick);
  }, [cooldown]);

  const setTyped = (next: string): void => {
    typed.current = next;
    setCode(next);
  };

  const onResend = async (): Promise<void> => {
    if (cooldown > 0) return;
    setNotice(null);
    setResendError(null);
    const err = await resendVerificationCode();
    if (err) {
      setResendError(err);
      return;
    }
    haptic('select');
    setNotice(t('auth.verify.sentNew'));
    setCooldown(RESEND_COOLDOWN_SEC);
  };

  const codeStep: FlowStep = {
    key: 'code',
    question: t('auth.verify.title'),
    says: t('guide.verify.says'),
    action: t('auth.verify.submit'),
    check: () => (typed.current.length === CODE_LENGTH ? null : t('auth.verify.enterCode6')),
    commit: async () => {
      setNotice(null);
      setResendError(null);
      const err = await verifyEmailCode(typed.current);
      // on success the gate lifts by itself (emailVerified flips); a code that was not right is typed again from the first box
      if (err) setTyped('');
      return err ? { ok: false, error: err } : { ok: true };
    },
    render: (tools) => (
      <View style={styles.step}>
        <Text style={[styles.lead, dir.text, { color: colors.textSecondary }]}>{t('auth.verify.enterCode', { digits: CODE_LENGTH })}</Text>
        {user?.email ? (
          <PressableScale
            onPress={() => {
              setNotice(null);
              setResendError(null);
              setAddress('');
              setChanging(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${user.email}. ${t('auth.verify.wrongAddress')} ${t('auth.verify.change')}`}
            style={[styles.address, { backgroundColor: colors.controlTrack, flexDirection: dir.row, alignSelf: dir.row === 'row-reverse' ? 'flex-end' : 'flex-start' }]}
            testID="change-address"
          >
            <Text style={[styles.addressText, { color: colors.textPrimary }]} numberOfLines={1}>
              {user.email}
            </Text>
            <Icon name="pencil" size={16} color={colors.textSecondary} />
          </PressableScale>
        ) : null}
        <CodeBoxes
          value={code}
          length={CODE_LENGTH}
          label={t('auth.verify.codeLabel')}
          refused={tools.error !== null}
          busy={tools.busy}
          onChange={(next) => {
            setTyped(next);
            tools.edited();
          }}
          onComplete={() => tools.submit()}
        />
      </View>
    ),
    footer: (
      <View style={styles.footer}>
        {notice ? (
          <Text style={[styles.notice, dir.text, { color: colors.success }]} accessibilityLiveRegion="polite">
            {notice}
          </Text>
        ) : null}
        {resendError ? (
          <Text style={[styles.notice, dir.text, { color: colors.danger }]} accessibilityLiveRegion="polite">
            {resendError}
          </Text>
        ) : null}
        {/* one sentence, the way it is said: "Didn't get it? Check your spam folder, then send a new code" */}
        <Text style={[styles.resend, dir.text, { color: colors.textSecondary }]}>
          {t('auth.verify.didntGetIt')}{' '}
          <Text
            onPress={cooldown > 0 ? undefined : () => void onResend()}
            accessibilityRole="button"
            accessibilityState={{ disabled: cooldown > 0 }}
            style={[styles.resendLink, { color: cooldown > 0 ? colors.textSecondary : colors.textPrimary }]}
            testID="resend"
          >
            {cooldown > 0 ? t('auth.verify.sendNewIn', { seconds: cooldown }) : t('auth.verify.sendNew')}
          </Text>
          .
        </Text>
        {/* how long each thing lasts, said once and small */}
        <Text style={[styles.small, dir.text, { color: colors.textSecondary }]}>
          {t('auth.verify.expiresIn15')} {t('auth.verify.keptFor', { days: UNCONFIRMED_SIGNUP_DAYS })}
        </Text>
        {/* the two ways out, side by side and quiet: this is not what the screen is for */}
        <View style={[styles.ways, { flexDirection: dir.row }]}>
          <Pressable onPress={() => void logout()} accessibilityRole="button" hitSlop={8} style={styles.way}>
            <Text style={[styles.wayText, { color: colors.textSecondary }]}>{t('auth.verify.startOver')}</Text>
          </Pressable>
          <Pressable onPress={confirmDelete} accessibilityRole="button" hitSlop={8} style={styles.way} testID="delete-account">
            <Text style={[styles.wayText, { color: colors.danger }]}>{t('settings.delete.title')}</Text>
          </Pressable>
        </View>
      </View>
    ),
  };

  const addressStep: FlowStep = {
    key: 'address',
    question: t('guide.email.question'),
    says: t('guide.verify.changeSays'),
    action: t('auth.verify.sendThere'),
    check: () => {
      // checked as sign-up checks an address, so a second typo is caught before another code is sent
      const why = validateEmail(address.trim());
      return why ? t(FIELD_ERROR_COPY[why], FIELD_ERROR_VARS) : null;
    },
    commit: async () => {
      const err = await changePendingEmail(address.trim());
      return err ? { ok: false, error: err } : { ok: true };
    },
    render: (tools) => (
      <GuideField
        tools={tools}
        value={address}
        onChangeText={setAddress}
        label={t('auth.verify.newAddress')}
        keyboardType="email-address"
        complete="email"
        placeholder="you@example.com"
        testID="new-address"
      />
    ),
  };

  return (
    <StepFlow
      steps={[changing ? addressStep : codeStep]}
      progress={false}
      // the address was put right: back to the code, which is now on its way there
      onFinish={() => {
        if (!changing) return;
        setChanging(false);
        setAddress('');
        setTyped('');
        setNotice(t('auth.verify.changed'));
        setCooldown(RESEND_COOLDOWN_SEC);
      }}
      onExit={changing ? () => setChanging(false) : undefined}
      testID="verify-flow"
    />
  );
}

const styles = StyleSheet.create({
  step: { gap: spacing.md },
  lead: { fontSize: typography.sizes.md, lineHeight: 22, marginTop: -spacing.sm },
  address: {
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    maxWidth: '100%',
  },
  addressText: { flexShrink: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  footer: { marginTop: spacing.lg, gap: spacing.sm },
  notice: { fontSize: typography.sizes.sm, lineHeight: 20 },
  resend: { fontSize: typography.sizes.sm, lineHeight: 22 },
  resendLink: { fontWeight: typography.weights.semibold },
  small: { fontSize: typography.sizes.xs, lineHeight: 18 },
  // side by side where they fit; one under the other, close, where a longer language wraps them
  ways: { flexWrap: 'wrap', columnGap: spacing.lg, rowGap: 0, marginTop: spacing.sm },
  way: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  wayText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.medium },
});
