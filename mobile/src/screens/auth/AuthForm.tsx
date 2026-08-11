import type { ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard, GradientBackground } from '../../theme/glass';
import { useTheme } from '../../theme/ThemeProvider';
import { radii, spacing, typography } from '../../theme/tokens';

export function AuthScreenShell({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <GradientBackground>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text style={[styles.brand, { color: colors.primary }]}>Kurda 🌿</Text>
        <Text style={[styles.slogan, { color: colors.textSecondary }]}>Jiyan bi kurdî xweştire</Text>
        <GlassCard>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
          {children}
        </GlassCard>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

export function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  error?: string | null;
  secure?: boolean;
  autoCapitalize?: 'none' | 'words';
  keyboardType?: 'default' | 'email-address';
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{props.label}</Text>
      <TextInput
        style={[
          styles.input,
          { backgroundColor: colors.controlTrack, borderColor: props.error ? colors.danger : colors.glassBorder, color: colors.textPrimary },
        ]}
        placeholderTextColor={colors.textSecondary}
        value={props.value}
        onChangeText={props.onChangeText}
        secureTextEntry={props.secure}
        autoCapitalize={props.autoCapitalize ?? 'none'}
        keyboardType={props.keyboardType ?? 'default'}
        autoCorrect={false}
        testID={props.testID}
      />
      {props.error ? <Text style={[styles.error, { color: colors.danger }]}>{props.error}</Text> : null}
    </View>
  );
}

export function SubmitButton(props: { label: string; busy: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.busy}
      testID="submit"
      style={({ pressed }) => [styles.buttonWrap, { opacity: props.busy ? 0.7 : pressed ? 0.92 : 1 }]}
    >
      <LinearGradient
        colors={[colors.primary, colors.primaryStrong]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.button, { borderColor: colors.clayBorder, shadowColor: colors.softShadow }]}
      >
        {props.busy ? (
          <ActivityIndicator color={colors.textOnPrimary} />
        ) : (
          <Text style={[styles.buttonText, { color: colors.textOnPrimary }]}>{props.label}</Text>
        )}
      </LinearGradient>
    </Pressable>
  );
}

export function LinkText(props: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={props.onPress} style={styles.link}>
      <Text style={[styles.linkText, { color: colors.primary }]}>{props.label}</Text>
    </Pressable>
  );
}

export function FormError({ message }: { message: string | null }) {
  const { colors } = useTheme();
  if (!message) return null;
  return <Text style={[styles.formError, { color: colors.danger }]}>{message}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: spacing.lg, justifyContent: 'center' },
  brand: { fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold, textAlign: 'center' },
  slogan: { fontSize: typography.sizes.sm, textAlign: 'center', marginBottom: spacing.xl, fontStyle: 'italic' },
  title: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, marginBottom: spacing.md },
  field: { marginBottom: spacing.md },
  label: { fontSize: typography.sizes.sm, marginBottom: spacing.xs },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    fontSize: typography.sizes.md,
  },
  error: { fontSize: typography.sizes.xs, marginTop: spacing.xs },
  formError: { fontSize: typography.sizes.sm, marginBottom: spacing.md, textAlign: 'center' },
  buttonWrap: { marginTop: spacing.sm },
  button: {
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 6,
  },
  buttonText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  link: { marginTop: spacing.md, alignItems: 'center' },
  linkText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.medium },
});
