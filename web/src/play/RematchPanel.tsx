import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PlayGame, RematchState } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { TicketIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { prefersReducedMotion, useInFront } from '../lib/motion';
import { TicketBody, TicketGlyph, TicketStub, ticketClass } from '../ui/Ticket';
import { useRealtimeEvent } from '../realtime/RealtimeProvider';
import type { RealtimeEventEnvelope } from '../realtime/events';
import { InviteSheet } from './InviteSheet';
import { joinLobby, lobbyPath, playError } from './playApi';

/** Leaving the results withdraws a rematch offer, after a moment so development's double mount does not count as leaving. */
const leaving = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Playing again, the same for every game. Two players: both must ask for a "Rematch", then the new game starts and both
 * go there, with a running score after the first. More players: the host's "Play again" opens the next round with only
 * the host in it, and everyone else gets "Join next round" through the usual join rule, so nobody is put in a game they
 * did not choose. "Invite someone else" opens the invite sheet. Offers are tickets as every invite is (ui/Ticket.tsx).
 */
export function RematchPanel({
  game,
  lobbyId,
  otherName,
  isHost,
}: {
  game: PlayGame;
  lobbyId: string;
  /** In a two-player game, the other player as this screen names them. */
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
  const panel = useRef<HTMLDivElement>(null);
  const inFront = useInFront(panel);
  const [still] = useState(prefersReducedMotion);
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

  // A rematch both asked for has started: both go to it.
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
    // The host who opened the next round goes there to wait and invite.
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
      <TicketIcon size={18} />
      {t('play.rematch.someoneElse')}
    </Button>
  );
  /** An offer as a ticket: the other player's handed over, or yours waiting. */
  const ticket = (content: React.ReactNode, waiting = false): React.ReactNode => (
    <div className={ticketClass(game, 'row', `rematch-ticket${waiting ? ' is-outlined' : ''}${waiting && inFront && !still ? ' is-awake' : ''}`)}>
      <TicketStub className="rematch-stub">
        <TicketGlyph game={game} />
      </TicketStub>
      <TicketBody className="rematch-main" shine={waiting}>
        {content}
      </TicketBody>
    </div>
  );

  let body: React.ReactNode = null;
  if (state?.kind === 'pair') {
    if (state.offeredByOther && !state.offeredByMe) {
      body = ticket(
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
        </>,
      );
    } else if (state.offeredByMe && !state.nextLobbyId) {
      body = ticket(
        <>
          <p className="rematch-line">{t('play.rematch.waiting', { name: otherName })}</p>
          <div className="rematch-actions">
            <Button variant="ghost" disabled={busy} onClick={() => void withdraw()}>
              {t('play.rematch.takeBack')}
            </Button>
          </div>
        </>,
        true,
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
    <div className="rematch" ref={panel} aria-live="polite">
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
