/** Route params for the pre-login stack (pure TS for testability). */
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};

export const AUTH_INITIAL_ROUTE: keyof AuthStackParamList = 'Login';
