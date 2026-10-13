import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PlayGame, RematchState } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { useT } from '../i18n/I18nProvider';
import { useRealtimeEvent } from '../realtime/RealtimeProvider';
import type { RealtimeEventEnvelope } from '../realtime/events';
import { InviteSheet } from './InviteSheet';
import { joinLobby, lobbyPath, playError } from './playApi';

/**
 * Leaving the results takes a standing rematch offer back. The call waits a
 * moment so that React mounting the panel twice in development (unmount,
 * mount again at once) does not read as leaving.
 */
const leaving = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Playing again, the same way for every game (contract §B1).
 *
 * Two players: "Rematch" — both must ask (lichess). The other sees "Rojda
 * wants a rematch" with Accept and No thanks; once both have asked, the new
 * game starts at once and both are taken to it. A running score shows after
 * the first rematch.
 *
 * More players: the host's "Play again" opens the next round with only the
 * host in it (who goes there and can invite); everyone else gets "Join next
 * round", one tap, through the same join rule as any link. Nobody is put in a
 * game they did not choose.
 *
 * "Invite someone else" opens the invite sheet for a new game.
 */
export function RematchPanel({
  game,
  lobbyId,
  otherName,
  isHost,
}: {
  game: PlayGame;
  lobbyId: string;
  /** a two-player game: the other player, as this screen names them */
  otherName: string;
  isHost: boolean;
}): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<RematchState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const pair = useRef(false);
  const key = `${game}:${lobbyId}`;

  const read = useCallback(async () => {
    const res = await client.get<RematchState>(`/play/${game}/${encodeURIComponent(lobbyId)}/rematch`);
    if (res.ok) setState(res.data);
  }, [client, game, lobbyId]);

  useEffect(() => {
    void read();
  }, [read]);

  const onChange = useCallback(
    (env: RealtimeEventEnvelope) => {
      const e = env.event as { game?: unknown; lobbyId?: unknown };
      if (e.game === game && e.lobbyId === lobbyId) void read();
    },
    [game, lobbyId, read],
  );
  useRealtimeEvent('rematch_update', onChange);
  useRealtimeEvent('play_changed', onChange);

  pair.current = state?.kind === 'pair' && !state.nextLobbyId;
  useEffect(() => {
    const pending = leaving.get(key);
    if (pending) clearTimeout(pending);
    leaving.delete(key);
    return () => {
      if (!pair.current) return;
      leaving.set(
        key,
        setTimeout(() => {
          leaving.delete(key);
          void client.delete(`/play/${game}/${encodeURIComponent(lobbyId)}/rematch`);
        }, 0),
      );
    };
  }, [client, game, lobbyId, key]);

  // a rematch both asked for has started: both go to it
  const next = state?.kind === 'pair' ? state.nextLobbyId : null;
  useEffect(() => {
    if (next) navigate(lobbyPath(game, next));
  }, [next, game, navigate]);

  async function offer(): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await client.post<RematchState>(`/play/${game}/${encodeURIComponent(lobbyId)}/rematch`);
    setBusy(false);
    if (!res.ok) return setError(playError(res.error, t));
    setState(res.data);
    // the host who opened the next round goes to it, to wait and invite
    if (res.data.kind === 'round' && res.data.nextLobbyId) navigate(lobbyPath(game, res.data.nextLobbyId));
  }

  async function withdraw(): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await client.delete<RematchState>(`/play/${game}/${encodeURIComponent(lobbyId)}/rematch`);
    setBusy(false);
    if (res.ok) setState(res.data);
    else setError(playError(res.error, t));
  }

  async function joinNext(id: string): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await joinLobby(client, game, id);
    setBusy(false);
    if (res.ok) navigate(lobbyPath(game, id));
    else setError(playError(res.error, t));
  }

  const someoneElse = (
    <Button variant="secondary" onClick={() => setInviting(true)}>
      {t('play.rematch.someoneElse')}
    </Button>
  );

  let body: React.ReactNode = null;
  if (state?.kind === 'pair') {
    if (state.offeredByOther && !state.offeredByMe) {
      body = (
        <>
          <p className="rematch-line">{t('play.rematch.wants', { name: otherName })}</p>
          <div className="rematch-actions">
            <Button disabled={busy} onClick={() => void offer()}>
              {t('play.rematch.accept')}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void withdraw()}>
              {t('play.rematch.noThanks')}
            </Button>
          </div>
        </>
      );
    } else if (state.offeredByMe && !state.nextLobbyId) {
      body = (
        <>
          <p className="rematch-line">{t('play.rematch.waiting', { name: otherName })}</p>
          <div className="rematch-actions">
            <Button variant="ghost" disabled={busy} onClick={() => void withdraw()}>
              {t('play.rematch.takeBack')}
            </Button>
          </div>
        </>
      );
    } else if (state.otherDeclined) {
      body = (
        <>
          <p className="rematch-line muted">{t('play.rematch.notThisTime', { name: otherName })}</p>
          <div className="rematch-actions">{someoneElse}</div>
        </>
      );
    } else {
      body = (
        <div className="rematch-actions">
          <Button disabled={busy} onClick={() => void offer()}>
            {t('play.rematch.ask')}
          </Button>
          {someoneElse}
        </div>
      );
    }
  } else if (state?.kind === 'round') {
    const nextRound = state.nextLobbyId;
    body = nextRound ? (
      <>
        {!isHost && <p className="rematch-line">{t('play.rematch.roundOpen')}</p>}
        <div className="rematch-actions">
          {isHost ? (
            <Button onClick={() => navigate(lobbyPath(game, nextRound))}>{t('play.rematch.toRound')}</Button>
          ) : (
            <Button disabled={busy} onClick={() => void joinNext(nextRound)}>
              {busy ? t('games.joining') : t('play.rematch.joinRound')}
            </Button>
          )}
          {someoneElse}
        </div>
      </>
    ) : (
      <>
        {!state.canOpenRound && <p className="rematch-line muted">{t('play.rematch.hostOpens')}</p>}
        <div className="rematch-actions">
          {state.canOpenRound && (
            <Button disabled={busy} onClick={() => void offer()}>
              {t('games.playAgain')}
            </Button>
          )}
          {someoneElse}
        </div>
      </>
    );
  }

  const series = state?.kind === 'pair' ? state.series : null;
  return (
    <div className="rematch" aria-live="polite">
      {series && series.me + series.other + series.draws >= 2 && (
        <p className="rematch-series">
          {t('play.rematch.series', { me: series.me, other: series.other, name: otherName })}
        </p>
      )}
      {body}
      {error && (
        <p className="sg-notice" role="status">
          {error}
        </p>
      )}
      <InviteSheet open={inviting} onClose={() => setInviting(false)} target={{ kind: 'new', game }} />
    </div>
  );
}
