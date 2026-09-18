import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { radii, spacing, typography } from '../theme/tokens';
import { ClayButton, GlassCard, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { checkUsername, USERNAME_MAX, USERNAME_RULE_VARS } from './validate';
import { useI18n } from '../i18n/I18nContext';

/**
 * Change username (KUR-004). Shows the current name, validates the new one live
 * (structural rules) for instant feedback, and submits to PATCH /me — the server
 * is the authority for availability, reserved names, and the 30-day cooldown, whose
 * messages are shown verbatim (they're already user-facing).
 */
export function ChangeUsernameScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const topInset = useScreenTopInset();

  const [current, setCurrent] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    void client.get<{ user: { username: string } }>('/me').then((r) => {
      if (r.ok) setCurrent(r.data.user.username);
    });
  }, [client]);

  const check = checkUsername(input);
  const touched = input.trim().length > 0;
  const changed = check.ok && current != null && check.value.toLowerCase() !== current.toLowerCase();
  const canSubmit = check.ok && changed && !saving;

  const submit = useCallback(async () => {
    if (!check.ok || saving) return;
    setSaving(true);
    setServerError(null);
    const res = await client.patch<{ user: { username: string } }>('/me', { username: check.value });
    setSaving(false);
    if (res.ok) {
      setDone(true);
      setTimeout(onExit, 700);
      return;
    }
    // the server's message is already user-facing (taken / reserved / cooldown date)
    setServerError(res.error.message ?? t('username.updateFailed'));
  }, [check, saving, client, onExit]);

  // inline hint under the field: a client rule, a server error, or an all-clear
  const hint: { text: string; tone: 'error' | 'ok' } | null = serverError
    ? { text: serverError, tone: 'error' }
    : !touched
      ? null
      : !check.ok
        ? { text: t(check.message, USERNAME_RULE_VARS), tone: 'error' }
        : !changed
          ? { text: t('username.alreadyYours'), tone: 'error' }
          : { text: t('username.looksGood'), tone: 'ok' };

  return (
    <GradientBackground>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={topInset}>
        <ScreenHeader title={t('auth.username')} onBack={onExit} />
        <View style={styles.screen}>

          <GlassCard style={styles.card}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('username.current')}</Text>
            <Text style={[styles.current, { color: colors.textPrimary }]}>{current ?? '…'}</Text>

            <Text style={[styles.label, { color: colors.textSecondary, marginTop: spacing.md }]}>{t('username.new')}</Text>
            <View
              style={[
                styles.inputWrap,
                { backgroundColor: colors.controlTrack, borderColor: hint?.tone === 'error' ? colors.danger : colors.glassBorder },
              ]}
            >
              <Text style={[styles.at, { color: colors.textSecondary }]}>@</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary }]}
                value={input}
                onChangeText={(t) => {
                  setInput(t);
                  setServerError(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={USERNAME_MAX}
                placeholder="new_username"
                placeholderTextColor={colors.textSecondary}
                editable={!saving && !done}
              />
              {check.ok && changed && !serverError ? <Icon name="check" size={18} color={colors.success} /> : null}
            </View>

            {hint ? (
              <Text style={[styles.hint, { color: hint.tone === 'error' ? colors.danger : colors.success }]}>{hint.text}</Text>
            ) : (
              <Text style={[styles.hint, { color: colors.textSecondary }]}>
                {t('username.rules', { max: USERNAME_MAX })}
              </Text>
            )}
          </GlassCard>

          <ClayButton
            label={done ? t('username.saved') : saving ? t('username.saving') : t('username.save')}
            tone="primary"
            onPress={submit}
            style={[styles.save, !canSubmit && !done && styles.saveDisabled]}
          />
          {saving ? <ActivityIndicator color={colors.primary} style={styles.spinner} /> : null}
        </View>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, paddingHorizontal: spacing.lg },

  card: { gap: spacing.xs },
  label: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, textTransform: 'uppercase', letterSpacing: 0.6 },
  current: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginTop: spacing.xs },
  at: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  input: { flex: 1, fontSize: typography.sizes.md },
  hint: { fontSize: typography.sizes.sm, marginTop: spacing.sm },
  save: { marginTop: spacing.lg },
  saveDisabled: { opacity: 0.4 },
  spinner: { marginTop: spacing.md },
});
