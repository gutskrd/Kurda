/**
 * The challenge a sign-in may require (CAPTCHA_REQUIRED, 403) after repeated failures; a correct password with a
 * solved challenge still gets in (api/src/auth/service.ts). It needs the site key matching the server's
 * TURNSTILE_SECRET; without one the sign-in page suggests waiting or setting a new password instead.
 */
export function challengeSiteKey(env: { VITE_TURNSTILE_SITE_KEY?: string } = import.meta.env): string | null {
  const key = env.VITE_TURNSTILE_SITE_KEY?.trim();
  return key ? key : null;
}
