import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import type { GoogleResult } from './googleTypes';

/**
 * Native Google sign-in (KUR-018). Obtains a Google ID token via the native
 * flow and hands it to the backend (POST /auth/oauth), which verifies it.
 *
 * Client IDs come from the environment so no secrets live in the repo:
 *  - EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID — the OAuth *Web* client id; Google issues
 *    the ID token with this as its audience, so the backend's GOOGLE_CLIENT_IDS
 *    must include it.
 *  - EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID — the iOS client id (iOS only).
 * Until the web client id is set the feature reports `not-configured`, and the
 * UI keeps its "coming soon" affordance instead of a broken flow.
 */
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

export const isGoogleConfigured = Boolean(webClientId);

let configured = false;
function ensureConfigured(): void {
  if (configured || !webClientId) return;
  GoogleSignin.configure({ webClientId, iosClientId, offlineAccess: false });
  configured = true;
}

export async function signInWithGoogle(): Promise<GoogleResult> {
  if (!isGoogleConfigured) return { kind: 'not-configured' };
  ensureConfigured();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (isSuccessResponse(response)) {
      const idToken = response.data.idToken;
      if (!idToken) return { kind: 'error', message: 'Google didn’t return an ID token. Please try again.' };
      return { kind: 'success', idToken };
    }
    // the only non-success outcome of the interactive flow is cancellation
    return { kind: 'cancelled' };
  } catch (err) {
    if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) {
      return { kind: 'cancelled' };
    }
    return { kind: 'error', message: (err as Error)?.message ?? 'Google sign-in failed' };
  }
}
