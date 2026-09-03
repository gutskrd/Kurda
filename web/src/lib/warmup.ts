import { API_URL } from './config';

let lastWarm = 0;

/**
 * Fire-and-forget ping to wake the API before the user acts. The API runs on a
 * platform that idles the container after inactivity, so the *first* request
 * after a quiet spell pays a cold-start penalty. Pinging `/health` (rate-limit
 * exempt, no auth, no side effects) when the sign-in screen mounts means the
 * container is usually already warm by the time credentials are submitted —
 * which is where cold-start was being felt as "slow login". Throttled so route
 * changes don't spam it, and failures are ignored (it's only an optimization).
 */
export function warmApi(): void {
  const now = Date.now();
  if (now - lastWarm < 30_000) return;
  lastWarm = now;
  try {
    void fetch(`${API_URL}/health`, { method: 'GET', cache: 'no-store', keepalive: true }).catch(() => undefined);
  } catch {
    /* never let a warm-up ping affect the page */
  }
}
