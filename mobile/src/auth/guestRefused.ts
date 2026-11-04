/**
 * The word from the API client that a guest was refused something only an
 * account may do (403 GUEST_ACCOUNT), carried to whoever shows the offer to
 * create one.
 *
 * The client is made in AuthContext and the offer is a sheet in the account
 * gate (AccountGate.tsx), mounted under the signed-in screens. Neither should
 * know the other: the client has no React in it, and the gate must not reach
 * into the client's options. So the client tells this module, and the gate
 * listens here — the same shape as the maintenance notice (maintenance/).
 *
 * Plain functions, so a test can fire a refusal without a server.
 */
const listeners = new Set<() => void>();

/** The client's report: a guest was refused. Nothing happens without a listener. */
export function notifyGuestRefused(): void {
  for (const listener of listeners) listener();
}

/** Hear every refusal from now on; returns the way to stop listening. */
export function onGuestRefused(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
