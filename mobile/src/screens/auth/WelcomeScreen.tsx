import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../../theme/Pressable';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/authStack';
import { useAuth } from '../../auth/AuthContext';
import { isGoogleConfigured } from '../../auth/google';
import { AgreeLine } from '../../legal/links';
import { useListEntrance } from '../../theme/animate';
import { Rise, heldDim } from '../../theme/MotionParts';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, typography } from '../../theme/tokens';
import { MIN_TOUCH_TARGET } from '../../a11y/a11y';
import { AUTH_HEAD_ROWS, AuthScreenShell } from './AuthForm';
import { GuestStartFlow } from './GuestStartFlow';
import { AppleButton, GoogleButton, MethodButton, ProviderNote, useSocialSignIn } from './SocialSignIn';
import { useI18n } from '../../i18n/I18nContext';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'> & {
  /** Reopens the intro slides, from the app root. */
  onBack?: () => void;
};

/**
 * The sign-in choice: Apple, Google or email. The auth stack's first route, so Login and Register can always go back
 * here. Apple and Google return an identity token that POST /auth/oauth verifies; Apple's button shows only where
 * the OS supports it (iOS 13+), and Google's only in builds with its client ids (docs/auth/google-signin.md). Trying
 * as a guest opens GuestStartFlow in this screen's place.
 */
export function WelcomeScreen({ navigation, onBack }: Props) {
  const { colors } = useTheme();
  const { baseUrl } = useAuth();
  // Apple's button where available, and both sign-in sheets (SocialSignIn).
  const { appleAvailable, onApple, onGoogle } = useSocialSignIn();
  const { t } = useI18n();
  const [conn, setConn] = useState<'checking' | 'ok' | 'fail'>('checking');
  // The guest introduction replaces the choice until it is left or the session starts.
  const [guestFlow, setGuestFlow] = useState(false);
  // The options rise in one by one after the head (AUTH_HEAD_ROWS).
  const entering = useListEntrance(true);
  const row = (i: number) => entering(AUTH_HEAD_ROWS + i);

  // Development only: which API the build points at and whether it answers, so a silent sign-in has an obvious cause.
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
        {/* Only in builds with Google client ids: a button that leads nowhere reads as an unfinished app. */}
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
        {appleAvailable || isGoogleConfigured ? (
          <Rise delay={row(2)}>
            <ProviderNote />
          </Rise>
        ) : null}
      </View>

      <Rise delay={row(3)}>
        <Pressable onPress={() => navigation.navigate('Login')} style={({ pressed }) => [styles.link, pressed && heldDim]} accessibilityRole="button">
          <Text style={[styles.linkText, { color: colors.primary }]}>{t('welcome.haveAccount')}</Text>
        </Pressable>
      </Rise>

      {/* Trying as a guest, deliberately quieter than the sign-in link: it is for someone not ready to choose. */}
      <Rise delay={row(4)}>
        <Pressable onPress={() => setGuestFlow(true)} style={({ pressed }) => [styles.link, pressed && heldDim]} accessibilityRole="button" testID="welcome-guest">
          <Text style={[styles.linkText, { color: colors.textSecondary }]}>{t('welcome.guest')}</Text>
        </Pressable>
      </Rise>

      {/* A child's own phone, signed in with the six digits their parent's phone shows (family/ChildCodeScreen). */}
      <Rise delay={row(4)}>
        <Pressable onPress={() => navigation.navigate('ChildCode')} style={({ pressed }) => [styles.link, pressed && heldDim]} accessibilityRole="button" testID="welcome-child-code">
          <Text style={[styles.linkText, { color: colors.textSecondary }]}>{t('child.code.entry')}</Text>
        </Pressable>
      </Rise>

      {/* Terms and privacy links: Apple, Google and guest sessions create accounts too. */}
      <Rise delay={row(5)}>
        <AgreeLine style={styles.agree} />
      </Rise>

      {/* Development only: which API this build talks to, and whether it answers. Release builds must not show it. */}
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
  // Centred on every line: the German label wraps at 320 points.
  linkText: { fontSize: typography.sizes.text, fontWeight: typography.weights.medium, textAlign: 'center' },
  agree: { marginTop: spacing.lg, paddingHorizontal: spacing.md },
  diag: { marginTop: spacing.xl, alignItems: 'center', gap: 2 },
  diagText: { fontSize: typography.sizes.text },
});
