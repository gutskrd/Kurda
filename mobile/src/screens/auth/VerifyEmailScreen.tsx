import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import { useTheme } from '../../theme/ThemeProvider';
import { radii, spacing, typography } from '../../theme/tokens';
import { AuthScreenShell, FormError, SubmitButton } from './AuthForm';

const RESEND_COOLDOWN_SEC = 45;

/**
 * Email-ownership gate (KUR-014). Shown after sign-up (and on login for an
 * account that never verified) until the user enters the 6-digit code emailed
 * to them. Verifying flips `emailVerified` in the session, which lets the app
 * root fall through to the signed-in experience.
 */
export function VerifyEmailScreen() {
  const { user, verifyEmailCode, resendVerificationCode, logout } = useAuth();
  const { colors } = useTheme();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const onVerify = async () => {
    if (code.length !== 6) {
      setError('Enter the 6-digit code from your email');
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
    setNotice('We sent a new code.');
    setCooldown(RESEND_COOLDOWN_SEC);
  };

  return (
    <AuthScreenShell title="Verify your email" hero="mail">
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        We emailed a 6-digit code to {user?.email ?? 'your inbox'}. Enter it below to finish setting up your account.
      </Text>

      <FormError message={error} />
      {notice ? <Text style={[styles.notice, { color: colors.success }]}>{notice}</Text> : null}

      <TextInput
        style={[
          styles.codeInput,
          { backgroundColor: colors.controlTrack, borderColor: error ? colors.danger : colors.glassBorder, color: colors.textPrimary },
        ]}
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        maxLength={6}
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        placeholder="000000"
        placeholderTextColor={colors.textSecondary}
        accessibilityLabel="Verification code"
        testID="code"
      />

      <SubmitButton label="Verify" busy={busy} onPress={onVerify} />

      <View style={styles.actions}>
        <Pressable onPress={onResend} disabled={cooldown > 0} accessibilityRole="button">
          <Text style={[styles.link, { color: cooldown > 0 ? colors.textSecondary : colors.primary }]}>
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </Text>
        </Pressable>
        <Pressable onPress={() => void logout()} accessibilityRole="button">
          <Text style={[styles.link, { color: colors.textSecondary }]}>Wrong email? Sign out</Text>
        </Pressable>
      </View>
    </AuthScreenShell>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: typography.sizes.sm, marginBottom: spacing.md },
  notice: { fontSize: typography.sizes.sm, marginBottom: spacing.sm, textAlign: 'center' },
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
  actions: { marginTop: spacing.lg, gap: spacing.md, alignItems: 'center' },
  link: { fontSize: typography.sizes.sm, fontWeight: typography.weights.medium },
});
