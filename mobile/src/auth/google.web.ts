import type { GoogleResult } from './googleTypes';

/**
 * Web stub for the native Google module: the web build does not run the native SDK, so it reports the feature as
 * unconfigured.
 */
export const isGoogleConfigured = false;

export async function signInWithGoogle(): Promise<GoogleResult> {
  return { kind: 'not-configured' };
}
