/** Route params for the pre-login stack (pure TS for testability). */
export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};

/** The sign-in method choice — kept as the root so Login/Register can go back to it. */
export const AUTH_INITIAL_ROUTE: keyof AuthStackParamList = 'Welcome';
