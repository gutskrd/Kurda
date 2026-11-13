import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { ClayButton, ErrorRetry, GlassCard, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useScreenBottomInset, useScreenTopInset } from '../navigation/tabBarLayout';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { checkUsername, USERNAME_MAX, USERNAME_RULE_VARS } from './validate';
import { useI18n } from '../i18n/I18nContext';
import type { ApiError } from '../api/types';
import { describeError, describeErrorOr, type Translate } from '../api/errors';
import { formatDay, restrictionOf } from '../reports/sendErrors';
import { SendErrorNotice } from '../reports/SendError';
import { Field } from '../screens/auth/AuthForm';
import { Loading } from '../theme/Loading';

/** GET /me/username's answer (the server's `UsernameStatus`). */
interface UsernameStatus {
  username: string;
  /** false for an account that signs in through another service and has no password to give */
  needsPassword: boolean;
  canChange: boolean;
  /** when the wait since the last change ends; null when there is none */
  availableAt: string | null;
  cooldownDays: number;
  holdDays: number;
  /** earlier names nobody else can take yet */
  held: Array<{ username: string; heldUntil: string }>;
}

type Availability = { available: true; username: string } | { available: false; reason: string };

/** What the server said about the name in the field: nothing yet, free, or why not. */
type Verdict = { name: string; free: true } | { name: string; free: false; text: string } | null;

/** Long enough that a name is asked about when the typing stops, not at every letter. */
const CHECK_AFTER_MS = 450;

/**
 * Change username (KUR-004). Shows the current name, the wait and the names
 * still kept for their owner, validates the new one as it is typed, asks the
 * server whether it is free once the typing stops, and submits to
 * POST /me/username with the password: the server is the authority for
 * availability, reserved names, the wait between changes and who is asking.
 * Its refusals are said in the reader's own language, each under the field it
 * is about: a name taken or not allowed, a password that is not right, the
 * wait with the day it ends, and anything else as a plain "couldn't update"
 * rather than the server's English.
 */
export function ChangeUsernameScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client, refreshUser } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const topInset = useScreenTopInset();
  const bottom = useScreenBottomInset(spacing.lg);

  const [status, setStatus] = useState<UsernameStatus | null>(null);
  // the account's name did not load: without it nothing can be compared, so the screen says so and asks again
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [input, setInput] = useState('');
  const [password, setPassword] = useState('');
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  // a limit on the account (a new name is shown to others) — said with a way to Account standing
  const [limit, setLimit] = useState<ApiError | null>(null);
  const [done, setDone] = useState(false);
  /** the latest question asked: an answer to an earlier one is about a name no longer in the field */
  const asked = useRef(0);

  const load = useCallback(() => {
    setLoadError(null);
    void client.get<UsernameStatus>('/me/username').then((r) => {
      if (r.ok) setStatus(r.data);
      else setLoadError(r.error);
    });
  }, [client]);

  useEffect(load, [load]);

  const current = status?.username ?? null;
  const check = checkUsername(input);
  const touched = input.trim().length > 0;
  // a change of capitals alone is a change too, and the server takes it
  const changed = check.ok && current != null && check.value !== current;
  const candidate = check.ok && changed ? check.value : null;

  // ask whether the name is free once the typing has stopped, and only about one the server would look at
  useEffect(() => {
    const ticket = ++asked.current;
    if (candidate === null) return;
    const timer = setTimeout(() => {
      void client.get<Availability>(`/me/username/available?username=${encodeURIComponent(candidate)}`).then((res) => {
        // a question that could not be answered is no verdict: the change itself is still checked
        if (ticket !== asked.current || !res.ok) return;
        if (res.data.available) setVerdict({ name: candidate, free: true });
        else if (res.data.reason === 'taken') setVerdict({ name: candidate, free: false, text: t('error.code.usernameTaken') });
        else if (res.data.reason === 'same') setVerdict({ name: candidate, free: false, text: t('username.alreadyYours') });
        else setVerdict({ name: candidate, free: false, text: describeError({ kind: 'client', code: 'INVALID_USERNAME', message: '', details: { reason: res.data.reason } }, t) });
      });
    }, CHECK_AFTER_MS);
    return () => clearTimeout(timer);
  }, [candidate, client, t]);

  const said = verdict !== null && verdict.name === candidate ? verdict : null;
  const canSubmit = candidate !== null && !saving && !done && said?.free !== false && (status?.needsPassword !== true || password.length > 0);

  const submit = useCallback(async () => {
    if (candidate === null || !canSubmit || !status) return;
    setSaving(true);
    setServerError(null);
    setPasswordError(null);
    setLimit(null);
    const res = await client.post<{ user: { username: string }; changed: boolean; status: UsernameStatus }>('/me/username', {
      username: candidate,
      ...(status.needsPassword ? { currentPassword: password } : {}),
    });
    setSaving(false);
    if (res.ok) {
      // nothing typed here stays in memory once it has done its job
      setPassword('');
      setDone(true);
      // the name shown around the app is the session's copy of the account
      void refreshUser();
      setTimeout(onExit, 700);
      return;
    }
    if (restrictionOf(res.error)) {
      setLimit(res.error);
      return;
    }
    if (res.error.code === 'WRONG_PASSWORD' || res.error.code === 'PASSWORD_REQUIRED') {
      setPasswordError(t('error.code.wrongPassword'));
      return;
    }
    setServerError(refusalText(res.error, t, locale));
  }, [candidate, canSubmit, status, client, password, refreshUser, onExit, t, locale]);

  // inline hint under the field: a client rule, a server error, or an all-clear
  const hint: { text: string; tone: 'error' | 'ok' } | null = serverError
    ? { text: serverError, tone: 'error' }
    : !touched
      ? null
      : !check.ok
        ? { text: t(check.message, USERNAME_RULE_VARS), tone: 'error' }
        : !changed
          ? { text: t('username.alreadyYours'), tone: 'error' }
          : said?.free === false
            ? { text: said.text, tone: 'error' }
            : said?.free === true
              ? { text: t('username.change.available'), tone: 'ok' }
              : { text: t('username.looksGood'), tone: 'ok' };

  return (
    <GradientBackground>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={topInset}>
        <ScreenHeader title={t('auth.username')} onBack={onExit} />
        {status === null ? (
          loadError ? (
            <ErrorRetry message={describeError(loadError, t)} onRetry={load} />
          ) : (
            <Loading style={styles.spinner} />
          )
        ) : (
          <ScrollView contentContainerStyle={[styles.screen, { paddingBottom: bottom }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <GlassCard>
              <View style={styles.card}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('username.current')}</Text>
                <Text style={[styles.current, { color: colors.textPrimary }]}>{status.username}</Text>

                {!status.canChange && status.availableAt ? (
                  <Text style={[styles.wait, { color: colors.textPrimary }]} accessibilityRole="text">
                    {t('username.cooldown', { date: formatDay(status.availableAt, locale) })}
                  </Text>
                ) : (
                  <>
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
                        onChangeText={(next) => {
                          setInput(next);
                          setServerError(null);
                        }}
                        autoCapitalize="none"
                        autoCorrect={false}
                        maxLength={USERNAME_MAX}
                        // no example in the field: one was written in English, and the line under the field already says what a name may be made of
                        accessibilityLabel={t('username.new')}
                        editable={!saving && !done}
                      />
                      {said?.free === true && !serverError ? <Icon name="check" size={18} color={colors.success} /> : null}
                    </View>

                    {hint ? (
                      <Text style={[styles.hint, { color: hint.tone === 'error' ? colors.danger : colors.success }]} accessibilityLiveRegion="polite">
                        {hint.text}
                      </Text>
                    ) : (
                      <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('username.rules', { max: USERNAME_MAX })}</Text>
                    )}

                    {status.needsPassword ? (
                      <View style={styles.password}>
                        <Field
                          label={t('username.change.password')}
                          value={password}
                          onChangeText={(next) => {
                            setPassword(next);
                            setPasswordError(null);
                          }}
                          error={passwordError}
                          secure
                          complete="current-password"
                          returnKeyType="done"
                          onSubmitEditing={() => void submit()}
                          testID="username-password"
                        />
                      </View>
                    ) : null}
                  </>
                )}
              </View>
            </GlassCard>

            <Text style={[styles.note, { color: colors.textSecondary }]}>{t('username.change.hold', { hold: status.holdDays })}</Text>
            {status.held.map((h) => (
              <Text key={h.username} style={[styles.note, { color: colors.textSecondary }]}>
                {t('username.change.held', { name: h.username, date: formatDay(h.heldUntil, locale) })}
              </Text>
            ))}

            <SendErrorNotice error={limit} onDismiss={() => setLimit(null)} />

            {status.canChange ? (
              <ClayButton
                label={done ? t('username.saved') : t('username.save')}
                // saving: the button turns and takes no second press, and a screen reader is told what it is doing
                accessibilityLabel={saving ? t('username.saving') : undefined}
                busy={saving}
                tone="primary"
                onPress={() => void submit()}
                style={[styles.save, !canSubmit && !done && styles.saveDisabled]}
              />
            ) : null}
            {saving ? <Loading style={styles.spinner} /> : null}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

/**
 * Why the server would not take the new name, in the reader's words. The
 * cooldown is a 429 that carries the day it ends, so it is said with that
 * day rather than read as "too many attempts" with a countdown of weeks.
 */
function refusalText(error: ApiError, t: Translate, locale: string): string {
  if (error.code === 'USERNAME_CHANGE_COOLDOWN') {
    const availableAt = (error.details as { availableAt?: unknown } | undefined)?.availableAt;
    return typeof availableAt === 'string' && !Number.isNaN(Date.parse(availableAt))
      ? t('username.cooldown', { date: formatDay(availableAt, locale) })
      : t('username.updateFailed');
  }
  return describeErrorOr(error, t, 'username.updateFailed');
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // one column on a tablet, on the same gutter as every other screen on a phone
  screen: { width: '100%', maxWidth: layout.column, alignSelf: 'center', paddingHorizontal: layout.gutter },

  card: { gap: spacing.xs },
  label: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, textTransform: 'uppercase', letterSpacing: 0.6 },
  current: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  wait: { fontSize: typography.sizes.md, lineHeight: 23, marginTop: spacing.md },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginTop: spacing.xs },
  at: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  input: { minHeight: MIN_TOUCH_TARGET, flex: 1, minWidth: 0, fontSize: typography.sizes.md },
  hint: { fontSize: typography.sizes.sm, marginTop: spacing.sm },
  password: { marginTop: spacing.md },
  note: { fontSize: typography.sizes.sm, lineHeight: 21, marginTop: spacing.md },
  save: { marginTop: spacing.lg },
  saveDisabled: { opacity: 0.4 },
  spinner: { marginTop: spacing.md },
});
