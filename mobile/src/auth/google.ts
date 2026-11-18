import { Platform } from 'react-native';
import type { GoogleResult } from './googleTypes';
import { googleSignInAvailable } from './googleClientIds';

/**
 * Native Google sign-in: obtains a Google ID token for the server to verify (POST /auth/oauth). The client ids come
 * from the build environment (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, the token's audience, which the server's
 * GOOGLE_CLIENT_IDS must include; EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, also the iOS URL scheme in app.config.ts); without
 * them Google is not offered.
 *
 * The native SDK is imported lazily: it registers a TurboModule when evaluated, which throws on a build compiled
 * without it, so such a build just cannot sign in with Google instead of crashing at start-up.
 */
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

export const isGoogleConfigured = googleSignInAvailable(Platform.OS, { web: webClientId, ios: iosClientId });

let configured = false;

export async function signInWithGoogle(): Promise<GoogleResult> {
  if (!isGoogleConfigured) return { kind: 'not-configured' };

  let sdk: typeof import('@react-native-google-signin/google-signin');
  try {
    sdk = await import('@react-native-google-signin/google-signin');
  } catch {
    // Native module absent (the build predates it): degrade instead of crashing.
    return { kind: 'error', messageKey: 'welcome.googleUnavailable' };
  }
  const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } = sdk;

  if (!configured && webClientId) {
    GoogleSignin.configure({ webClientId, iosClientId, offlineAccess: false });
    configured = true;
  }

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (isSuccessResponse(response)) {
      const idToken = response.data.idToken;
      if (!idToken) return { kind: 'error', messageKey: 'welcome.googleNoToken' };
      return { kind: 'success', idToken };
    }
    // The only non-success outcome of the interactive flow is cancellation.
    return { kind: 'cancelled' };
  } catch (err) {
    if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) {
      return { kind: 'cancelled' };
    }
    return { kind: 'error', message: (err as Error)?.message, messageKey: 'welcome.googleFailed' };
  }
}
