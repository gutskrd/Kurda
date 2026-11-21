import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { UNCONFIRMED_SIGNUP_DAYS } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../../a11y/a11y';
import { useAuth } from '../../auth/AuthContext';
import { CodeBoxes } from '../../auth/guide/CodeBoxes';
import { GuideField } from '../../auth/guide/GuideField';
import { StepFlow, type FlowStep } from '../../auth/guide/StepFlow';
import { WaysOut } from '../../auth/guide/WaysOut';
import { useConfirmDelete } from '../../auth/useConfirmDelete';
import { FIELD_ERROR_COPY, FIELD_ERROR_VARS, cleanEmail, validateEmail } from '../../auth/validators';
import { haptic } from '../../feedback/haptics';
import { useI18n } from '../../i18n/I18nContext';
import { useDirection } from '../../reports/direction';
import { Icon } from '../../theme/Icon';
import { PressableScale, heldDim } from '../../theme/MotionParts';
import { Pressable } from '../../theme/Pressable';
import { useTheme } from '../../theme/ThemeProvider';
import { radii, spacing, typography } from '../../theme/tokens';

const CODE_LENGTH = 6;
/** The server allows 4 resends an hour per user; this keeps taps well under that. */
const RESEND_COOLDOWN_SEC = 45;

/**
 * Blocks the app until the user enters the 6-digit code emailed at sign-up; on success `emailVerified` flips and
 * the navigation root moves on. Asked as a StepFlow step like the rest of sign-up. The code sends as the last digit
 * lands, and a wrong one shakes and shows its error.
 *
 * The address is shown as typed so a typo can be caught, and tapping it changes the address while keeping the
 * account. Below sit resend, how long things last, and two ways out; deletion is offered because the account
 * already exists.
 */
export function VerifyEmailScreen(): React.JSX.Element {
  const { user, verifyEmailCode, resendVerificationCode, changePendingEmail, logout } = useAuth();
  const confirmDelete = useConfirmDelete();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [code, setCode] = useState('');
  // The code as it stands right now: the last digit sends it before state has re-rendered.
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
      // On success the gate lifts by itself; a wrong code is retyped from the first box.
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
            {/* Wraps rather than truncates, since the end of the address is what people check. */}
            <Text style={[styles.addressText, { color: colors.textPrimary }]} numberOfLines={2}>
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
        {/*
          The whole sentence is the resend button, at least a fingertip tall; the bold words alone were a 22-point target.
          It stays pressed while waiting and is only disabled, since a lost press would take its reach with it and a reach
          returning later is cut off at the footer's edge.
        */}
        <Pressable
          onPress={() => void onResend()}
          disabled={cooldown > 0}
          accessibilityRole="button"
          accessibilityLabel={cooldown > 0 ? t('auth.verify.sendNewIn', { seconds: cooldown }) : t('auth.verify.sendNew')}
          accessibilityState={{ disabled: cooldown > 0 }}
          style={({ pressed }) => [styles.resendTarget, pressed && heldDim]}
          testID="resend"
        >
          <Text style={[styles.resend, dir.text, { color: colors.textSecondary }]}>
            {t('auth.verify.didntGetIt')}{' '}
            <Text style={[styles.resendLink, { color: cooldown > 0 ? colors.textSecondary : colors.textPrimary }]}>
              {cooldown > 0 ? t('auth.verify.sendNewIn', { seconds: cooldown }) : t('auth.verify.sendNew')}
            </Text>
            .
          </Text>
        </Pressable>
        {/* How long each thing lasts, once and small. */}
        <Text style={[styles.small, dir.text, { color: colors.textSecondary }]}>
          {t('auth.verify.expiresIn15')} {t('auth.verify.keptFor', { days: UNCONFIRMED_SIGNUP_DAYS })}
        </Text>
        {/* The two ways out, side by side and quiet. */}
        <WaysOut
          ways={[
            { label: t('auth.verify.startOver'), onPress: () => void logout() },
            { label: t('settings.delete.title'), onPress: confirmDelete, danger: true, testID: 'delete-account' },
          ]}
        />
      </View>
    ),
  };

  const addressStep: FlowStep = {
    key: 'address',
    question: t('guide.email.question'),
    says: t('guide.verify.changeSays'),
    action: t('auth.verify.sendThere'),
    check: () => {
      // Checked as sign-up checks an address, so a second typo is caught before another code is sent.
      const why = validateEmail(address);
      return why ? t(FIELD_ERROR_COPY[why], FIELD_ERROR_VARS) : null;
    },
    commit: async () => {
      const err = await changePendingEmail(cleanEmail(address));
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
      // The address is fixed: back to the code, now on its way there.
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
  lead: { fontSize: typography.sizes.text, lineHeight: 22, marginTop: -spacing.sm },
  address: {
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    maxWidth: '100%',
  },
  addressText: { flexShrink: 1, fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  footer: { marginTop: spacing.lg, gap: spacing.sm },
  notice: { fontSize: typography.sizes.text, lineHeight: 20 },
  resendTarget: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  resend: { fontSize: typography.sizes.text, lineHeight: 22 },
  resendLink: { fontWeight: typography.weights.semibold },
  small: { fontSize: typography.sizes.text, lineHeight: 18 },
});
