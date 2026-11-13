/**
 * A game being joined while its lobby is already opening.
 *
 * An invite tapped on the Games screen used to take its row away, wait for
 * the server to accept it, and only then open the lobby: a round trip with
 * nothing on the screen but a gap where the invite had been. The lobby opens
 * at once now, and the accept goes on behind it. But a lobby asked for by
 * somebody who is not in it yet is refused (to the server it is nobody's
 * game), so the lobby's own first read waits here for the accept that is
 * already on its way — one request's wait either way, now spent on the
 * lobby's screen instead of on a hole in a list.
 *
 * Nothing but a note of what is under way: whether the accept worked is the
 * lobby's to find out from its own read, which says why when it did not.
 */
const under = new Map<string, Promise<unknown>>();

/** `lobbyId` is being joined: `accept` is the request that does it. */
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
