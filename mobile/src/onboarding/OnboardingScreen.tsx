import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { haptic } from '../feedback/haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../i18n/I18nContext';
import { LOCALES, LOCALE_LABEL, type Locale, type TranslationKey } from '../i18n/translations';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { Drift } from '../auth/guide/Drift';
import { useScreenFocus } from '../auth/guide/focus';
import { HevaloGuide, SpeechBubble } from '../auth/guide/HevaloGuide';
import { useSpokenLine } from '../auth/guide/speech';
import { HevaloPeek } from '../characters/HevaloPeek';
import { useDirection } from '../reports/direction';
import { springTo } from '../theme/animate';
import { ClayButton, GradientBackground } from '../theme/glass';
import { BreathingIcon, Icon } from '../theme/Icon';
import { ENTRANCE } from '../theme/motion';
import { PressableScale, Rise, heldDim } from '../theme/MotionParts';
import { SlideSwap, type SlideDirection } from '../theme/SlideSwap';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { display } from '../theme/fonts';
import {
  ONBOARDING_STEPS,
  currentStep,
  initOnboardingState,
  isFirstStep,
  isLastStep,
  onboardingReducer,
  slideDirection,
  type CompletedVia,
  type OnboardingStep,
  type PersistedOnboarding,
} from './flow';
import { createOnboardingStorage } from './storage';

const storage = createOnboardingStorage();

/**
 * The first-launch gate: reads the stored onboarding record once and exposes `complete()`, so the root shows
 * onboarding before auth and never again. Follows the AuthProvider restore pattern.
 */
export function useOnboarding(): {
  ready: boolean;
  needsOnboarding: boolean;
  /** Step to mount onboarding at when re-opened from the auth choice; null = normal start. */
  reopenStep: OnboardingStep | null;
  complete: (persisted: PersistedOnboarding) => void;
  /** Re-show the intro from the auth stack (e.g. "‹ Back" on the Welcome choice). */
  reopen: (step: OnboardingStep) => void;
} {
  const [ready, setReady] = useState(false);
  const [needsOnboarding, setNeeds] = useState(false);
  const [reopenStep, setReopenStep] = useState<OnboardingStep | null>(null);

  useEffect(() => {
    let active = true;
    void storage.get().then((persisted) => {
      if (!active) return;
      setNeeds(!persisted || !persisted.completed);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const complete = useCallback((persisted: PersistedOnboarding) => {
    setNeeds(false);
    setReopenStep(null);
    void storage.set(persisted);
  }, []);

  const reopen = useCallback((step: OnboardingStep) => {
    setReopenStep(step);
    setNeeds(true);
  }, []);

  return { ready, needsOnboarding, reopenStep, complete, reopen };
}

/** What the app is, one line per slide, as keys so the intro uses the language chosen on the slide before. */
const VALUE_PROPS: readonly TranslationKey[] = [
  'onboarding.prop.learn',
  'onboarding.prop.play',
  'onboarding.prop.read',
  'onboarding.prop.streak',
];

/** How tall Hevalo stands on the welcome slide, head to the tops of his legs. */
const HERO_HEIGHT = 200;

/** The lines under his name sit a little further apart than list rows: each is read, not scanned. */
const LINE_STAGGER_MS = ENTRANCE.staggerMs * 2;

/** Skip is drawn one line of the body size tall, about this. */
const SKIP_LINE = { height: 20 };

/**
 * The three-slide first-launch intro on the glass theme. `initialStep` lets the auth Welcome screen reopen it at
 * the intro, so "‹ Back" still walks back to the language chooser.
 *
 * Slides turn rather than swap (SlideSwap), and a capsule slides along the dots at the top. Hevalo says each
 * slide's line with lip-sync (auth/guide), and each slide's art floats and arrives a little after the text. All
 * motion stops under Reduce Motion.
 */
export function OnboardingScreen({
  onComplete,
  initialStep,
}: {
  onComplete: (persisted: PersistedOnboarding) => void;
  initialStep?: OnboardingStep | null;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const dir = useDirection();
  const [state, dispatch] = useReducer(onboardingReducer, initialStep, (start) => {
    const base = initOnboardingState();
    const idx = start ? ONBOARDING_STEPS.indexOf(start) : 0;
    return { ...base, stepIndex: idx >= 0 ? idx : 0 };
  });
  const { locale, setLocale } = useI18n();
  const step = currentStep(state);

  // Which way the last turn went, for the slide leaving: told from the slide before it.
  const shown = useRef(state.stepIndex);
  const turned = useRef<SlideDirection>('forward');
  // Whether any slide has turned yet: the first slide's art is just there, later ones arrive with the turn.
  const turns = useRef(0);
  if (shown.current !== state.stepIndex) {
    turned.current = slideDirection(shown.current, state.stepIndex);
    shown.current = state.stepIndex;
    turns.current += 1;
  }
  const arriving = turns.current > 0 ? turned.current : null;

  const end = (via: CompletedVia): void => {
    // Build the record from the current state (dispatch only makes it inert), falling back to the live app locale
    // so reopening never wipes the language.
    onComplete({ completed: true, preferredLanguage: state.selectedLanguage ?? locale });
    dispatch(via === 'skipped' ? { type: 'skip' } : { type: 'finish' });
  };

  const selectLanguage = (locale: Locale): void => {
    dispatch({ type: 'selectLanguage', locale });
    setLocale(locale); // Live preview; also saves the app language.
  };

  return (
    <GradientBackground>
      <View style={[styles.screen, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg }]}>
        {/* The dots sit on the reading-start side and Skip at the far end; the controls below are mirrored too. */}
        <View style={[styles.topBar, { flexDirection: dir.row }]}>
          <Dots count={ONBOARDING_STEPS.length} index={state.stepIndex} mirrored={dir.rtl} />
          {!isLastStep(state) ? (
            <Pressable
              onPress={() => end('skipped')}
              accessibilityRole="button"
              // A single 20 pt line of text at the bar's end answers over 48 of height and a little past its ends.
              reach="open"
              reachSize={SKIP_LINE}
              style={({ pressed }) => pressed && heldDim}
            >
              <Text style={[styles.skip, { color: colors.textSecondary }]}>{t('common.skip')}</Text>
            </Pressable>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        <SlideSwap id={step} direction={turned.current} mirrored={dir.rtl} style={styles.body}>
          {/* The language the app is in until another is tapped: it is the one Continue keeps. */}
          {step === 'language' && <LanguageSlide selected={state.selectedLanguage ?? locale} onSelect={selectLanguage} arriving={arriving} mirrored={dir.rtl} />}
          {step === 'welcome' && <WelcomeSlide arriving={arriving} mirrored={dir.rtl} />}
          {step === 'notifications' && <NotificationsSlide arriving={arriving} mirrored={dir.rtl} />}
        </SlideSwap>

        <View style={[styles.nav, { flexDirection: dir.row }]}>
          {!isFirstStep(state) ? (
            <Pressable onPress={() => dispatch({ type: 'back' })} accessibilityRole="button" style={({ pressed }) => [styles.back, pressed && heldDim]}>
              <Text style={[styles.backText, { color: colors.textSecondary }]}>{t('common.back')}</Text>
            </Pressable>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {isLastStep(state) ? (
            <ClayButton label={t('nav.register')} tone="primary" onPress={() => end('finished')} style={styles.next} />
          ) : (
            <ClayButton label={t('common.continue')} tone="primary" onPress={() => dispatch({ type: 'next' })} style={styles.next} />
          )}
        </View>
      </View>
    </GradientBackground>
  );
}

/** A dot, the slot each dot has (the capsule's width), and the air between slots. */
const DOT = 8;
const DOT_SLOT = 18;
const DOT_GAP = 4;

/** Where the capsule sits for the slide at `index`, from the left of the dots. */
function dotSlotX(index: number, count: number, mirrored: boolean): number {
  return (mirrored ? count - 1 - index : index) * (DOT_SLOT + DOT_GAP);
}

/**
 * Which slide of how many: a dot for each, with a brand-coloured capsule that slides to the current one. The
 * capsule moves by transform on the native driver, like the segmented control's, and jumps under Reduce Motion.
 * Decorative: the slides say what they are.
 */
function Dots({ count, index, mirrored }: { count: number; index: number; mirrored: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const x = useRef(new Animated.Value(dotSlotX(index, count, mirrored))).current;
  useEffect(() => {
    const to = dotSlotX(index, count, mirrored);
    if (reduce) {
      x.setValue(to);
      return;
    }
    const slide = springTo(x, to, 'chrome');
    slide.start();
    return () => slide.stop();
  }, [index, count, mirrored, reduce, x]);
  return (
    <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.dotSlot}>
          <View style={[styles.dot, { backgroundColor: colors.controlTrack }]} />
        </View>
      ))}
      <Animated.View style={[styles.dotActive, { backgroundColor: colors.primary, transform: [{ translateX: x }] }]} testID="onboarding-dots-active" />
    </View>
  );
}

/** How a slide arrived, for its art: the direction it turned in, or null for the slide the intro opened on. */
interface SlideArrival {
  arriving: SlideDirection | null;
  mirrored: boolean;
}

/**
 * The language choice, with Hevalo asking which language to use, in the selected language, so the question
 * changes as a language is tapped.
 */
function LanguageSlide({ selected, onSelect, arriving, mirrored }: { selected: string | null; onSelect: (l: Locale) => void } & SlideArrival): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  // Each name in its own direction, aligned with the page; the tick closes the row on the far side.
  const dir = useDirection();
  return (
    <View style={styles.slide}>
      <Drift direction={arriving} mirrored={mirrored} style={styles.guideArt}>
        <HevaloGuide says={t('guide.intro.language.says')} />
      </Drift>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{t('onboarding.language.title')}</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('onboarding.language.help')}</Text>
      <ScrollView style={styles.langList} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
        {LOCALES.map((locale) => {
          const active = selected === locale;
          return (
            // Gives a little under the finger, and ticks when the choice changes.
            <PressableScale
              key={locale}
              onPress={() => {
                if (!active) haptic('select');
                onSelect(locale);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={LOCALE_LABEL[locale]}
              style={[
                styles.langRow,
                { flexDirection: dir.row, backgroundColor: colors.controlTrack, borderColor: active ? colors.primary : colors.glassBorder },
              ]}
            >
              <Text style={[styles.langLabel, dir.free, { color: active ? colors.primary : colors.textPrimary }, active && styles.langLabelActive]}>
                {/* Each language in its own name and its own direction — nothing technical beside it. */}
                {LOCALE_LABEL[locale]}
              </Text>
              {active ? <Icon name="check" size={22} color={colors.primary} /> : null}
            </PressableScale>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** The greeting is the whole answer to a tap on Hevalo here: there is nothing to say again. */
const greeted = (): void => undefined;

/**
 * Hevalo with his name and what the app is in four lines. The lines rise in one after another as the slide
 * arrives, and Hevalo breathes, blinks, glances, greets a tap and says hello with lip-sync while floating like
 * every slide's art. Under Reduce Motion the lines are just there and he stands still.
 */
function WelcomeSlide({ arriving, mirrored }: SlideArrival): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const focused = useScreenFocus();
  const hello = t('guide.intro.welcome.says');
  const speech = useSpokenLine(hello, !reduce && focused);
  return (
    <View style={[styles.slide, styles.centered]}>
      <SpeechBubble text={hello} tail="bottom" style={styles.heroBubble} />
      <Drift direction={arriving} mirrored={mirrored}>
        {/* Through a tear in the page, rather than cut off at the legs and floating. */}
        <HevaloPeek size={HERO_HEIGHT} speech={speech} text={hello} onPress={greeted} style={styles.hero} />
      </Drift>
      <Text style={[styles.brand, { color: colors.primary }]}>Hevalo</Text>
      <Text style={[styles.tagline, { color: colors.textSecondary }]}>Jiyan bi kurdî xweştire</Text>
      <View style={styles.propList}>
        {VALUE_PROPS.map((p, i) => (
          <Rise key={p} delay={reduce ? null : i * LINE_STAGGER_MS}>
            <Text style={[styles.prop, { color: colors.textSecondary }]}>{t(p)}</Text>
          </Rise>
        ))}
      </View>
    </View>
  );
}

/**
 * The notifications intro, informational only: no OS prompt here. The system prompt comes after a lesson, from a
 * screen whose one button leads to it, or from the control at the top of Settings → Notification settings
 * (push/).
 */
function NotificationsSlide({ arriving, mirrored }: SlideArrival): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={[styles.slide, styles.centered]}>
      <HevaloGuide says={t('guide.intro.notify.says')} style={styles.guideArt} />
      {/* One breath as the slide arrives, then still apart from the float: there are two lines to read under it. */}
      <Drift direction={arriving} mirrored={mirrored} style={styles.notifArt}>
        <BreathingIcon name="bell" size={56} tone="primary" breaths={1} />
      </Drift>
      <Text style={[styles.title, { color: colors.textPrimary }, styles.notifTitle]}>{t('onboarding.notify.title')}</Text>
      {/* Hevalo has just said what a reminder is in the bubble above, so the slide does not repeat it. */}
      <Text style={[styles.notifHint, { color: colors.textSecondary }]}>{t('onboarding.notify.later')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.lg },
  topBar: { alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  dots: { flexDirection: 'row', gap: DOT_GAP },
  dotSlot: { width: DOT_SLOT, height: DOT, alignItems: 'center', justifyContent: 'center' },
  dot: { width: DOT, height: DOT, borderRadius: radii.pill },
  // Over the dots, free to travel between them.
  dotActive: { position: 'absolute', left: 0, top: 0, width: DOT_SLOT, height: DOT, borderRadius: radii.pill },
  skip: { fontSize: typography.sizes.md, fontWeight: typography.weights.medium },
  body: { flex: 1, justifyContent: 'center' },
  slide: { flex: 1, justifyContent: 'center' },
  centered: { alignItems: 'center' },
  // Hevalo and his bubble take the slide's width, as a row; the art under him floats in the middle.
  guideArt: { alignSelf: 'stretch', alignItems: 'stretch', marginBottom: spacing.lg },
  notifArt: { marginTop: spacing.sm },
  heroBubble: { marginBottom: spacing.md, maxWidth: 300 },
  hero: { marginBottom: spacing.sm },
  title: { ...display(typography.sizes.xxl), textAlign: 'center' },
  notifTitle: { marginTop: spacing.lg },
  notifHint: { fontSize: typography.sizes.sm, textAlign: 'center', marginTop: spacing.lg, fontStyle: 'italic' },
  subtitle: { fontSize: typography.sizes.md, textAlign: 'center', marginTop: spacing.sm },
  langList: { alignSelf: 'stretch', marginTop: spacing.lg, maxHeight: 360 },
  langRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  langLabel: { flexShrink: 1, fontSize: typography.sizes.lg },
  langLabelActive: { fontWeight: typography.weights.bold },
  brand: { ...display(typography.sizes.xxl) },
  tagline: { fontSize: typography.sizes.lg, marginTop: spacing.xs, fontStyle: 'italic', marginBottom: spacing.lg },
  propList: { marginTop: spacing.sm, gap: spacing.sm, alignItems: 'center', paddingHorizontal: spacing.lg },
  prop: { fontSize: typography.sizes.md, textAlign: 'center' },
  nav: { alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  back: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  backText: { fontSize: typography.sizes.md, fontWeight: typography.weights.medium },
  next: { flex: 1 },
});
