import { useState, type ReactNode, type Ref } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard, GradientBackground } from '../../theme/glass';
import { BreathingIcon, Icon, type IconName } from '../../theme/Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { radii, spacing, typography } from '../../theme/tokens';
import { MIN_TOUCH_TARGET } from '../../a11y/a11y';
import { display } from '../../theme/fonts';
import { useI18n } from '../../i18n/I18nContext';
import { useDirection } from '../../reports/direction';

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
  /**
   * A hero makes the head a centred composition.
   *
   * The two screens that show one — the sign-in choice and the code screen —
   * also centre everything underneath: the glyph, the buttons, the code field,
   * the links. Only the title and the line under it were left-aligned, so a
   * centred 52pt glyph sat directly above a heading that started at the left
   * edge. The screens with fields have no hero and stay left-aligned, because a
   * centred heading above left-aligned labels is the same mistake mirrored.
   */
  const centred = Boolean(hero);


  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const dir = useDirection();
  const mirrored = dir.row === 'row-reverse';
  return (
    <GradientBackground>
      {onBack ? (
        // the same way back as every other screen's header: a chevron and the word, on the reading side
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={10}
          style={({ pressed }) => [
            styles.back,
            { flexDirection: dir.row, top: insets.top + spacing.sm },
            mirrored ? styles.backEnd : styles.backStart,
            pressed && styles.pressed,
          ]}
        >
          <Icon name="chevron-left" size={20} color={colors.primary} style={dir.flip ?? undefined} />
          <Text style={[styles.backText, { color: colors.primary }]}>{t('common.back')}</Text>
        </Pressable>
      ) : null}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/*
          Scrolls once the form is taller than the screen — sign-up with its
          birth month, or with a note above it, on a small phone — and stays
          centred while it is not. Fixed, the overflow ran under the way back
          and off the bottom with the button in it.
        */}
        <ScrollView
          // clear of the way back above, and as much below, so a form that fits stays in the middle
          contentContainerStyle={[styles.screen, { paddingVertical: insets.top + MIN_TOUCH_TARGET + spacing.sm }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        <Text style={[styles.brand, { color: colors.primary }]}>Hevalo</Text>
        <Text style={[styles.slogan, { color: colors.textSecondary }]}>Jiyan bi kurdî xweştire</Text>
        <GlassCard>
          {hero ? <BreathingIcon name={hero} size={52} tone="primary" style={styles.hero} /> : null}
          <Text
            style={[styles.title, { color: colors.textPrimary }, subtitle ? null : styles.titleAlone, centred && styles.centred]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.textSecondary }, centred && styles.centred]}>{subtitle}</Text>
          ) : null}
          {children}
        </GlassCard>
        </ScrollView>
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
 *
 * A form of several fields says on the keyboard where Return goes: Next to the
 * field below, keeping the keyboard up, and Done on the last, which sends it.
 *
 * In Soranî and Arabic the label, the typing and the eye start on the right.
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
  returnKeyType?: 'next' | 'done';
  onSubmitEditing?: () => void;
  inputRef?: Ref<TextInput>;
  testID?: string;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const mirrored = dir.row === 'row-reverse';
  const [reveal, setReveal] = useState(false);
  const hidden = props.secure && !reveal;

  return (
    <View style={styles.field}>
      <Text style={[styles.label, dir.text, { color: colors.textSecondary }]}>{props.label}</Text>
      <View>
        <TextInput
          style={[
            styles.input,
            mirrored && styles.inputMirrored,
            props.secure ? (mirrored ? styles.inputWithAffixStart : styles.inputWithAffix) : null,
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
          accessibilityLabel={props.label}
          textContentType={TEXT_CONTENT_TYPE[props.complete ?? 'none']}
          autoCorrect={false}
          returnKeyType={props.returnKeyType}
          onSubmitEditing={props.onSubmitEditing}
          // Next moves on without the keyboard dropping and coming back up
          submitBehavior={props.returnKeyType === 'next' ? 'submit' : undefined}
          ref={props.inputRef}
          testID={props.testID}
        />
        {props.secure ? (
          <Pressable
            onPress={() => setReveal((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={reveal ? t('auth.hidePassword') : t('auth.showPassword')}
            accessibilityState={{ selected: reveal }}
            hitSlop={8}
            style={[styles.affix, mirrored ? styles.affixStart : styles.affixEnd]}
          >
            <Icon name={reveal ? 'eye-off' : 'eye'} size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      {props.error ? <Text style={[styles.error, dir.text, { color: colors.danger }]}>{props.error}</Text> : null}
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
      accessibilityRole="button"
      accessibilityState={{ disabled: props.busy, busy: props.busy }}
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
    <Pressable onPress={props.onPress} accessibilityRole="button" style={styles.link}>
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
  flex: { flex: 1 },
  screen: { flexGrow: 1, padding: spacing.lg, justifyContent: 'center' },
  back: { position: 'absolute', top: spacing.xl, zIndex: 1, alignItems: 'center', minHeight: MIN_TOUCH_TARGET, gap: 2 },
  backStart: { left: spacing.lg },
  backEnd: { right: spacing.lg },
  backText: { fontSize: typography.sizes.md, fontWeight: typography.weights.medium },
  pressed: { opacity: 0.6 },
  brand: { ...display(typography.sizes.xxl), textAlign: 'center' },
  slogan: { fontSize: typography.sizes.sm, textAlign: 'center', marginBottom: spacing.xl, fontStyle: 'italic' },
  hero: { alignSelf: 'center', marginBottom: spacing.md },
  title: { ...display(typography.sizes.lg) },
  centred: { textAlign: 'center' },
  titleAlone: { marginBottom: spacing.md },
  subtitle: { fontSize: typography.sizes.sm, marginTop: spacing.xs, marginBottom: spacing.md, lineHeight: 18 },
  field: { marginBottom: spacing.md },
  label: { fontSize: typography.sizes.sm, marginBottom: spacing.xs },
  input: {
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: typography.sizes.md,
  },
  inputMirrored: { textAlign: 'right' },
  inputWithAffix: { paddingRight: spacing.xl + spacing.md },
  inputWithAffixStart: { paddingLeft: spacing.xl + spacing.md },
  affix: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: spacing.xs },
  affixEnd: { right: spacing.sm },
  affixStart: { left: spacing.sm },
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
  /**
   * A link is still something a finger has to land on.
   *
   * The text is 18pt tall, which was the whole tappable box — well under the
   * 44 a fingertip needs. The box grew and the margin shrank by what it gained,
   * so the words sit where they always did and the target around them does not.
   */
  link: { marginTop: spacing.xs, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.medium },
});
