import type { ApiClient } from '../api/client';
import { removeDevice } from './pushClient';

/**
 * The push token this phone registered for the signed-in account, shared by the two places that unregister it:
 * PushRegistration when the signed-in tree goes away, and sign-out or account deletion (auth/AuthContext.tsx),
 * which must do it first while the session can still identify the phone. Whoever takes the token unregisters it,
 * so it is unregistered once. Plain state, no React.
 */
let registered: string | null = null;

/**
 * How long sign-out waits for the phone to be removed from push; the server also drops it with its session
 * (migration `push-ends-with-its-session`).
 */
export const UNREGISTER_WAIT_MS = 5_000;

/** The token registered for this phone, or null when it is not registered. */
export function registeredPushToken(): string | null {
  return registered;
}

/** Remember the token just registered for this phone. */
export function rememberPushToken(token: string): void {
  registered = token;
}

/** Take the registered token; the caller unregisters it. */
export function takePushToken(): string | null {
  const token = registered;
  registered = null;
  return token;
}

/**
 * Remove this phone from push with its current session, before the session is cleared (without one the server
 * would silently refuse). Never throws, and waits at most `waitMs`.
 */
export async function unregisterThisDevice(client: ApiClient, waitMs = UNREGISTER_WAIT_MS): Promise<void> {
  const token = takePushToken();
  if (!token) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    removeDevice(client, token).catch(() => undefined),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, waitMs);
    }),
  ]);
  clearTimeout(timer);
}
