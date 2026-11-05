import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/authStack';
import { useAuth } from '../../auth/AuthContext';
import { isGoogleConfigured } from '../../auth/google';
import { AgreeLine } from '../../legal/links';
import { useListEntrance } from '../../theme/animate';
import { Rise } from '../../theme/MotionParts';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, typography } from '../../theme/tokens';
import { MIN_TOUCH_TARGET } from '../../a11y/a11y';
import { AUTH_HEAD_ROWS, AuthScreenShell } from './AuthForm';
import { GuestStartFlow } from './GuestStartFlow';
import { AppleButton, GoogleButton, MethodButton, useSocialSignIn } from './SocialSignIn';
import { useI18n } from '../../i18n/I18nContext';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'> & {
  /** re-open the intro (language / welcome / notifications slides) — from the app root */
  onBack?: () => void;
};

/**
 * The sign-in method choice (KUR-271): Apple / Google / email. The auth stack's
 * initial route, so Login/Register can always go back here; its own back
 * re-opens the intro slides.
 *
 * Sign in with Apple (KUR-276) and Google (KUR-018) are both wired end-to-end:
 * the native flow returns an identity token that the backend (POST /auth/oauth)
 * verifies. Apple's own button is shown only where the OS supports it (iOS 13+),
 * per App Store rules. Google is enabled once its client IDs are configured
 * (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID + backend GOOGLE_CLIENT_IDS); until then it
 * falls back to a "coming soon" notice rather than a broken flow. See
 * docs/auth/google-signin.md.
 *
 * Hevalo greets from the window over the choice, and the quiet way in under
 * it — try Hevalo first, as a guest — opens his two-step introduction
 * (GuestStartFlow) in this screen's place, with its own way back here.
 */
export function WelcomeScreen({ navigation, onBack }: Props) {
  const { colors } = useTheme();
  const { baseUrl } = useAuth();
  // Apple's button where the phone has it, and both sheets with their answers (SocialSignIn)
  const { appleAvailable, onApple, onGoogle } = useSocialSignIn();
  const { t } = useI18n();
  const [conn, setConn] = useState<'checking' | 'ok' | 'fail'>('checking');
  // the guest introduction, in place of the choice, until it is left or the session starts
  const [guestFlow, setGuestFlow] = useState(false);
  // the ways in rise one after another under the head the shell brings in (AUTH_HEAD_ROWS)
  const entering = useListEntrance(true);
  const row = (i: number) => entering(AUTH_HEAD_ROWS + i);

  // Connection diagnostic (KUR-008): show which API the build actually points at
  // and whether the device can reach it, so a "nothing happens" sign-in has an
  // obvious cause (wrong URL baked in / unreachable) instead of a silent hang.
  //
  // Development only, like the readout it feeds. A release build showed nobody
  // the answer and still asked the question on every launch — a health probe
  // against the API from every phone that opened the app, for a line that was
  // not rendered.
  useEffect(() => {
    if (!__DEV__) return;
    let active = true;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    setConn('checking');
    fetch(`${baseUrl}/health`, { signal: ctrl.signal })
      .then((r) => {
        if (active) setConn(r.ok ? 'ok' : 'fail');
      })
      .catch(() => {
        if (active) setConn('fail');
      })
      .finally(() => clearTimeout(timer));
    return () => {
      active = false;
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [baseUrl]);

  if (guestFlow) return <GuestStartFlow onExit={() => setGuestFlow(false)} />;

  return (
    <AuthScreenShell title={t('welcome.title')} subtitle={t('welcome.subtitle')} onBack={onBack} hero="hevalo" says={t('guide.welcome.says')}>
      <View style={styles.methods}>
        {appleAvailable ? (
          <Rise delay={row(0)}>
            <AppleButton onPress={() => void onApple()} />
          </Rise>
        ) : null}
        {/*
          Only in a build that has Google's client ids. Without them the button
          led nowhere ("coming soon"), and a sign-in button that leads nowhere
          is an unfinished app to anybody reviewing it.
        */}
        {isGoogleConfigured ? (
          <Rise delay={row(1)}>
            <GoogleButton onPress={() => void onGoogle()} />
          </Rise>
        ) : null}
        <Rise delay={row(2)}>
          <MethodButton
            icon="mail-fill"
            label={t('welcome.email')}
            onPress={() => navigation.navigate('Register')}
            background={colors.primary}
            foreground={colors.textOnPrimary}
          />
        </Rise>
      </View>

      <Rise delay={row(3)}>
        <Pressable onPress={() => navigation.navigate('Login')} style={styles.link} accessibilityRole="button">
          <Text style={[styles.linkText, { color: colors.primary }]}>{t('welcome.haveAccount')}</Text>
        </Pressable>
      </Rise>

      {/*
        The quiet way in: try the lessons first, as a guest, and decide about
        an account later. Quieter than the sign-in link above it on purpose —
        it is the way for somebody not ready to choose, not the way in. It
        opens Hevalo's introduction, which starts the session at its end.
      */}
      <Rise delay={row(4)}>
        <Pressable onPress={() => setGuestFlow(true)} style={styles.link} accessibilityRole="button" testID="welcome-guest">
          <Text style={[styles.linkText, { color: colors.textSecondary }]}>{t('welcome.guest')}</Text>
        </Pressable>
      </Rise>

      {/* the rules and the privacy policy, each a link: Apple, Google and a guest session make an account too */}
      <Rise delay={row(5)}>
        <AgreeLine style={styles.agree} />
      </Rise>

      {/*
        Which API this build talks to, and whether it answers.

        Development only. It is genuinely useful while pointing a simulator at
        localhost or a staging host — and it has no business on the first screen
        of a release build, where it is a debug readout under the sign-in
        buttons that names the backend to anyone who opens the app. Nobody needs
        to be told that, and nobody outside development was ever meant to see it.
      */}
      {__DEV__ ? (
        <View style={styles.diag}>
          <Text style={[styles.diagText, { color: colors.textSecondary }]} numberOfLines={1}>
            API: {baseUrl.replace(/^https?:\/\//, '')}
          </Text>
          <Text
            style={[
              styles.diagText,
              { color: conn === 'ok' ? colors.success : conn === 'fail' ? colors.danger : colors.textSecondary },
            ]}
          >
            {conn === 'checking' ? 'checking connection…' : conn === 'ok' ? 'reachable ✓' : 'unreachable ✗'}
          </Text>
        </View>
      ) : null}
    </AuthScreenShell>
  );
}

const styles = StyleSheet.create({
  methods: { gap: spacing.md },
  link: { marginTop: spacing.sm, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.medium },
  agree: { marginTop: spacing.lg, paddingHorizontal: spacing.md },
  diag: { marginTop: spacing.xl, alignItems: 'center', gap: 2 },
  diagText: { fontSize: typography.sizes.xs },
});
