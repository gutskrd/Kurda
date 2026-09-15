import { useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard, GradientBackground } from '../../theme/glass';
import { BreathingIcon, Icon, type IconName } from '../../theme/Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { radii, spacing, typography } from '../../theme/tokens';
import { useI18n } from '../../i18n/I18nContext';

export function AuthScreenShell({
  title,
  subtitle,
  children,
  onBack,
  hero,
}: {
  title: string;
  /** the line under the title — the browser's auth-head has always had one */
  subtitle?: string;
  children: ReactNode;
  onBack?: () => void;
  /** optional breathing hero glyph shown above the title (sign-in choice) */
  hero?: IconName;
}) {
  const { colors } = useTheme();

  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  return (
    <GradientBackground>
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={10}
          style={[styles.back, { top: insets.top + spacing.sm }]}
        >
          <Text style={[styles.backText, { color: colors.primary }]}>{`‹ ${t('common.back')}`}</Text>
        </Pressable>
      ) : null}
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text style={[styles.brand, { color: colors.primary }]}>MyKurda</Text>
        <Text style={[styles.slogan, { color: colors.textSecondary }]}>Jiyan bi kurdî xweştire</Text>
        <GlassCard>
          {hero ? <BreathingIcon name={hero} size={52} tone="primary" style={styles.hero} /> : null}
          <Text style={[styles.title, { color: colors.textPrimary }, subtitle ? null : styles.titleAlone]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
          {children}
        </GlassCard>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

/**
 * One labelled field.
 *
 * `autoComplete` and `textContentType` are the two halves of the same thing —
 * Android reads the first, iOS the second — and without them the keychain and
 * the password manager have nothing to offer. The browser has had this for free
 * from `autoComplete` since the form was written; the phone had to be told.
 *
 * A secure field gets the eye, because a password you cannot read is a password
 * you mistype on a phone keyboard, and the web has had the toggle all along.
 */
export function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  error?: string | null;
  secure?: boolean;
  autoCapitalize?: 'none' | 'words';
  keyboardType?: 'default' | 'email-address';
  placeholder?: string;
  /** what the keychain should offer here */
  complete?: 'email' | 'username' | 'current-password' | 'new-password';
  testID?: string;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [reveal, setReveal] = useState(false);
  const hidden = props.secure && !reveal;

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{props.label}</Text>
      <View>
        <TextInput
          style={[
            styles.input,
            props.secure ? styles.inputWithAffix : null,
            { backgroundColor: colors.controlTrack, borderColor: props.error ? colors.danger : colors.glassBorder, color: colors.textPrimary },
          ]}
          placeholder={props.placeholder}
          placeholderTextColor={colors.textSecondary}
          value={props.value}
          onChangeText={props.onChangeText}
          secureTextEntry={hidden}
          autoCapitalize={props.autoCapitalize ?? 'none'}
          keyboardType={props.keyboardType ?? 'default'}
          autoComplete={props.complete}
          textContentType={TEXT_CONTENT_TYPE[props.complete ?? 'none']}
          autoCorrect={false}
          testID={props.testID}
        />
        {props.secure ? (
          <Pressable
            onPress={() => setReveal((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={reveal ? t('auth.hidePassword') : t('auth.showPassword')}
            accessibilityState={{ selected: reveal }}
            hitSlop={8}
            style={styles.affix}
          >
            <Icon name={reveal ? 'eye-off' : 'eye'} size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      {props.error ? <Text style={[styles.error, { color: colors.danger }]}>{props.error}</Text> : null}
    </View>
  );
}

/** iOS wants its own vocabulary for the same four things Android names plainly. */
const TEXT_CONTENT_TYPE = {
  email: 'emailAddress',
  username: 'username',
  'current-password': 'password',
  'new-password': 'newPassword',
  none: undefined,
} as const;

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
  back: { position: 'absolute', top: spacing.xl, left: spacing.lg, zIndex: 1, paddingVertical: spacing.xs, paddingHorizontal: spacing.xs },
  backText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  brand: { fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold, textAlign: 'center' },
  slogan: { fontSize: typography.sizes.sm, textAlign: 'center', marginBottom: spacing.xl, fontStyle: 'italic' },
  hero: { alignSelf: 'center', marginBottom: spacing.md },
  title: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  titleAlone: { marginBottom: spacing.md },
  subtitle: { fontSize: typography.sizes.sm, marginTop: spacing.xs, marginBottom: spacing.md, lineHeight: 18 },
  field: { marginBottom: spacing.md },
  label: { fontSize: typography.sizes.sm, marginBottom: spacing.xs },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    fontSize: typography.sizes.md,
  },
  inputWithAffix: { paddingRight: spacing.xl + spacing.md },
  affix: { position: 'absolute', right: spacing.sm, top: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: spacing.xs },
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
