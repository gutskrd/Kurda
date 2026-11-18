/**
 * Short app-wide notices, such as a change the server refused (lib/optimistic.ts). Kept outside React so any code can
 * raise one; the app-wide toast stack (chat/MessagesProvider.tsx) shows them.
 */

type Listener = (text: string) => void;

const listeners = new Set<Listener>();

export function showNotice(text: string): void {
  for (const listener of listeners) listener(text);
}

/** Calls `listener` with each notice raised; returns the way to stop. */
export function onNotice(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
