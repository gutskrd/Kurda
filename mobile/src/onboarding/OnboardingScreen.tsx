import { useCallback, useEffect, useReducer, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n/I18nContext';
import { LOCALES, LOCALE_LABEL, RTL_LOCALES, type Locale } from '../i18n/translations';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { colors, radii, spacing, typography } from '../theme/tokens';
import {
  ONBOARDING_STEPS,
  currentStep,
  initOnboardingState,
  isFirstStep,
  isLastStep,
  onboardingReducer,
  type CompletedVia,
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
  complete: (persisted: PersistedOnboarding) => void;
} {
  const [ready, setReady] = useState(false);
  const [needsOnboarding, setNeeds] = useState(false);

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
    void storage.set(persisted);
  }, []);

  return { ready, needsOnboarding, complete };
}

const VALUE_PROPS = [
  'Learn Kurdish a little every day',
  'Play live quiz games with friends',
  'Read stories & poems from the community',
  'Keep your streak and climb the leagues',
];

/** The 3-slide first-launch onboarding (KUR-272/273/274). */
export function OnboardingScreen({ onComplete }: { onComplete: (persisted: PersistedOnboarding) => void }): React.JSX.Element {
  const [state, dispatch] = useReducer(onboardingReducer, undefined, initOnboardingState);
  const { setLocale } = useI18n();
  const step = currentStep(state);

  const end = (via: CompletedVia): void => {
    // compute the record from the current state (dispatch only marks it inert)
    onComplete({ completed: true, preferredLanguage: state.selectedLanguage });
    dispatch(via === 'skipped' ? { type: 'skip' } : { type: 'finish' });
  };

  const selectLanguage = (locale: Locale): void => {
    dispatch({ type: 'selectLanguage', locale });
    setLocale(locale); // live preview + persists the app language (#184)
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <View style={styles.dots}>
          {ONBOARDING_STEPS.map((s, i) => (
            <View key={s} style={[styles.dot, i === state.stepIndex && styles.dotActive]} />
          ))}
        </View>
        {!isLastStep(state) ? (
          <Pressable onPress={() => end('skipped')} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <View style={styles.body}>
        {step === 'language' && <LanguageSlide selected={state.selectedLanguage} onSelect={selectLanguage} />}
        {step === 'welcome' && <WelcomeSlide />}
        {step === 'account' && <AccountSlide onCreate={() => end('finished')} onLogin={() => end('finished')} />}
      </View>

      <View style={styles.nav}>
        {!isFirstStep(state) ? (
          <Pressable onPress={() => dispatch({ type: 'back' })} accessibilityRole="button" style={styles.back}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {!isLastStep(state) && (
          <Pressable onPress={() => dispatch({ type: 'next' })} accessibilityRole="button" style={styles.next}>
            <Text style={styles.nextText}>Continue</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function LanguageSlide({ selected, onSelect }: { selected: string | null; onSelect: (l: Locale) => void }): React.JSX.Element {
  return (
    <View style={styles.slide}>
      <Text style={styles.title}>Choose your language</Text>
      <Text style={styles.subtitle}>You can change this any time in Settings.</Text>
      <ScrollView style={styles.langList} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
        {LOCALES.map((locale) => {
          const active = selected === locale;
          return (
            <Pressable
              key={locale}
              onPress={() => onSelect(locale)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={[styles.langRow, active && styles.langRowActive]}
            >
              <Text style={[styles.langLabel, active && styles.langLabelActive]}>
                {LOCALE_LABEL[locale]}
                {RTL_LOCALES.includes(locale) ? '  ‏(RTL)' : ''}
              </Text>
              {active && <Text style={styles.check}>✓</Text>}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function WelcomeSlide(): React.JSX.Element {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setI((n) => (n + 1) % VALUE_PROPS.length), 2600);
    return () => clearInterval(id);
  }, [reduce]);

  return (
    <View style={[styles.slide, styles.centered]}>
      <Text style={styles.brand}>Kurda 🌿</Text>
      <Text style={styles.tagline}>Jiyan bi kurdî xweştire</Text>
      {reduce ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          {VALUE_PROPS.map((p) => (
            <Text key={p} style={styles.prop}>
              • {p}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={[styles.prop, styles.propRotating]}>{VALUE_PROPS[i]}</Text>
      )}
    </View>
  );
}

function AccountSlide({ onCreate, onLogin }: { onCreate: () => void; onLogin: () => void }): React.JSX.Element {
  return (
    <View style={[styles.slide, styles.centered]}>
      <Text style={styles.title}>Ready to start?</Text>
      <Text style={styles.subtitle}>Create an account to save your progress, or sign in.</Text>
      <View style={{ gap: spacing.md, marginTop: spacing.xl, alignSelf: 'stretch' }}>
        <Pressable onPress={onCreate} accessibilityRole="button" style={styles.primaryCta}>
          <Text style={styles.primaryCtaText}>Continue with email</Text>
        </Pressable>
        <Pressable onPress={onLogin} accessibilityRole="button" style={styles.secondaryCta}>
          <Text style={styles.secondaryCtaText}>I already have an account</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.lg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: radii.pill, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary, width: 20 },
  skip: { color: colors.textSecondary, fontSize: typography.sizes.md, fontWeight: typography.weights.medium },
  body: { flex: 1, justifyContent: 'center' },
  slide: { flex: 1, justifyContent: 'center' },
  centered: { alignItems: 'center' },
  title: { fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold, color: colors.textPrimary, textAlign: 'center' },
  subtitle: { fontSize: typography.sizes.md, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
  langList: { alignSelf: 'stretch', marginTop: spacing.lg, maxHeight: 360 },
  langRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  langRowActive: { borderColor: colors.primary, backgroundColor: colors.surface },
  langLabel: { fontSize: typography.sizes.lg, color: colors.textPrimary },
  langLabelActive: { fontWeight: typography.weights.bold, color: colors.primary },
  check: { color: colors.primary, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  brand: { fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold, color: colors.primary },
  tagline: { fontSize: typography.sizes.lg, color: colors.textSecondary, marginTop: spacing.xs, fontStyle: 'italic' },
  prop: { fontSize: typography.sizes.md, color: colors.textPrimary, textAlign: 'center' },
  propRotating: { marginTop: spacing.xl, fontSize: typography.sizes.lg, fontWeight: typography.weights.medium, minHeight: 56 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  back: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  backText: { color: colors.textSecondary, fontSize: typography.sizes.md, fontWeight: typography.weights.medium },
  next: { flex: 1, backgroundColor: colors.primary, paddingVertical: spacing.md, borderRadius: radii.md, alignItems: 'center' },
  nextText: { color: colors.textOnPrimary, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  primaryCta: { backgroundColor: colors.primary, paddingVertical: spacing.md, borderRadius: radii.md, alignItems: 'center' },
  primaryCtaText: { color: colors.textOnPrimary, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  secondaryCta: { paddingVertical: spacing.md, borderRadius: radii.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  secondaryCtaText: { color: colors.textPrimary, fontSize: typography.sizes.md, fontWeight: typography.weights.medium },
});
