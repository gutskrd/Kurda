/**
 * A write refused because a parent switched something off or Hevalo is resting (403 PARENTAL_BLOCKED or
 * PARENTAL_PAUSED). The API client reports it here, outside React, so the app's supervision catches up at once rather
 * than at the next minute's beat; the refusal itself is still said where it happened.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function noteParentalRefusal(): void {
  for (const l of [...listeners]) l();
}

export function onParentalRefusal(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
