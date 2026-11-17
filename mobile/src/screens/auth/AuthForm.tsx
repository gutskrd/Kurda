import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { Animated, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from '../../theme/Pressable';
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
import { BackButton } from '../../navigation/BackButton';
import { useDirection } from '../../reports/direction';

/** The height of Hevalo's window over the sign-in choice; its width follows. */
const WINDOW_HEIGHT = 150;

/** The entrance rows the head uses (name, hero, title, counted by `useListEntrance`); a screen's own rows count on from here. */
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
  /** The line under the title, as on the website. */
  subtitle?: string;
  children: ReactNode;
  onBack?: () => void;
  /** Shown above the title: a breathing glyph, or Hevalo at his window (the sign-in choice). */
  hero?: IconName | 'hevalo';
  /** What Hevalo says from the window, in a bubble, with lip-sync. */
  says?: string;
}) {
  const { colors } = useTheme();
  // The head rises in row by row; a screen's own buttons may follow on (AUTH_HEAD_ROWS).
  const entering = useListEntrance(true);
  // His greeting plays once the window is there and the screen is in front, never under Reduce Motion.
  const reduce = useReducedMotion();
  const focused = useScreenFocus();
  const speech = useSpokenLine(hero === 'hevalo' && says ? says : null, !reduce && focused);
  /*
   * A hero centres the whole head, matching the centred content below it. Screens with fields have no hero and stay
   * left-aligned, since a centred heading over left-aligned labels would mismatch the other way.
   */
  const centred = Boolean(hero);

  const insets = useSafeAreaInsets();
  const dir = useDirection();
  const mirrored = dir.row === 'row-reverse';
  return (
    <GradientBackground>
      {onBack ? (
        // The app's standard back chevron, on the reading side.
        <View style={[styles.back, { top: insets.top + spacing.sm }, mirrored ? styles.backEnd : styles.backStart]}>
          <BackButton onPress={onBack} />
        </View>
      ) : null}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Scrolls once the form is taller than the screen (e.g. sign-up on a small phone), and stays centred otherwise. */}
        <ScrollView
          // Padding clears the back button above and matches below, so a form that fits stays centred.
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
            /* Hevalo looking in at the window, rising over the sill as the card arrives. */
            <Rise delay={entering(1)} style={styles.hero}>
              <HevaloWindow size={WINDOW_HEIGHT} speech={speech} text={says ?? null} />
              {/* His greeting in a bubble under the sill; the window itself stays decorative. */}
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
 * One labelled field. `autoComplete` (Android) and `textContentType` (iOS) let the keychain and password managers
 * fill it. A secure field gets a show-password toggle, since passwords are easy to mistype on a phone. In a form of
 * several fields, Return says Next and moves on, and Done on the last one submits.
 *
 * A refusal shakes the field once as its error appears, so it is not missed; under Reduce Motion the red edge and
 * the message carry it alone. Mirrors for right-to-left languages.
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
  /** What the keychain should offer here. */
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
  // Shakes once as a refusal appears or changes, not while it stays.
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
          // Next moves on without the keyboard dropping and coming back up.
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
            // The eye stands alone at the field's end, so it reaches past every edge.
            reach="open"
            reachSize={AFFIX_SIZE}
            style={({ pressed }) => [styles.affix, mirrored ? styles.affixStart : styles.affixEnd, pressed && heldDim]}
          >
            <Icon name={reveal ? 'eye-off' : 'eye'} size={AFFIX_ICON} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </Animated.View>
      {props.error ? <Text style={[styles.error, dir.text, { color: colors.danger }]}>{props.error}</Text> : null}
    </View>
  );
}

/** The show-password eye: its glyph size, and its box, as wide as the glyph plus padding and as tall as the field. */
const AFFIX_ICON = 20;
const AFFIX_SIZE = { width: AFFIX_ICON + spacing.xs * 2, height: MIN_TOUCH_TARGET };

/** iOS names the same four things differently. */
const TEXT_CONTENT_TYPE = {
  email: 'emailAddress',
  username: 'username',
  'current-password': 'password',
  'new-password': 'newPassword',
  none: undefined,
} as const;

/** A link under a form; `destructive` is for the irreversible one (deleting the account), the screen's only red. */
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
  // The chevron sits inside its 44-point target, so the target starts short of the gutter and the glyph meets it.
  back: { position: 'absolute', top: spacing.xl, zIndex: 1 },
  backStart: { left: spacing.lg - (MIN_TOUCH_TARGET - 26) / 2 },
  backEnd: { right: spacing.lg - (MIN_TOUCH_TARGET - 26) / 2 },
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
  // A full touch target round 18pt text; the margin shrinks by what the box gains, so the words do not move.
  link: { marginTop: spacing.xs, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.medium },
});
