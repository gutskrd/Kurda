/**
 * The API client's word that a guest was refused something only an account may do (403 GUEST_ACCOUNT), passed to the
 * account gate (AccountGate.tsx) that shows the offer. The client has no React in it and the gate must not reach into
 * its options, so both talk through this module, as with the maintenance notice (maintenance/).
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
