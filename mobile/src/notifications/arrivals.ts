/**
 * Pushes that arrive while the app is open, handed from the push handler to the arrival toasts at the top of the screen
 * (ArrivalToasts) in place of the system's banner, which cannot draw Hevalo's pictures or speak the reader's language.
 * With nothing on screen to show them, the system banner shows as before.
 */

export interface Arrival {
  /** The push's own id, so the same push is never shown twice. */
  id: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

type Listener = (arrival: Arrival) => void;

const listeners = new Set<Listener>();

/** Shows arrivals while it listens; the returned function stops. */
export function onArrival(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether anything on screen will show an arrival. */
export function arrivalsShown(): boolean {
  return listeners.size > 0;
}

export function announceArrival(arrival: Arrival): void {
  for (const listener of [...listeners]) listener(arrival);
}

/** Kinds with an in-app moment of their own (an invite's banner, a gift's arrival, a badge's celebration) keep the system banner. */
const OWN_MOMENT: ReadonlySet<string> = new Set(['play_invite', 'gift', 'badge']);

/** Whether a push of this kind is shown as an arrival toast while the app is open. */
export function toastsInApp(data: Record<string, unknown> | null | undefined): boolean {
  return !OWN_MOMENT.has(typeof data?.kind === 'string' ? data.kind : '');
}
