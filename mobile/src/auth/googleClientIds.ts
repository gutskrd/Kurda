/**
 * Which of Google's client ids a platform needs before the sign-in screen may offer Google. The ids live in the build
 * environment and are inlined into the bundle (google.ts reads them); the build turns the iOS one into Google's URL
 * scheme and refuses a malformed id, so the iOS id being present means the binary has the scheme.
 */

/**
 * Whether this build can sign in with Google here: every platform needs the web client id (the token's audience), and
 * iOS also needs its own for the URL scheme. Android's client is matched by package name and signing certificate.
 */
export function googleSignInAvailable(os: string, ids: { web?: string | null; ios?: string | null }): boolean {
  if (!ids.web?.trim()) return false;
  return os !== 'ios' || Boolean(ids.ios?.trim());
}
