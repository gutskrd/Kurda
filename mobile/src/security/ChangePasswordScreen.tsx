import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, type TextInput } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { FIELD_ERROR_COPY, FIELD_ERROR_VARS, PASSWORD_RULES_KEY, validatePassword } from '../auth/validators';
import { ClayButton, GlassCard, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useScreenBottomInset, useScreenTopInset } from '../navigation/tabBarLayout';
import { useDirection } from '../reports/direction';
import { useI18n } from '../i18n/I18nContext';
import { Field, FormError } from '../screens/auth/AuthForm';
import { changePassword } from './api';

type Errors = { current?: string | null; next?: string | null; confirm?: string | null };

/**
 * Change the password while signed in (POST /me/password).
 *
 * The current password first, then the new one twice. Each refusal is said
 * on the field it is about: a current password that is not right on the
 * first, a new one that breaks a rule or has turned up in a data leak on the
 * second. The server ends every other session when it changes; this one
 * carries on, with the fresh access token it hands back.
 *
 * An account made with Google or Apple has no password to change: the
 * server says so (NO_PASSWORD), and the screen offers the reset link instead,
 * which is how such an account gets one.
 */
export function ChangePasswordScreen({
  onExit,
  onSetPassword,
}: {
  onExit: () => void;
  /** into the forgot-password flow, with the account's address filled in */
  onSetPassword: (email: string) => void;
}): React.JSX.Element {
  const { client, user } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const topInset = useScreenTopInset();
  const bottom = useScreenBottomInset(spacing.lg);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<'changed' | 'noPassword' | null>(null);
  const nextRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const submit = async () => {
    if (busy) return;
    const rule = validatePassword(next);
    const found: Errors = {
      current: current ? null : t('field.required'),
      next: rule ? t(FIELD_ERROR_COPY[rule], FIELD_ERROR_VARS) : null,
      confirm: !confirm ? t('field.required') : confirm !== next ? t('auth.reset.mismatch') : null,
    };
    setErrors(found);
    setFormError(null);
    if (found.current || found.next || found.confirm) return;

    setBusy(true);
    const res = await changePassword(client, current, next);
    setBusy(false);
    if (res.ok) {
      // nothing typed here stays in memory once it has done its job
      setCurrent('');
      setNext('');
      setConfirm('');
      setOutcome('changed');
      return;
    }
    const said = describeError(res.error, t);
    switch (res.error.code) {
      case 'WRONG_PASSWORD':
        setErrors({ current: said });
        break;
      case 'WEAK_PASSWORD':
      case 'PASSWORD_BREACHED':
        setErrors({ next: said });
        break;
      case 'NO_PASSWORD':
        setOutcome('noPassword');
        break;
      default:
        setFormError(said);
    }
  };

  return (
    <GradientBackground>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={topInset}>
        <ScreenHeader title={t('security.password.heading')} onBack={onExit} />
        <ScrollView
          contentContainerStyle={[styles.column, { paddingBottom: bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {outcome === 'changed' ? (
            <>
              <View style={[styles.notice, { flexDirection: dir.row, backgroundColor: colors.successFill }]} accessibilityLiveRegion="polite" testID="password-changed">
                <Icon name="check" size={22} color={colors.success} />
                <Text style={[styles.noticeText, dir.text, { color: colors.textPrimary }]}>{t('security.password.changed')}</Text>
              </View>
              <ClayButton label={t('common.done')} tone="primary" size="large" onPress={onExit} />
            </>
          ) : outcome === 'noPassword' ? (
            <View style={[styles.panel, { backgroundColor: colors.controlTrack }]} accessibilityLiveRegion="polite" testID="password-none">
              <Text style={[styles.panelTitle, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
                {t('error.code.noPassword')}
              </Text>
              <Text style={[styles.panelBody, dir.text, { color: colors.textSecondary }]}>{t('security.password.noPasswordHint')}</Text>
              <ClayButton label={t('security.password.setPassword')} tone="primary" onPress={() => onSetPassword(user?.email ?? '')} />
            </View>
          ) : (
            <>
              <Text style={[styles.intro, dir.text, { color: colors.textSecondary }]}>{t('security.password.intro')}</Text>
              <FormError message={formError} />
              <GlassCard>
                <Field
                  label={t('auth.currentPassword')}
                  value={current}
                  onChangeText={setCurrent}
                  error={errors.current}
                  secure
                  complete="current-password"
                  returnKeyType="next"
                  onSubmitEditing={() => nextRef.current?.focus()}
                  testID="current-password"
                />
                <Field
                  label={t('auth.newPassword')}
                  value={next}
                  onChangeText={setNext}
                  error={errors.next}
                  secure
                  complete="new-password"
                  returnKeyType="next"
                  onSubmitEditing={() => confirmRef.current?.focus()}
                  inputRef={nextRef}
                  testID="new-password"
                />
                {!errors.next ? (
                  <Text style={[styles.hint, dir.text, { color: colors.textSecondary }]}>{t(PASSWORD_RULES_KEY, FIELD_ERROR_VARS)}</Text>
                ) : null}
                <Field
                  label={t('auth.reset.confirmNew')}
                  value={confirm}
                  onChangeText={setConfirm}
                  error={errors.confirm}
                  secure
                  complete="new-password"
                  returnKeyType="done"
                  onSubmitEditing={() => void submit()}
                  inputRef={confirmRef}
                  testID="confirm-password"
                />
              </GlassCard>
              <ClayButton
                label={t('security.password.title')}
                tone="primary"
                size="large"
                busy={busy}
                onPress={() => void submit()}
                style={styles.submit}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // one column on a tablet, on the same 16pt gutter as every other screen on a phone
  column: { width: '100%', maxWidth: layout.column, alignSelf: 'center', paddingHorizontal: layout.gutter, gap: spacing.md },
  intro: { fontSize: typography.sizes.sm, lineHeight: 21 },
  // the rules line sits under its field like the field's own error would
  hint: { fontSize: typography.sizes.xs, marginTop: -spacing.sm, marginBottom: spacing.md },
  submit: { marginTop: spacing.xs },
  notice: { alignItems: 'center', gap: spacing.sm, borderRadius: radii.lg, padding: spacing.md },
  noticeText: { flex: 1, fontSize: typography.sizes.md, lineHeight: 23 },
  panel: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.md },
  panelTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  panelBody: { fontSize: typography.sizes.sm, lineHeight: 21, marginTop: -spacing.xs },
});
