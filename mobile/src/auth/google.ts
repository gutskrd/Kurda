import { Platform } from 'react-native';
import type { GoogleResult } from './googleTypes';
import { googleSignInAvailable } from './googleClientIds';

/**
 * Native Google sign-in: obtains a Google ID token and hands it to the server (POST /auth/oauth), which verifies it.
 *
 * Client ids come from the build environment:
 * - EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, the OAuth web client id; the token's audience, so the server's GOOGLE_CLIENT_IDS
 *   must include it.
 * - EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, the iOS client id, which the build also turns into the iOS URL scheme
 *   (app.config.ts). Until the ids this platform needs are set, the sign-in screen does not offer Google.
 *
 * The native SDK is imported lazily: it registers a TurboModule when evaluated, which throws on a build compiled
 * without it, so a build without the module just cannot sign in with Google rather than crashing at start-up.
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
