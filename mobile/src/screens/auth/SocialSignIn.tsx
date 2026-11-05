import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuth } from '../../auth/AuthContext';
import { signInWithGoogle } from '../../auth/google';
import { haptic } from '../../feedback/haptics';
import { useI18n } from '../../i18n/I18nContext';
import { currentMaintenance } from '../../maintenance/maintenance';
import { GoogleMark } from '../../theme/BrandMark';
import { Icon, type IconName } from '../../theme/Icon';
import { PressableScale } from '../../theme/MotionParts';
import { useTheme } from '../../theme/ThemeProvider';
import { radii, spacing, typography } from '../../theme/tokens';

/**
 * The ways in through Apple and Google, for every screen that offers them:
 * the sign-in choice (WelcomeScreen) and a guest making the account their own
 * (ClaimAccountScreen). One set of buttons and one way of handling the native
 * sheet and the server's answer, so the two screens never drift apart.
 *
 * Signed in as a guest, the same sign-in claims the guest's account rather
 * than making another (api/src/auth/oauth.ts), so what was learned is kept —
 * AuthContext's `oauthSignIn` makes sure the guest's session goes with it.
 */

/** The name shared with Apple as one line, given name then family name; null when none was shared. */
function appleFullName(name: AppleAuthentication.AppleAuthenticationFullName | null): string | null {
  const joined = [name?.givenName, name?.familyName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
  return joined || null;
}

/**
 * Whether Apple's button may be shown here (iOS 13 and later, per App Store
 * rules), and the two sign-ins.
 *
 * The Apple sheet and the backend exchange are separate failure domains, and
 * each alert's title says which one failed. What is under it is always in
 * the reader's own language: the SDK's message and code are English and
 * technical, and they told a learner nothing but that the app was broken.
 */
export function useSocialSignIn(): { appleAvailable: boolean; onApple: () => Promise<void>; onGoogle: () => Promise<void> } {
  const { oauthSignIn } = useAuth();
  const { t } = useI18n();
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    void AppleAuthentication.isAvailableAsync().then((ok) => active && setAppleAvailable(ok));
    return () => {
      active = false;
    };
  }, []);

  const onApple = async () => {
    let cred: AppleAuthentication.AppleAuthenticationCredential;
    try {
      cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return; // user tapped Cancel — not an error
      Alert.alert(t('welcome.appleFailed'), t('common.tryAgain'));
      return;
    }
    if (!cred.identityToken) {
      Alert.alert(t('welcome.appleFailed'), t('welcome.appleNoToken'));
      return;
    }
    try {
      // With the token: the one-time authorization code, which the server
      // exchanges for the token it revokes at Apple if the account is ever
      // deleted, and the name, which Apple shares on the first sign-in only.
      const err = await oauthSignIn('apple', cred.identityToken, {
        authorizationCode: cred.authorizationCode,
        fullName: appleFullName(cred.fullName),
      });
      // Hevalo offline for a while is said by the screen over the app, not by an alert on top of it
      if (err && !currentMaintenance()) Alert.alert(t('welcome.couldNotSignIn'), err);
    } catch {
      // never let a post-Apple failure die silently — surface it
      Alert.alert(t('welcome.signInError'), t('common.tryAgain'));
    }
  };

  const onGoogle = async () => {
    // The native sheet and the backend exchange are separate failure domains.
    const res = await signInWithGoogle();
    if (res.kind === 'cancelled') return; // user backed out — not an error
    // the button is not shown in a build without Google's client ids; this is only belt and braces
    if (res.kind === 'not-configured') return;
    if (res.kind === 'error') {
      // our own sentence for what went wrong, under the title that says it was Google's sheet
      Alert.alert(t('welcome.googleFailed'), res.messageKey === 'welcome.googleFailed' ? t('common.tryAgain') : t(res.messageKey));
      return;
    }
    try {
      const err = await oauthSignIn('google', res.idToken);
      if (err && !currentMaintenance()) Alert.alert(t('welcome.couldNotSignIn'), err);
    } catch {
      Alert.alert(t('welcome.signInError'), t('common.tryAgain'));
    }
  };

  return { appleAvailable, onApple, onGoogle };
}

/** Apple's own button, black on light and white on dark, the height of the buttons beside it. */
export function AppleButton({ onPress }: { onPress: () => void }): React.JSX.Element {
  const { scheme } = useTheme();
  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={
        scheme === 'dark' ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
      }
      cornerRadius={radii.pill}
      style={styles.appleButton}
      onPress={onPress}
    />
  );
}

/** Continue with Google, on Google's own surface. */
export function GoogleButton({ onPress }: { onPress: () => void }): React.JSX.Element {
  const { t } = useI18n();
  return <MethodButton mark={<GoogleMark size={18} />} label={t('welcome.google')} onPress={onPress} background={GOOGLE_SURFACE} foreground={GOOGLE_INK} />;
}

/*
 * Google’s own two, and the only colours in this file that are not the
 * theme’s. A sign-in button carrying somebody else’s mark is their surface,
 * not ours to tint, and it stays the same in the dark theme for the same
 * reason the G in the middle of it does.
 */
const GOOGLE_SURFACE = '#FFFFFF';
const GOOGLE_INK = '#1F1F1F';

/**
 * One way in: a mark, a word, a tap.
 *
 * Either an `icon` — one of ours, drawn in the button's own foreground colour —
 * or a `mark`, which is somebody else's logo and brings its own colours. Never
 * both, and never neither: a company's mark is not ours to re-tint, and an icon
 * that ignored the theme would be the only one in the app that did.
 *
 * It gives a little under the finger and springs back, and the tap is felt:
 * the first thing a finger does in the app is choose its way in, and a way
 * in that starts with a light knock is one that answered.
 */
export function MethodButton({
  icon,
  mark,
  label,
  onPress,
  background,
  foreground,
}: {
  label: string;
  onPress: () => void;
  background: string;
  foreground: string;
} & ({ icon: IconName; mark?: never } | { mark: React.JSX.Element; icon?: never })) {
  return (
    <PressableScale
      onPress={() => {
        haptic('tap');
        onPress();
      }}
      accessibilityRole="button"
      style={[styles.method, { backgroundColor: background }]}
    >
      {mark ?? (icon ? <Icon name={icon} size={20} color={foreground} /> : null)}
      <Text style={[styles.methodText, { color: foreground }]}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  // Apple's button is a native view with no intrinsic height — size it to
  // match the custom method buttons beside it.
  appleButton: { height: 50, width: '100%' },
  method: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
  },
  methodText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
});
