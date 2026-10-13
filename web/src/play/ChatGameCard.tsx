import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ChatGameRef, LobbyCard } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import type { ChatExtras } from '../lib/types';
import { useRealtimeEvent } from '../realtime/RealtimeProvider';
import type { RealtimeEventEnvelope } from '../realtime/events';
import { GAME_NAME_KEY, joinLobby, lobbyPath, playError, summaryParts } from './playApi';

const STATUS_KEY: Record<Exclude<LobbyCard['status'], 'open'>, MessageKey> = {
  full: 'play.card.full',
  started: 'play.card.started',
  finished: 'play.card.finished',
  cancelled: 'play.card.cancelled',
  unavailable: 'play.card.unavailable',
};

/**
 * A game shared in a chat (contract §B1): which game and how it is set, and
 * where it stands now — open with "2 of 4 joined", started, finished — read
 * live, so the card changes with the game instead of anyone editing a
 * message. Join while it can be joined (one tap, through the game's own join
 * rule); Open when you are in it. A game this reader may not see reads as no
 * longer available, the same as one that is gone.
 *
 * The card asks for its state when it is shown, whenever the server says the
 * game changed, and when the tab comes back; it does not poll, since a long
 * conversation can hold many of them.
 */
export function ChatGameCard({ game, lobbyId }: ChatGameRef): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const navigate = useNavigate();
  const [card, setCard] = useState<LobbyCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = t(GAME_NAME_KEY[game]);

  const read = useCallback(async () => {
    const res = await client.get<LobbyCard>(`/play/cards/${game}/${encodeURIComponent(lobbyId)}`);
    if (res.ok) setCard(res.data);
  }, [client, game, lobbyId]);

  useEffect(() => {
    void read();
    const onVisible = (): void => {
      if (document.visibilityState !== 'hidden') void read();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [read]);

  const onChanged = useCallback(
    (env: RealtimeEventEnvelope) => {
      const e = env.event as { game?: unknown; lobbyId?: unknown };
      if (e.game === game && e.lobbyId === lobbyId) void read();
    },
    [game, lobbyId, read],
  );
  useRealtimeEvent('play_changed', onChanged);

  async function join(): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await joinLobby(client, game, lobbyId);
    setBusy(false);
    if (res.ok) navigate(lobbyPath(game, lobbyId));
    else {
      setError(playError(res.error, t));
      void read();
    }
  }

  const parts = card ? summaryParts(game, card.summary, t) : [];
  const status = !card
    ? t('common.loading')
    : card.status === 'open'
      ? t('play.card.joined', { count: card.players, max: card.maxPlayers })
      : t(STATUS_KEY[card.status]);
  const live = card && (card.status === 'open' || card.status === 'full' || card.status === 'started');

  return (
    <div className={`invite-card chat-game-card is-${card?.status ?? 'loading'}`} role="group" aria-label={t('games.invite.preview', { game: name })}>
      <span className="invite-eyebrow">{t('games.invite.eyebrow')}</span>
      <span className="invite-title">{name}</span>
      {parts.length > 0 && (
        <span className="invite-blurb">
          {parts.map((p, i) => (
            <span key={i}>
              {i > 0 && ' · '}
              <span lang={p.lang} dir={p.dir}>
                {p.text}
              </span>
            </span>
          ))}
        </span>
      )}
      <span className="chat-game-status">{status}</span>
      {error && (
        <span className="chat-game-error" role="status">
          {error}
        </span>
      )}
      {card?.isMember && live ? (
        <Link to={lobbyPath(game, lobbyId)} className="invite-action chat-game-action">
          {t('play.card.open')}
        </Link>
      ) : card?.canJoin ? (
        <button type="button" className="invite-action chat-game-action" disabled={busy} onClick={() => void join()}>
          {busy ? t('games.joining') : t('play.card.join')}
        </button>
      ) : null}
    </div>
  );
}

/**
 * What a thread hands `MessageList` as `renderBody` for game cards: the live
 * card for a message that is one, nothing (draw it as text) otherwise. A
 * thread that draws other kinds too tries theirs first and falls back to this.
 */
export function gameCardBody(m: ChatExtras): React.ReactNode | undefined {
  return m.kind === 'game' && m.game ? <ChatGameCard game={m.game.game} lobbyId={m.game.lobbyId} /> : undefined;
}
