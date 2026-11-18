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
 * A guest signing in to an existing account, over the app. The sign-in form runs in its own small stack that
 * provides its routes: the reset form, and the claim form in place of sign-up, since a guest without an account
 * should claim this one rather than make a second. It closes itself once the user is no longer a guest.
 */
export function SignInModal({ email, onExit }: { email?: string; onExit: () => void }): React.JSX.Element {
  const { user } = useAuth();
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const signedInToAccount = user !== null && user.guest !== true;
  // The route passes a new `onExit` on every render, and it must close only once.
  const closed = useRef(false);
  useEffect(() => {
    if (!signedInToAccount || closed.current) return;
    closed.current = true;
    onExit();
  }, [signedInToAccount, onExit]);

  return (
    <Stack.Navigator
      initialRouteName="Login"
      // Animates as every stack does, Reduce Motion included (navigation/stackOptions).
      screenOptions={stackOptions(reduceMotion, colors.background)}
      // The claim form's "Sign in" goes back to the sign-in form under it.
      UNSTABLE_router={authRouter}
    >
      {/* The form's own back reaches the parent stack and closes the modal. */}
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
