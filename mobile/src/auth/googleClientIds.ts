/**
 * Which of Google's client ids a platform needs before the sign-in screen may
 * offer Google.
 *
 * The ids live in the build environment, never in the repository, and Expo
 * inlines them into the bundle (google.ts reads them). The build turns the iOS
 * one into the URL scheme Google returns to (app.config.ts), and refuses an id
 * that is not shaped like one, so the presence of the iOS id here means the
 * binary has the scheme.
 */

/**
 * Whether this build can sign in with Google on this platform.
 *
 * Every platform needs the web client id: Google issues the token with it as
 * the audience, and the server checks for it. iOS also needs its own client id,
 * because without it the build has no URL scheme for Google to return to.
 * Android needs nothing more in the build; its client is matched by the
 * package name and the signing certificate.
 */
export function googleSignInAvailable(os: string, ids: { web?: string | null; ios?: string | null }): boolean {
  if (!ids.web?.trim()) return false;
  return os !== 'ios' || Boolean(ids.ios?.trim());
}
