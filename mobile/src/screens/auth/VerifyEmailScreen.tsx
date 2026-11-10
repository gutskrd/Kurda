import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { UNCONFIRMED_SIGNUP_DAYS } from '@kurda/shared';
import { useAuth } from '../../auth/AuthContext';
import { useConfirmDelete } from '../../auth/useConfirmDelete';
import { useTheme } from '../../theme/ThemeProvider';
import { radii, spacing, typography } from '../../theme/tokens';
import { MIN_TOUCH_TARGET } from '../../a11y/a11y';
import { AuthScreenShell, FormError, SubmitButton } from './AuthForm';
import { useI18n } from '../../i18n/I18nContext';

/** The server issues six digits; the sentence says so, so it comes from here. */
const CODE_LENGTH = 6;

const RESEND_COOLDOWN_SEC = 45;

/**
 * Email-ownership gate (KUR-014). Shown after sign-up (and on login for an
 * account that never verified) until the user enters the 6-digit code emailed
 * to them. Verifying flips `emailVerified` in the session, which lets the app
 * root fall through to the signed-in experience.
 */
export function VerifyEmailScreen() {
  const { user, verifyEmailCode, resendVerificationCode, changePendingEmail, logout } = useAuth();
  const confirmDelete = useConfirmDelete();
  const { colors } = useTheme();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  // putting a mistyped address right: the field is there only once it is asked for
  const [changing, setChanging] = useState(false);
  const [address, setAddress] = useState('');

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const onVerify = async () => {
    if (code.length !== CODE_LENGTH) {
      setError(t('auth.verify.enterCode6'));
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    const err = await verifyEmailCode(code);
    setBusy(false);
    // on success the gate lifts automatically (emailVerified flips)
    if (err) setError(err);
  };

  const onResend = async () => {
    if (cooldown > 0) return;
    setError(null);
    setNotice(null);
    const err = await resendVerificationCode();
    if (err) {
      setError(err);
      return;
    }
    setNotice(t('auth.verify.sentNew'));
    setCooldown(RESEND_COOLDOWN_SEC);
  };

  const onChangeAddress = async () => {
    const next = address.trim();
    if (!next || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const err = await changePendingEmail(next);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    // the code typed so far was for the old address
    setCode('');
    setAddress('');
    setChanging(false);
    setNotice(t('auth.verify.changed'));
    setCooldown(RESEND_COOLDOWN_SEC);
  };

  return (
    <AuthScreenShell title={t('auth.verify.title')} hero="mail">
      {/*
        Two whole sentences, not one built around the address. The address is a
        value; the sentence around it moves word by word between languages, and
        this one slipped every gate precisely because the `{email}` in the
        middle left the JSX text with no closing tag to match against.
      */}
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {t('auth.verify.enterCode', { digits: CODE_LENGTH })}
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('auth.verify.expiresIn15')}</Text>
      {/*
        The address on its own line, not inside a sentence. The browser does not
        show it at all, but this is the screen you land on straight after typing
        it, and a typo is only ever caught by seeing it back. A value beside the
        sentences translates; a value inside one does not.
      */}
      {user?.email ? (
        <Text style={[styles.address, { color: colors.textPrimary }]}>{user.email}</Text>
      ) : null}
      {/*
        A mistyped address is the commonest reason a code never comes, and it
        is seen here, under the address itself. It is put right in place: the
        account, its name and its password stay, and the code goes to the new
        address. Starting over used to be the only way, and found the username
        taken by the sign-up just left behind.
      */}
      {changing ? (
        <View style={styles.change}>
          <TextInput
            style={[styles.addressInput, { backgroundColor: colors.controlTrack, color: colors.textPrimary }]}
            value={address}
            onChangeText={setAddress}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="send"
            onSubmitEditing={() => void onChangeAddress()}
            placeholder={t('auth.verify.newAddress')}
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel={t('auth.verify.newAddress')}
            testID="new-address"
          />
          <SubmitButton label={t('auth.verify.sendThere')} busy={busy} onPress={() => void onChangeAddress()} />
          <Pressable
            onPress={() => {
              setChanging(false);
              setAddress('');
              setError(null);
            }}
            accessibilityRole="button"
            style={styles.action}
          >
            <Text style={[styles.link, styles.centred, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => setChanging(true)} accessibilityRole="button" style={styles.action} testID="change-address">
          <Text style={[styles.link, { color: colors.primary }]}>{`${t('auth.verify.wrongAddress')} ${t('auth.verify.change')}`}</Text>
        </Pressable>
      )}

      <FormError message={error} />
      {notice ? <Text style={[styles.notice, { color: colors.success }]}>{notice}</Text> : null}

      {/* one thing at a time: while the address is being put right, the code for the old one is not asked for */}
      {changing ? null : (
        <>
          <TextInput
            style={[
              styles.codeInput,
              { backgroundColor: colors.controlTrack, borderColor: error ? colors.danger : colors.glassBorder, color: colors.textPrimary },
            ]}
            value={code}
            // `v`, not `t`: the translator is in scope, and shadowing it is a bug
            // this codebase has already had to fix more than once
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, CODE_LENGTH))}
            keyboardType="number-pad"
            maxLength={CODE_LENGTH}
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            placeholder="000000"
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel={t('auth.verify.codeLabel')}
            testID="code"
          />

          <SubmitButton label={t('auth.verify.submit')} busy={busy} onPress={onVerify} />
        </>
      )}

      <View style={styles.actions}>
        <Pressable onPress={onResend} disabled={cooldown > 0} accessibilityRole="button" style={styles.action}>
          <Text style={[styles.link, { color: cooldown > 0 ? colors.textSecondary : colors.primary }]}>
            {cooldown > 0 ? t('auth.verify.sendNewIn', { seconds: cooldown }) : t('auth.verify.sendNew')}
          </Text>
        </Pressable>
        <Pressable onPress={() => void logout()} accessibilityRole="button" style={styles.action}>
          <Text style={[styles.link, { color: colors.textSecondary }]}>{t('auth.verify.startOver')}</Text>
        </Pressable>
        {/* how long this can wait, said once and plainly, where the ways out are */}
        <Text style={[styles.kept, { color: colors.textSecondary }]}>{t('auth.verify.keptFor', { days: UNCONFIRMED_SIGNUP_DAYS })}</Text>
        {/* the account exists already, code or no code: it can be deleted from here, not only signed out of */}
        <Pressable onPress={confirmDelete} accessibilityRole="button" style={styles.action} testID="delete-account">
          <Text style={[styles.link, { color: colors.danger }]}>{t('settings.delete.title')}</Text>
        </Pressable>
      </View>
    </AuthScreenShell>
  );
}

const styles = StyleSheet.create({
  address: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, textAlign: 'center', marginBottom: spacing.sm },
  subtitle: { fontSize: typography.sizes.sm, marginBottom: spacing.md, textAlign: 'center' },
  notice: { fontSize: typography.sizes.sm, marginBottom: spacing.sm, textAlign: 'center' },
  change: { gap: spacing.sm, marginBottom: spacing.md },
  addressInput: {
    borderRadius: radii.md,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    fontSize: typography.sizes.md,
  },
  kept: { fontSize: typography.sizes.xs, textAlign: 'center', marginTop: spacing.sm },
  codeInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    fontSize: typography.sizes.xxl,
    textAlign: 'center',
    letterSpacing: 8,
    fontWeight: typography.weights.bold,
    marginBottom: spacing.sm,
  },
  actions: { marginTop: spacing.sm, alignItems: 'center' },
  // the 44pt rows carry their own separation; a gap on top of them is too much
  action: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.sm },
  link: { fontSize: typography.sizes.sm, fontWeight: typography.weights.medium },
  centred: { textAlign: 'center' },
});
