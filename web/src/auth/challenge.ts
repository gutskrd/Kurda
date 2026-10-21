/**
 * The challenge a sign-in can be asked for (CAPTCHA_REQUIRED, 403): after
 * several failed attempts on an account or from a network, or while failures
 * are surging across the whole site. The right password together with a solved
 * challenge gets in even then (api/src/auth/service.ts).
 *
 * Showing one needs a site key, the public half of the server's
 * TURNSTILE_SECRET. Without one there is nothing to show, and the sign-in page
 * says to wait a few minutes or set a new password instead. This is the one
 * place that decides which.
 */
export function challengeSiteKey(env: { VITE_TURNSTILE_SITE_KEY?: string } = import.meta.env): string | null {
  const key = env.VITE_TURNSTILE_SITE_KEY?.trim();
  return key ? key : null;
}
