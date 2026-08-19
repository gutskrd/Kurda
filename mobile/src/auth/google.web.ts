import type { GoogleResult } from './googleTypes';

/**
 * Web stub for the native Google module (KUR-018). The web target (used for
 * development previews) doesn't run the native SDK, so it reports the feature
 * as unconfigured and the UI falls back to its "coming soon" affordance.
 */
export const isGoogleConfigured = false;

export async function signInWithGoogle(): Promise<GoogleResult> {
  return { kind: 'not-configured' };
}
