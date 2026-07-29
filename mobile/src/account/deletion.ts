/**
 * In-app account deletion flow (KUR-275) — pure state machine. Apple requires a
 * user-initiated account deletion path in the app, with a clear warning and
 * confirmation, working across every sign-in provider (Apple / Google / Email).
 * This module owns the step logic (warning → re-authenticate → typed
 * confirmation → delete) as a pure reducer; the RN screens and the actual
 * re-auth + delete calls (GDPR deletion #024) are thin wrappers.
 */

export type AuthProvider = 'apple' | 'google' | 'email';

export type DeletionStep = 'warning' | 'reauth' | 'confirm' | 'deleting' | 'done' | 'error';

/** The ordered steps shown for the flow (same sequence for every provider). */
export const DELETION_STEPS: readonly DeletionStep[] = [
  'warning',
  'reauth',
  'confirm',
  'deleting',
  'done',
];

/** How the user re-authenticates before deletion, by provider. */
export function reauthMethod(provider: AuthProvider): 'password' | 'provider-token' {
  return provider === 'email' ? 'password' : 'provider-token';
}

/** The phrase the user must type to confirm (localizable; default English). */
export const CONFIRM_PHRASE = 'DELETE';

/** Case-insensitive, trimmed match of the typed confirmation. */
export function confirmationValid(input: string, expected: string = CONFIRM_PHRASE): boolean {
  return input.trim().toUpperCase() === expected.trim().toUpperCase();
}

export type DeletionErrorKind = 'reauth-failed' | 'confirmation-mismatch' | 'delete-failed';

export interface DeletionState {
  provider: AuthProvider;
  step: DeletionStep;
  /** set when step is 'error', or a transient confirm-screen error */
  error?: DeletionErrorKind;
}

export function initDeletionState(provider: AuthProvider): DeletionState {
  return { provider, step: 'warning' };
}

export type DeletionAction =
  | { type: 'start' }
  | { type: 'reauthSucceeded' }
  | { type: 'reauthFailed' }
  | { type: 'submitConfirm'; input: string }
  | { type: 'deleteSucceeded' }
  | { type: 'deleteFailed' }
  | { type: 'cancel' };

/**
 * Advance the deletion flow. The user acknowledges the warning (`start`), then
 * re-authenticates, then types the confirmation phrase, then the delete runs.
 * A failed re-auth or delete moves to `error` (retryable with `start`); a
 * mismatched confirmation keeps the user on the confirm step with a transient
 * error. `cancel` aborts back to the warning from any non-terminal step.
 */
export function deletionReducer(state: DeletionState, action: DeletionAction): DeletionState {
  if (action.type === 'cancel') {
    return state.step === 'done' ? state : { provider: state.provider, step: 'warning' };
  }

  switch (state.step) {
    case 'warning':
      if (action.type === 'start') return { ...state, step: 'reauth', error: undefined };
      return state;

    case 'reauth':
      if (action.type === 'reauthSucceeded') return { ...state, step: 'confirm', error: undefined };
      if (action.type === 'reauthFailed') return { ...state, step: 'error', error: 'reauth-failed' };
      return state;

    case 'confirm':
      if (action.type === 'submitConfirm') {
        return confirmationValid(action.input)
          ? { ...state, step: 'deleting', error: undefined }
          : { ...state, error: 'confirmation-mismatch' };
      }
      return state;

    case 'deleting':
      if (action.type === 'deleteSucceeded') return { ...state, step: 'done', error: undefined };
      if (action.type === 'deleteFailed') return { ...state, step: 'error', error: 'delete-failed' };
      return state;

    case 'error':
      // retry from the top of the interactive flow
      if (action.type === 'start') return { ...state, step: 'reauth', error: undefined };
      return state;

    case 'done':
      return state;

    default:
      return state;
  }
}
