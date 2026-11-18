/**
 * The first-launch intro (Language → Welcome → Notifications) as a pure state machine, plus the shape that is
 * stored. The sign-in choice lives on the auth stack's Welcome screen, which the intro flows into and back out
 * of. Storage is in ./storage.ts.
 */

export type OnboardingStep = 'language' | 'welcome' | 'notifications';

/** Slide order; also the source of truth for the page-indicator count. */
export const ONBOARDING_STEPS: readonly OnboardingStep[] = ['language', 'welcome', 'notifications'];

/** How a finished onboarding ended — for analytics and QA, both mark it done. */
export type CompletedVia = 'finished' | 'skipped';

export interface OnboardingState {
  /** Index into ONBOARDING_STEPS. */
  stepIndex: number;
  /** Locale chosen on the language slide; null until chosen. */
  selectedLanguage: string | null;
  status: 'active' | 'completed';
  /** Set once completed; null while active. */
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
 * Advance the flow. Once completed every action is a no-op, so a late dispatch (from an animation, say) cannot
 * reopen it. `next` clamps at the last slide, where the UI shows Finish, and `back` at the first.
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
  // The reducer keeps stepIndex in range; the fallback only satisfies noUncheckedIndexedAccess.
  return ONBOARDING_STEPS[state.stepIndex] ?? 'language';
}

export function isFirstStep(state: OnboardingState): boolean {
  return state.stepIndex === 0;
}

export function isLastStep(state: OnboardingState): boolean {
  return state.stepIndex === LAST_INDEX;
}

/** Which way the intro turns between two slides; staying put counts as forward. */
export function slideDirection(from: number, to: number): 'forward' | 'back' {
  return to >= from ? 'forward' : 'back';
}

/** What is stored once onboarding ends: the completed flag and the chosen language. Skipping still records both. */
export interface PersistedOnboarding {
  completed: boolean;
  preferredLanguage: string | null;
}
