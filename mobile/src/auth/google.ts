import { Platform } from 'react-native';
import type { GoogleResult } from './googleTypes';
import { googleSignInAvailable } from './googleClientIds';

/**
 * Native Google sign-in (KUR-018). Obtains a Google ID token via the native
 * flow and hands it to the backend (POST /auth/oauth), which verifies it.
 *
 * Client IDs come from the environment so no secrets live in the repo:
 *  - EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID — the OAuth *Web* client id; Google issues
 *    the ID token with this as its audience, so the backend's GOOGLE_CLIENT_IDS
 *    must include it.
 *  - EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID — the iOS client id (iOS only). The
 *    build turns the same variable into the iOS URL scheme (app.config.ts).
 * Until the ids this platform needs are set the feature reports
 * `not-configured`, and the sign-in screen does not offer Google at all. On
 * iOS that includes the iOS id: a build without it has no URL scheme for
 * Google to return to, so a button there could only fail.
 *
 * The native SDK is loaded lazily (dynamic import), never at module scope: the
 * package registers a TurboModule (`RNGoogleSignin`) at evaluation time, which
 * throws on a dev/managed build that wasn't compiled with it. Deferring the
 * import to the moment of use — and only when configured — means a build without
 * the module runs fine and simply can't sign in with Google, rather than
 * crashing at startup.
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
    // native module absent (build predates it) — degrade instead of crashing
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
    // the only non-success outcome of the interactive flow is cancellation
    return { kind: 'cancelled' };
  } catch (err) {
    if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) {
      return { kind: 'cancelled' };
    }
    return { kind: 'error', message: (err as Error)?.message, messageKey: 'welcome.googleFailed' };
  }
}
