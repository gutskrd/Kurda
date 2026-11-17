import type { ApiClient } from '../api/client';
import { removeDevice } from './pushClient';

/**
 * The push token this phone has registered for the account signed in on it,
 * shared by the two places that unregister it: PushRegistration, when the
 * signed-in tree goes away, and signing out or deleting the account
 * (auth/AuthContext.tsx), which must do it first, while the session can still
 * say whose phone it is. Whoever takes the token is the one who unregisters
 * it, so it is unregistered once.
 *
 * No React in here: it is plain state, read and written from both.
 */
let registered: string | null = null;

/**
 * How long signing out waits for the phone to be taken off the account's
 * notifications. Signing out must not hang on a slow network, and the server
 * drops the phone with its session in any case (migration
 * `push-ends-with-its-session`); this is the earlier, explicit removal.
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

/** The registered token, taken: the caller unregisters it. */
export function takePushToken(): string | null {
  const token = registered;
  registered = null;
  return token;
}

/**
 * Take this phone off the account's notifications with the session it is
 * signed in under. Called before the session is cleared from the phone:
 * afterwards the request would carry no session, and the server would refuse
 * it without a word. Never throws, and waits no longer than `waitMs`.
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
