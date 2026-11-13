import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { haptic } from '../feedback/haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../i18n/I18nContext';
import { LOCALES, LOCALE_LABEL, type Locale, type TranslationKey } from '../i18n/translations';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { Drift } from '../auth/guide/Drift';
import { useScreenFocus } from '../auth/guide/focus';
import { HevaloGuide, SpeechBubble } from '../auth/guide/HevaloGuide';
import { useSpokenLine } from '../auth/guide/speech';
import { SpeakingCharacter } from '../characters/SpeakingCharacter';
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
 * First-launch gate (KUR-271): reads the persisted onboarding record once and
 * exposes `complete()` so the app root can show onboarding before auth and never
 * again after. Mirrors the AuthProvider restore pattern.
 */
export function useOnboarding(): {
  ready: boolean;
  needsOnboarding: boolean;
  /** step to mount onboarding at when re-opened from the auth choice; null = normal start */
  reopenStep: OnboardingStep | null;
  complete: (persisted: PersistedOnboarding) => void;
  /** re-show the intro from the auth stack (e.g. "‹ Back" on the Welcome choice) */
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

/** What the app is, one line to a slide. Keys, so the intro speaks the
 *  language chosen on the slide before it. */
const VALUE_PROPS: readonly TranslationKey[] = [
  'onboarding.prop.learn',
  'onboarding.prop.play',
  'onboarding.prop.read',
  'onboarding.prop.streak',
];

/** How tall Hevalo stands on the welcome slide, head to the tops of his legs. */
const HERO_HEIGHT = 200;

/** The lines under his name follow each other a little further apart than rows in a list do: each is read, not scanned. */
const LINE_STAGGER_MS = ENTRANCE.staggerMs * 2;

/**
 * The 3-slide first-launch intro (KUR-272/273), on the glass theme. `initialStep`
 * lets the auth Welcome choice re-open it partway (at the intro) so "‹ Back"
 * walks all the way back to the language chooser.
 *
 * The slides turn rather than swap: the one leaving moves out the way the
 * reader is going and the next rises into its place (SlideSwap), and the
 * dots at the top say where they are with a capsule that slides along them.
 *
 * Hevalo is the guide through them: on each slide he says its line, his
 * mouth moving with the words (auth/guide), and each slide's art floats and
 * arrives a little further than the words, so the intro has depth rather
 * than being three still cards. All of it stops under Reduce Motion.
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

  // which way the last turn went, for the slide leaving: told from the slide before it
  const shown = useRef(state.stepIndex);
  const turned = useRef<SlideDirection>('forward');
  // whether any slide has turned yet: the first one's art is simply there, the later ones' arrive with the turn
  const turns = useRef(0);
  if (shown.current !== state.stepIndex) {
    turned.current = slideDirection(shown.current, state.stepIndex);
    shown.current = state.stepIndex;
    turns.current += 1;
  }
  const arriving = turns.current > 0 ? turned.current : null;

  const end = (via: CompletedVia): void => {
    // compute the record from the current state (dispatch only marks it inert);
    // fall back to the live app locale so re-opening never wipes the language
    onComplete({ completed: true, preferredLanguage: state.selectedLanguage ?? locale });
    dispatch(via === 'skipped' ? { type: 'skip' } : { type: 'finish' });
  };

  const selectLanguage = (locale: Locale): void => {
    dispatch({ type: 'selectLanguage', locale });
    setLocale(locale); // live preview + persists the app language (#184)
  };

  return (
    <GradientBackground>
      <View style={[styles.screen, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.topBar}>
          <Dots count={ONBOARDING_STEPS.length} index={state.stepIndex} mirrored={dir.rtl} />
          {!isLastStep(state) ? (
            <Pressable
              onPress={() => end('skipped')}
              accessibilityRole="button"
              // one 20-point line of words, caught at a fingertip's 44
              hitSlop={12}
              style={({ pressed }) => pressed && heldDim}
            >
              <Text style={[styles.skip, { color: colors.textSecondary }]}>{t('common.skip')}</Text>
            </Pressable>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        <SlideSwap id={step} direction={turned.current} mirrored={dir.rtl} style={styles.body}>
          {step === 'language' && <LanguageSlide selected={state.selectedLanguage} onSelect={selectLanguage} arriving={arriving} mirrored={dir.rtl} />}
          {step === 'welcome' && <WelcomeSlide arriving={arriving} mirrored={dir.rtl} />}
          {step === 'notifications' && <NotificationsSlide arriving={arriving} mirrored={dir.rtl} />}
        </SlideSwap>

        <View style={styles.nav}>
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
 * Which slide this is, of how many: a dot for each, and over the one showing
 * a capsule in the brand's colour that slides along to the next.
 *
 * The capsule used to be the dot itself, drawn wider — which jumped from one
 * dot to the next, since a width is laid out and not moved. The capsule is
 * its own shape of one width, and travels on a transform, the way the
 * segmented control's does: on the native driver, and simply there under
 * Reduce Motion. Decorative: the slides say what they are.
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

/** How a slide arrived, for its art: the way it turned in, or null for the slide the intro opened on. */
interface SlideArrival {
  arriving: SlideDirection | null;
  mirrored: boolean;
}

/**
 * The language choice, with Hevalo at the top asking which language to talk
 * in — in the language of the moment, so the question changes under him as
 * a language is tapped, and he says the new one. A globe stood here, breathing;
 * the app's own guide is who should ask the first question.
 */
function LanguageSlide({ selected, onSelect, arriving, mirrored }: { selected: string | null; onSelect: (l: Locale) => void } & SlideArrival): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
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
            // gives a little under the finger, and ticks when the choice changes
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
                { backgroundColor: colors.controlTrack, borderColor: active ? colors.primary : colors.glassBorder },
              ]}
            >
              <Text style={[styles.langLabel, { color: active ? colors.primary : colors.textPrimary }, active && styles.langLabelActive]}>
                {/* each language in its own name and its own direction — nothing technical beside it */}
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
 * Hevalo himself, with his name and what the app is in four lines.
 *
 * A book glyph used to stand here, and the four lines took turns, one every
 * two and a half seconds — which meant reading at the slide's pace rather
 * than one's own, and seeing one line only unless one waited. Now all four
 * are there, rising in one after another as the slide arrives, and Hevalo
 * stands over them, alive: he breathes, blinks, glances about, greets a
 * tap, and says hello — a bubble over his head, his mouth moving with the
 * words — while he floats a little, as the art of every slide does. Under
 * Reduce Motion the lines are simply there and he stands still.
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
        <SpeakingCharacter
          speaker="hevalo"
          player={speech.player}
          playing={speech.playing}
          source={speech.source}
          text={hello}
          crop="half"
          height={HERO_HEIGHT}
          onPress={greeted}
          style={styles.hero}
        />
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

/** Soft-ask notifications intro (KUR-095 onboarding). Informational — no OS
 *  prompt here, before there is anything to be reminded of. The system prompt
 *  comes after a lesson, from a card that can be turned down, or from the
 *  control at the top of Settings → Notification settings (push/). */
function NotificationsSlide({ arriving, mirrored }: SlideArrival): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={[styles.slide, styles.centered]}>
      <HevaloGuide says={t('guide.intro.notify.says')} style={styles.guideArt} />
      {/* one breath as the slide arrives, then still but for the float: there are three lines to read under it */}
      <Drift direction={arriving} mirrored={mirrored} style={styles.notifArt}>
        <BreathingIcon name="bell" size={56} tone="primary" breaths={1} />
      </Drift>
      <Text style={[styles.title, { color: colors.textPrimary }, styles.notifTitle]}>{t('onboarding.notify.title')}</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('onboarding.notify.body')}</Text>
      <Text style={[styles.notifHint, { color: colors.textSecondary }]}>{t('onboarding.notify.later')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.lg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  dots: { flexDirection: 'row', gap: DOT_GAP },
  dotSlot: { width: DOT_SLOT, height: DOT, alignItems: 'center', justifyContent: 'center' },
  dot: { width: DOT, height: DOT, borderRadius: radii.pill },
  // over the dots, free to travel between them
  dotActive: { position: 'absolute', left: 0, top: 0, width: DOT_SLOT, height: DOT, borderRadius: radii.pill },
  skip: { fontSize: typography.sizes.md, fontWeight: typography.weights.medium },
  body: { flex: 1, justifyContent: 'center' },
  slide: { flex: 1, justifyContent: 'center' },
  centered: { alignItems: 'center' },
  // Hevalo and his bubble take the slide's width, as a row; the art under him floats in the middle
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  langLabel: { flexShrink: 1, fontSize: typography.sizes.lg, writingDirection: 'auto' },
  langLabelActive: { fontWeight: typography.weights.bold },
  brand: { ...display(typography.sizes.xxl) },
  tagline: { fontSize: typography.sizes.lg, marginTop: spacing.xs, fontStyle: 'italic', marginBottom: spacing.lg },
  propList: { marginTop: spacing.sm, gap: spacing.sm, alignItems: 'center', paddingHorizontal: spacing.lg },
  prop: { fontSize: typography.sizes.md, textAlign: 'center' },
  nav: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  back: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  backText: { fontSize: typography.sizes.md, fontWeight: typography.weights.medium },
  next: { flex: 1 },
});
