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
import { useDirection } from '../../reports/direction';

/**
 * Apple and Google sign-in, shared by WelcomeScreen and ClaimAccountScreen so the two never drift apart. Signed in
 * as a guest, the same sign-in claims the guest's account (api/src/auth/oauth.ts), keeping their progress.
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
 * Whether Apple's button may show (iOS 13 and later, per App Store rules), and the two sign-ins. The native sheet
 * and the server exchange fail separately, and each alert's title says which; the message is always in the
 * reader's language, never the SDK's English.
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
      if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return; // Cancelled by the user, not an error.
      Alert.alert(t('welcome.appleFailed'), t('common.tryAgain'));
      return;
    }
    if (!cred.identityToken) {
      Alert.alert(t('welcome.appleFailed'), t('welcome.appleNoToken'));
      return;
    }
    try {
      // The one-time authorization code lets the server revoke the Apple token if the account is deleted; Apple shares
      // the name on the first sign-in only.
      const err = await oauthSignIn('apple', cred.identityToken, {
        authorizationCode: cred.authorizationCode,
        fullName: appleFullName(cred.fullName),
      });
      // Maintenance is shown by the screen over the app, not by an alert.
      if (err && !currentMaintenance()) Alert.alert(t('welcome.couldNotSignIn'), err);
    } catch {
      // Never let a failure after the Apple sheet pass silently.
      Alert.alert(t('welcome.signInError'), t('common.tryAgain'));
    }
  };

  const onGoogle = async () => {
    // The native sheet and the backend exchange are separate failure domains.
    const res = await signInWithGoogle();
    if (res.kind === 'cancelled') return; // Cancelled by the user, not an error.
    // The button is hidden in builds without Google client ids; this is a safeguard.
    if (res.kind === 'not-configured') return;
    if (res.kind === 'error') {
      // Our own message, under a title that says the Google sheet failed.
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

/** What Apple or Google hands Hevalo and who sees it, under their buttons: the name becomes the profile's display name. */
export function ProviderNote(): React.JSX.Element {
  const { t } = useI18n();
  const { colors } = useTheme();
  return <Text style={[styles.note, { color: colors.textSecondary }]}>{t('welcome.providerShares')}</Text>;
}

/** Continue with Google, on Google's own surface. */
export function GoogleButton({ onPress }: { onPress: () => void }): React.JSX.Element {
  const { t } = useI18n();
  return <MethodButton mark={<GoogleMark size={18} />} label={t('welcome.google')} onPress={onPress} background={GOOGLE_SURFACE} foreground={GOOGLE_INK} />;
}

// Google's own colours, the only untinted ones here: another company's mark is not ours to recolour, even in dark mode.
const GOOGLE_SURFACE = '#FFFFFF';
const GOOGLE_INK = '#1F1F1F';

/**
 * One sign-in method button, with either an `icon` (ours, in the theme's foreground) or a `mark` (another company's
 * logo, in its own colours), never both or neither. It springs under the finger with a light haptic.
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
  // The mark leads on the side the language starts from, like a ClayButton's icon.
  const dir = useDirection();
  return (
    <PressableScale
      onPress={() => {
        haptic('tap');
        onPress();
      }}
      accessibilityRole="button"
      style={[styles.method, { flexDirection: dir.row, backgroundColor: background }]}
    >
      {mark ?? (icon ? <Icon name={icon} size={20} color={foreground} /> : null)}
      <Text style={[styles.methodText, { color: foreground }]}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  // Apple's native button has no intrinsic height; match the method buttons beside it.
  appleButton: { height: 50, width: '100%' },
  method: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
  },
  methodText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  note: { fontSize: typography.sizes.xs, lineHeight: 18, textAlign: 'center' },
});
