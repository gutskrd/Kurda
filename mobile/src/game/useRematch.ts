import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';

/** Mirrors the API's RematchStatus (KUR-059). */
interface RematchStatus {
  ready: boolean;
  roomId: string | null;
  accepted: number;
  needed: number;
}

export type RematchPhase = 'idle' | 'waiting' | 'ready' | 'expired' | 'error';

/** Both original players must accept within this window (matches the server). */
const REMATCH_WINDOW_MS = 30_000;
const POLL_MS = 1_500;

/**
 * Rematch coordination for the results screen (KUR-059). `accept()` opts this
 * player in and then polls until the opponent accepts (→ ready with the new
 * room) or the 30s window lapses (→ expired). Purely drives UI state; the
 * screen navigates to the new room when a `roomId` appears.
 */
export function useRematch(roomId: string) {
  const { client } = useAuth();
  const [phase, setPhase] = useState<RematchPhase>('idle');
  const [status, setStatus] = useState<RematchStatus | null>(null);
  const deadlineRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  /** Fold a status in; returns true once the new room exists (rematch on). */
  const apply = useCallback((s: RematchStatus): boolean => {
    setStatus(s);
    if (s.ready && s.roomId) {
      setPhase('ready');
      return true;
    }
    return false;
  }, []);

  const accept = useCallback(() => {
    setPhase('waiting');
    deadlineRef.current = Date.now() + REMATCH_WINDOW_MS;
    void client.post<RematchStatus>(`/games/${roomId}/rematch`).then((res) => {
      if (!res.ok) {
        setPhase('error');
        return;
      }
      if (apply(res.data)) return; // opponent already in — straight to ready
      intervalRef.current = setInterval(() => {
        if (Date.now() > deadlineRef.current) {
          setPhase((p) => (p === 'ready' ? p : 'expired'));
          stop();
          return;
        }
        void client.get<RematchStatus>(`/games/${roomId}/rematch`).then((r) => {
          if (r.ok && apply(r.data)) stop();
        });
      }, POLL_MS);
    });
  }, [apply, client, roomId, stop]);

  // stop polling on unmount
  useEffect(() => stop, [stop]);

  return { phase, status, accept };
}
