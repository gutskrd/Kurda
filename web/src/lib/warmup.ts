import { API_URL } from './config';

let lastWarm = 0;

/**
 * Pings `/health` when the sign-in screen mounts so the idling API container is warm by the time credentials are sent.
 * Throttled, and failures are ignored.
 */
export function warmApi(): void {
  const now = Date.now();
  if (now - lastWarm < 30_000) return;
  lastWarm = now;
  try {
    void fetch(`${API_URL}/health`, { method: 'GET', cache: 'no-store', keepalive: true }).catch(() => undefined);
  } catch {
    /* A warm-up ping must never affect the page. */
  }
}
