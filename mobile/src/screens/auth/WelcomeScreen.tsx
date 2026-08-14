import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/authStack';
import { useAuth } from '../../auth/AuthContext';
import { Icon, type IconName } from '../../theme/Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { radii, spacing, typography } from '../../theme/tokens';
import { AuthScreenShell } from './AuthForm';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'> & {
  /** re-open the intro (language / welcome / notifications slides) — from the app root */
  onBack?: () => void;
};

/**
 * The sign-in method choice (KUR-271): Apple / Google / email. The auth stack's
 * initial route, so Login/Register can always go back here; its own back
 * re-opens the intro slides.
 *
 * Sign in with Apple (KUR-276) is wired end-to-end: the native flow returns an
 * identity token that the backend (POST /auth/oauth) verifies. Apple's own
 * button is shown only where the OS supports it (iOS 13+), per App Store rules.
 * Google still needs its native flow + GOOGLE_CLIENT_IDS, so it shows a
 * "coming soon" notice rather than a broken flow.
 */
export function WelcomeScreen({ navigation, onBack }: Props) {
  const { colors, scheme } = useTheme();
  const { oauthSignIn } = useAuth();
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    void AppleAuthentication.isAvailableAsync().then((ok) => active && setAppleAvailable(ok));
    return () => {
      active = false;
    };
  }, []);

  const onApple = async () => {
    // The Apple sheet and the backend exchange are separate failure domains, so
    // report them distinctly — a raw "something went wrong" hides whether Apple
    // rejected the authorization (entitlement/provisioning) or our API did.
    let cred: AppleAuthentication.AppleAuthenticationCredential;
    try {
      cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'ERR_REQUEST_CANCELED') return; // user tapped Cancel — not an error
      Alert.alert('Sign in with Apple failed', `${(e as Error).message ?? 'Unknown error'}${code ? `\n(${code})` : ''}`);
      return;
    }
    if (!cred.identityToken) {
      Alert.alert('Sign in with Apple failed', 'Apple didn’t return an identity token. Please try again.');
      return;
    }
    const err = await oauthSignIn('apple', cred.identityToken);
    if (err) Alert.alert('Could not sign in', err);
  };

  const soon = (provider: string) =>
    Alert.alert(`${provider} sign-in is coming soon`, 'For now, continue with email — it takes a few seconds.');

  return (
    <AuthScreenShell title="Sign in or create an account" onBack={onBack} hero="person">
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Apple, Google or email — your choice. You can always sign in later.
      </Text>

      <View style={styles.methods}>
        {appleAvailable ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={
              scheme === 'dark'
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={radii.pill}
            style={styles.appleButton}
            onPress={onApple}
          />
        ) : null}
        <MethodButton
          icon="google"
          label="Continue with Google"
          onPress={() => soon('Google')}
          background={colors.controlTrack}
          foreground={colors.textPrimary}
          border={colors.glassBorder}
        />
        <MethodButton
          icon="mail"
          label="Continue with email"
          onPress={() => navigation.navigate('Register')}
          background={colors.primary}
          foreground={colors.textOnPrimary}
        />
      </View>

      <Pressable onPress={() => navigation.navigate('Login')} style={styles.link} accessibilityRole="button">
        <Text style={[styles.linkText, { color: colors.primary }]}>I already have an account</Text>
      </Pressable>
    </AuthScreenShell>
  );
}

function MethodButton({
  icon,
  label,
  onPress,
  background,
  foreground,
  border,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  background: string;
  foreground: string;
  border?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.method,
        { backgroundColor: background, borderColor: border ?? background, opacity: pressed ? 0.9 : 1 },
      ]}
    >
      <Icon name={icon} size={20} color={foreground} />
      <Text style={[styles.methodText, { color: foreground }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: typography.sizes.sm, marginBottom: spacing.lg },
  methods: { gap: spacing.md },
  // Apple's button is a native view with no intrinsic height — size it to
  // match the custom method buttons below it.
  appleButton: { height: 50, width: '100%' },
  method: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  methodText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  link: { marginTop: spacing.lg, alignItems: 'center' },
  linkText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.medium },
});
