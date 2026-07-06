import type { AppConfig } from '../config/env.js';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

type FetchLike = typeof fetch;

/**
 * Cloudflare Turnstile verification (KUR-025).
 * - No TURNSTILE_SECRET → CAPTCHA disabled (dev/test), always passes.
 * - Provider outage → CAPTCHA_FAIL_OPEN decides: 'true' admits traffic
 *   (availability over strictness), default rejects.
 */
export async function verifyCaptcha(
  config: AppConfig,
  token: string | undefined,
  ip: string | undefined,
  fetchFn: FetchLike = fetch,
): Promise<boolean> {
  if (!config.TURNSTILE_SECRET) return true;
  if (!token) return false;

  try {
    const res = await fetchFn(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: config.TURNSTILE_SECRET,
        response: token,
        ...(ip ? { remoteip: ip } : {}),
      }).toString(),
    });
    if (!res.ok) throw new Error(`siteverify ${res.status}`);
    const body = (await res.json()) as { success?: boolean };
    return body.success === true;
  } catch {
    return config.CAPTCHA_FAIL_OPEN === 'true';
  }
}
