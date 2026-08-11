import { describe, expect, it } from 'vitest';
import {
  currentStep,
  initOnboardingState,
  isFirstStep,
  isLastStep,
  ONBOARDING_STEPS,
  onboardingReducer,
  persistedFromState,
  shouldShowOnboarding,
  type OnboardingAction,
  type OnboardingState,
} from './flow';

/** Fold a sequence of actions from the initial state. */
function run(...actions: OnboardingAction[]): OnboardingState {
  return actions.reduce(onboardingReducer, initOnboardingState());
}

describe('initOnboardingState', () => {
  it('starts active on the first (language) slide with no language chosen', () => {
    const s = initOnboardingState();
    expect(s).toEqual({
      stepIndex: 0,
      selectedLanguage: null,
      status: 'active',
      completedVia: null,
    });
    expect(currentStep(s)).toBe('language');
    expect(isFirstStep(s)).toBe(true);
  });
});

describe('navigation', () => {
  it('advances through the slides with next', () => {
    expect(currentStep(run({ type: 'next' }))).toBe('welcome');
    expect(currentStep(run({ type: 'next' }, { type: 'next' }))).toBe('notifications');
  });

  it('clamps next at the last slide', () => {
    const s = run({ type: 'next' }, { type: 'next' }, { type: 'next' }, { type: 'next' });
    expect(currentStep(s)).toBe('notifications');
    expect(isLastStep(s)).toBe(true);
    expect(s.stepIndex).toBe(ONBOARDING_STEPS.length - 1);
  });

  it('goes back and clamps at the first slide', () => {
    expect(currentStep(run({ type: 'next' }, { type: 'back' }))).toBe('language');
    expect(currentStep(run({ type: 'back' }))).toBe('language');
  });
});

describe('language selection', () => {
  it('records the chosen locale', () => {
    expect(run({ type: 'selectLanguage', locale: 'ckb' }).selectedLanguage).toBe('ckb');
  });

  it('can be changed before finishing', () => {
    const s = run(
      { type: 'selectLanguage', locale: 'de' },
      { type: 'selectLanguage', locale: 'ku' },
    );
    expect(s.selectedLanguage).toBe('ku');
  });
});

describe('completion', () => {
  it('finish marks completed via finished', () => {
    const s = run({ type: 'next' }, { type: 'next' }, { type: 'finish' });
    expect(s.status).toBe('completed');
    expect(s.completedVia).toBe('finished');
  });

  it('skip at any slide marks completed via skipped, keeping a chosen language', () => {
    const s = run({ type: 'selectLanguage', locale: 'ar' }, { type: 'skip' });
    expect(s.status).toBe('completed');
    expect(s.completedVia).toBe('skipped');
    expect(s.selectedLanguage).toBe('ar');
  });

  it('is inert once completed — late actions cannot re-open it', () => {
    const done = run({ type: 'skip' });
    expect(onboardingReducer(done, { type: 'next' })).toBe(done);
    expect(onboardingReducer(done, { type: 'selectLanguage', locale: 'fr' })).toBe(done);
    expect(onboardingReducer(done, { type: 'finish' })).toBe(done);
  });
});

describe('persistence + gating', () => {
  it('persists the completed flag and preferred language', () => {
    const s = run({ type: 'selectLanguage', locale: 'nl' }, { type: 'finish' });
    expect(persistedFromState(s)).toEqual({ completed: true, preferredLanguage: 'nl' });
  });

  it('does not report completed while still active', () => {
    expect(persistedFromState(initOnboardingState()).completed).toBe(false);
  });

  it('shows onboarding on a fresh install (nothing persisted)', () => {
    expect(shouldShowOnboarding(null)).toBe(true);
  });

  it('shows again when the stored flag says not completed (e.g. after reset)', () => {
    expect(shouldShowOnboarding({ completed: false, preferredLanguage: 'en' })).toBe(true);
  });

  it('never shows again once completed', () => {
    expect(shouldShowOnboarding({ completed: true, preferredLanguage: 'ku' })).toBe(false);
  });
});
