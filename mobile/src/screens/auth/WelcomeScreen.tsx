import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/authStack';
import { ClayButton } from '../../theme/glass';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing } from '../../theme/tokens';
import { AuthScreenShell } from './AuthForm';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

/**
 * The sign-in choice (KUR-271): "Continue with email" (sign up) vs "I already
 * have an account" (log in). The auth stack's initial route, so Login/Register
 * can always go back here.
 */
export function WelcomeScreen({ navigation }: Props) {
  const { colors } = useTheme();
  return (
    <AuthScreenShell title="Get started">
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Create an account to save your progress, or sign in.
      </Text>
      <View style={styles.actions}>
        <ClayButton label="Continue with email" tone="primary" onPress={() => navigation.navigate('Register')} />
        <ClayButton label="I already have an account" tone="neutral" onPress={() => navigation.navigate('Login')} />
      </View>
    </AuthScreenShell>
  );
}

const styles = StyleSheet.create({
  subtitle: { marginBottom: spacing.lg },
  actions: { gap: spacing.md },
});
