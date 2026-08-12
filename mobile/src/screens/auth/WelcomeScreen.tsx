import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/authStack';
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
 * Email is fully wired. Apple/Google need native modules
 * (expo-apple-authentication + a Google flow) and OAuth credentials that match
 * the backend's GOOGLE_CLIENT_IDS / APPLE_CLIENT_IDS — the backend route
 * (POST /auth/oauth) already exists; until the native side + credentials land
 * these show a "coming soon" notice rather than a broken flow.
 */
export function WelcomeScreen({ navigation, onBack }: Props) {
  const { colors } = useTheme();

  const soon = (provider: string) =>
    Alert.alert(`${provider} sign-in is coming soon`, 'For now, continue with email — it takes a few seconds.');

  return (
    <AuthScreenShell title="Sign in or create an account" onBack={onBack} hero="person">
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Apple, Google or email — your choice. You can always sign in later.
      </Text>

      <View style={styles.methods}>
        <MethodButton
          icon="apple"
          label="Continue with Apple"
          onPress={() => soon('Apple')}
          background="#000000"
          foreground="#FFFFFF"
        />
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
