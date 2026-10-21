/** Route params for the pre-login stack (pure TS for testability). */
export type AuthStackParamList = {
  Welcome: undefined;
  /** `email`: what was typed on the screen that sent you here, so it is not typed twice */
  Login: { email?: string } | undefined;
  Register: undefined;
  ForgotPassword: { email?: string } | undefined;
};

/** The sign-in method choice — kept as the root so Login/Register can go back to it. */
export const AUTH_INITIAL_ROUTE: keyof AuthStackParamList = 'Welcome';
