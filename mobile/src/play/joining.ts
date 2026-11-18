/**
 * Games being joined while their lobby is already opening. Tapping an invite opens the lobby at once and accepts
 * in the background, but the server refuses a lobby read from someone not yet in it, so the lobby's first read
 * waits here for the accept. Whether the accept worked is for that read to find out.
 */
const under = new Map<string, Promise<unknown>>();

/** Records that `lobbyId` is being joined by the `accept` request. */
export function joining(lobbyId: string, accept: Promise<unknown>): void {
  under.set(lobbyId, accept);
  const done = (): void => {
    if (under.get(lobbyId) === accept) under.delete(lobbyId);
  };
  accept.then(done, done);
}

/** Resolves once nothing is joining `lobbyId` any more: at once, when nothing is. Never rejects. */
export function joined(lobbyId: string): Promise<void> {
  const accept = under.get(lobbyId);
  if (!accept) return Promise.resolve();
  const over = (): void => undefined;
  return accept.then(over, over);
}
