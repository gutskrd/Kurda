import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { InviteLists, PlayGame } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useRealtimeEvent } from '../realtime/RealtimeProvider';
import type { RealtimeEventEnvelope } from '../realtime/events';

/** How often a lobby or game is read when no `play_changed` has come — a safety net, not the way news arrives. */
export const FALLBACK_POLL_MS = 10_000;

function visible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

/**
 * Keeps a Wordle Battle or Rhyme Match screen current (contract §B4): the
 * server says `play_changed` whenever the lobby or game moves, and the screen
 * reads it then. Polling every 1.5 s did this before, from every open tab,
 * hidden or not; now a slow read every 10 s covers a missed event, and stops
 * while the tab is hidden (coming back reads at once).
 */
export function useLobbyUpdates(game: PlayGame, lobbyId: string, read: () => void, live: boolean): void {
  const latest = useRef(read);
  latest.current = read;

  const onChanged = useCallback(
    (env: RealtimeEventEnvelope) => {
      const e = env.event as { game?: unknown; lobbyId?: unknown };
      if (e.game === game && e.lobbyId === lobbyId) latest.current();
    },
    [game, lobbyId],
  );
  useRealtimeEvent('play_changed', onChanged);

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => {
      if (visible()) latest.current();
    }, FALLBACK_POLL_MS);
    const onVisible = (): void => {
      if (visible()) latest.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [live]);
}

/**
 * The invites to you, and your answers from friends you asked
 * (`GET /play/invites`), kept current by the events that change them.
 */
export function useInvites(enabled = true): { lists: InviteLists | null; refresh: () => void } {
  const { client, status } = useAuth();
  const [lists, setLists] = useState<InviteLists | null>(null);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const on = enabled && status === 'signedIn';

  useEffect(() => {
    if (!on) {
      // signed out: the last account's invites are not the next one's
      setLists(null);
      return;
    }
    let alive = true;
    void client.get<InviteLists>('/play/invites').then((r) => {
      if (!alive || !r.ok) return;
      setLists({ incoming: r.data.incoming ?? [], outgoing: r.data.outgoing ?? [] });
    });
    return () => {
      alive = false;
    };
  }, [client, on, nonce]);

  const onEvent = useCallback(() => {
    if (on) refresh();
  }, [on, refresh]);
  useRealtimeEvent('play_invite', onEvent);
  useRealtimeEvent('play_invite_update', onEvent);

  // a tab coming back may have missed an event while it slept
  useEffect(() => {
    if (!on) return;
    const onVisible = (): void => {
      if (visible()) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [on, refresh]);

  return useMemo(() => ({ lists, refresh }), [lists, refresh]);
}
