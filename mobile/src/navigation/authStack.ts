/** Route params for the pre-login stack. */
export type AuthStackParamList = {
  Welcome: undefined;
  /** `email`: what was typed on the screen that sent you here, so it is not typed twice. */
  Login: { email?: string } | undefined;
  Register: undefined;
  ForgotPassword: { email?: string } | undefined;
};

/** The sign-in method choice, kept as the root so Login and Register can go back to it. */
export const AUTH_INITIAL_ROUTE: keyof AuthStackParamList = 'Welcome';
