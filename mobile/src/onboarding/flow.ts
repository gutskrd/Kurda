/**
 * First-launch onboarding flow (KUR-271). Pure state machine for the 2-slide
 * intro (Language → Welcome) plus the first-launch gating and the shape that
 * gets persisted. The sign-in method choice that used to be a third slide now
 * lives on the auth stack's Welcome screen, so the intro flows straight into
 * it (and back out again). No storage, no navigation, no React here — the app
 * root feeds actions in and reads state out, so the whole flow is
 * unit-testable. The slides themselves are KUR-272 / 273; storage lives in
 * ./storage.ts.
 */

export type OnboardingStep = 'language' | 'welcome';

/** Slide order; also the source of truth for the page-indicator count. */
export const ONBOARDING_STEPS: readonly OnboardingStep[] = ['language', 'welcome'];

/** How a finished onboarding ended — for analytics and QA, both mark it done. */
export type CompletedVia = 'finished' | 'skipped';

export interface OnboardingState {
  /** index into ONBOARDING_STEPS. */
  stepIndex: number;
  /** locale code chosen on the language slide (#272); null until chosen. */
  selectedLanguage: string | null;
  status: 'active' | 'completed';
  /** set once completed; null while active. */
  completedVia: CompletedVia | null;
}

export type OnboardingAction =
  | { type: 'selectLanguage'; locale: string }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'skip' }
  | { type: 'finish' };

export function initOnboardingState(): OnboardingState {
  return { stepIndex: 0, selectedLanguage: null, status: 'active', completedVia: null };
}

const LAST_INDEX = ONBOARDING_STEPS.length - 1;

/**
 * Advance the flow. Once completed the flow is inert — every action is a no-op
 * so a late dispatch (e.g. an in-flight animation) can never re-open a
 * finished onboarding. `next` clamps at the last slide (the UI shows Finish
 * there, which dispatches `finish`); `back` clamps at the first.
 */
export function onboardingReducer(
  state: OnboardingState,
  action: OnboardingAction,
): OnboardingState {
  if (state.status === 'completed') return state;

  switch (action.type) {
    case 'selectLanguage':
      return { ...state, selectedLanguage: action.locale };
    case 'next':
      return { ...state, stepIndex: Math.min(state.stepIndex + 1, LAST_INDEX) };
    case 'back':
      return { ...state, stepIndex: Math.max(state.stepIndex - 1, 0) };
    case 'skip':
      return { ...state, status: 'completed', completedVia: 'skipped' };
    case 'finish':
      return { ...state, status: 'completed', completedVia: 'finished' };
    default:
      return state;
  }
}

export function currentStep(state: OnboardingState): OnboardingStep {
  // stepIndex is always clamped in-range by the reducer; the literal fallback
  // just satisfies noUncheckedIndexedAccess.
  return ONBOARDING_STEPS[state.stepIndex] ?? 'language';
}

export function isFirstStep(state: OnboardingState): boolean {
  return state.stepIndex === 0;
}

export function isLastStep(state: OnboardingState): boolean {
  return state.stepIndex === LAST_INDEX;
}

/**
 * What persists once onboarding ends: the completed flag (so it never shows
 * again) and the chosen language (saved as the preferred app language, #184).
 * Skipping still records completion — and any language picked before skipping.
 */
export interface PersistedOnboarding {
  completed: boolean;
  preferredLanguage: string | null;
}

export function persistedFromState(state: OnboardingState): PersistedOnboarding {
  return {
    completed: state.status === 'completed',
    preferredLanguage: state.selectedLanguage,
  };
}

/**
 * First-launch gate. Show onboarding when nothing is persisted yet (fresh
 * install) or the stored flag says it was never completed. Resetting from
 * Settings (#270) clears the record, so the next launch shows it again.
 */
export function shouldShowOnboarding(persisted: PersistedOnboarding | null): boolean {
  return !persisted || !persisted.completed;
}
