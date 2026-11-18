import { useEffect, useRef } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useReducedMotion } from '../../a11y/useReducedMotion';
import { useAuth } from '../../auth/AuthContext';
import type { AuthStackParamList } from '../../navigation/authStack';
import { authRouter } from '../../navigation/returnTo';
import { stackOptions } from '../../navigation/stackOptions';
import { useTheme } from '../../theme/ThemeProvider';
import { ClaimAccountScreen } from './ClaimAccountScreen';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';
import { LoginScreen } from './LoginScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

/**
 * A guest signing in to an account they already have, over the app.
 *
 * The sign-in form is the one from before sign-in, unchanged, so it is hosted
 * in a small stack of its own that gives it the routes it reaches for: the
 * reset behind "Forgot your password?", and in place of the sign-up behind
 * "Create account", the claim form — a guest who came to sign in and has no
 * account after all should make this one theirs, not a second one.
 *
 * A sign-in replaces the guest session (AuthContext `login` applies the
 * account's tokens), and the moment the user is no longer a guest the modal
 * has done its job and closes itself. The same when the claim form in here
 * finishes: the account is the guest's own, verified or on its way to the
 * verify-email gate.
 */
export function SignInModal({ email, onExit }: { email?: string; onExit: () => void }): React.JSX.Element {
  const { user } = useAuth();
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const signedInToAccount = user !== null && user.guest !== true;
  // once: the route hands a fresh `onExit` on every render, and closing is not a thing to do twice
  const closed = useRef(false);
  useEffect(() => {
    if (!signedInToAccount || closed.current) return;
    closed.current = true;
    onExit();
  }, [signedInToAccount, onExit]);

  return (
    <Stack.Navigator
      initialRouteName="Login"
      // moving as every stack does, Reduce Motion included (navigation/stackOptions)
      screenOptions={stackOptions(reduceMotion, colors.background)}
      // the claim form's "Sign in" goes back to the sign-in form under it
      UNSTABLE_router={authRouter}
    >
      {/* the form's own back reaches the parent stack and closes the modal */}
      <Stack.Screen name="Login" initialParams={email ? { email } : undefined}>
        {(props) => <LoginScreen {...props} presented />}
      </Stack.Screen>
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="Register">
        {({ navigation }) => (
          <ClaimAccountScreen
            onExit={() => navigation.goBack()}
            onSignIn={(typed) => navigation.navigate('Login', typed ? { email: typed } : undefined)}
            onForgotPassword={(typed) => navigation.navigate('ForgotPassword', { email: typed })}
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
