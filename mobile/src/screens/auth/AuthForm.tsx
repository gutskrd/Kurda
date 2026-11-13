import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HevaloWindow } from '../../characters/HevaloWindow';
import { useReducedMotion } from '../../a11y/useReducedMotion';
import { SpeechBubble } from '../../auth/guide/HevaloGuide';
import { useScreenFocus } from '../../auth/guide/focus';
import { useSpokenLine } from '../../auth/guide/speech';
import { useListEntrance, useShake } from '../../theme/animate';
import { GlassCard, GradientBackground } from '../../theme/glass';
import { BreathingIcon, Icon, type IconName } from '../../theme/Icon';
import { Rise, heldDim } from '../../theme/MotionParts';
import { useTheme } from '../../theme/ThemeProvider';
import { radii, spacing, typography } from '../../theme/tokens';
import { MIN_TOUCH_TARGET } from '../../a11y/a11y';
import { display } from '../../theme/fonts';
import { useI18n } from '../../i18n/I18nContext';
import { useDirection } from '../../reports/direction';
import { pressedDim } from '../../theme/motion';

/** How tall the window Hevalo looks in at is drawn over the sign-in choice; its width follows. */
const WINDOW_HEIGHT = 150;

/**
 * Where a screen's own rows start in the order things rise in: the name and
 * its line, the hero and the title come first (`useListEntrance` counts
 * them), so a screen that rises its buttons in after them counts on from here.
 */
export const AUTH_HEAD_ROWS = 3;

export function AuthScreenShell({
  title,
  subtitle,
  children,
  onBack,
  hero,
  says,
}: {
  title: string;
  /** the line under the title — the browser's auth-head has always had one */
  subtitle?: string;
  children: ReactNode;
  onBack?: () => void;
  /** what stands over the title: a breathing glyph, or Hevalo himself at a village window (the sign-in choice) */
  hero?: IconName | 'hevalo';
  /** what Hevalo says from the window, in a bubble under it, his mouth moving with the words */
  says?: string;
}) {
  const { colors } = useTheme();
  // the head rises in a row at a time, as a list's rows do; a screen's own buttons may follow on (AUTH_HEAD_ROWS)
  const entering = useListEntrance(true);
  // his greeting is said once the window is there, while the screen is in front, and never under Reduce Motion
  const reduce = useReducedMotion();
  const focused = useScreenFocus();
  const speech = useSpokenLine(hero === 'hevalo' && says ? says : null, !reduce && focused);
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
        <Rise delay={entering(0)}>
          <Text style={[styles.brand, { color: colors.primary }]}>Hevalo</Text>
          <Text style={[styles.slogan, { color: colors.textSecondary }]}>Jiyan bi kurdî xweştire</Text>
        </Rise>
        <GlassCard>
          {hero === 'hevalo' ? (
            /*
              Hevalo looking in at the window: we are in the village room and
              he has come to see who is at the door. He comes up over the sill
              as the card arrives, and is alive while the choice is made. A
              glyph of a person stood here, breathing; the app's own character
              is who should greet somebody choosing how to come in.
            */
            <Rise delay={entering(1)} style={styles.hero}>
              <HevaloWindow size={WINDOW_HEIGHT} speech={speech} text={says ?? null} />
              {/* and says hello, in a bubble under the sill: the words are his, the window stays decorative */}
              {says ? <SpeechBubble text={says} tail="top" tone="inset" style={styles.heroBubble} /> : null}
            </Rise>
          ) : hero ? (
            <Rise delay={entering(1)} style={styles.hero}>
              <BreathingIcon name={hero} size={52} tone="primary" />
            </Rise>
          ) : null}
          <Rise delay={entering(2)}>
            <Text
              style={[styles.title, { color: colors.textPrimary }, subtitle ? null : styles.titleAlone, centred && styles.centred]}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: colors.textSecondary }, centred && styles.centred]}>{subtitle}</Text>
            ) : null}
          </Rise>
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
 * Refused, it shakes once as its line appears under it, the way the one field
 * of a sign-in step does: a red sentence alone is easy to miss on a form whose
 * button was just pressed, and a wrong password ought to feel like one. Still
 * under Reduce Motion, where the red edge and the line say it.
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
  // once, as a refusal appears (or is replaced by another): not while its line simply stays
  const shake = useShake();
  const refusal = props.error ?? null;
  const shown = useRef<string | null>(refusal);
  useEffect(() => {
    if (refusal && refusal !== shown.current) shake.run();
    shown.current = refusal;
  }, [refusal, shake]);

  return (
    <View style={styles.field}>
      <Text style={[styles.label, dir.text, { color: colors.textSecondary }]}>{props.label}</Text>
      <Animated.View style={{ transform: [{ translateX: shake.translateX }] }}>
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
            style={({ pressed }) => [styles.affix, mirrored ? styles.affixStart : styles.affixEnd, pressed && heldDim]}
          >
            <Icon name={reveal ? 'eye-off' : 'eye'} size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </Animated.View>
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

/** A link under a form. `destructive` is for the one that cannot be undone (deleting the account): the screen's one red. */
export function LinkText(props: { label: string; onPress: () => void; destructive?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={props.onPress} accessibilityRole="button" style={({ pressed }) => [styles.link, pressed && heldDim]}>
      <Text style={[styles.linkText, { color: props.destructive ? colors.danger : colors.primary }]}>{props.label}</Text>
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
  pressed: { opacity: pressedDim },
  brand: { ...display(typography.sizes.xxl), textAlign: 'center' },
  slogan: { fontSize: typography.sizes.sm, textAlign: 'center', marginBottom: spacing.xl, fontStyle: 'italic' },
  hero: { alignSelf: 'center', alignItems: 'center', marginBottom: spacing.md },
  heroBubble: { marginTop: spacing.md, maxWidth: 260 },
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
