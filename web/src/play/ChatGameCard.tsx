import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isPlayGame, type ChatGameRef, type LobbyCard } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import type { ChatExtras } from '../lib/types';
import { useRealtimeEvent } from '../realtime/RealtimeProvider';
import type { RealtimeEventEnvelope } from '../realtime/events';
import { TicketBody, TicketGlyph, TicketStamp, TicketStub, ticketClass, useFreshStamp } from '../ui/Ticket';
import { GAME_NAME_KEY, joinLobby, lobbyPath, playError, summaryParts } from './playApi';
import { RatedBadge } from '../ranks/rated';
import { RetiredGameNote } from '../components/GameInviteCard';

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
 *
 * It is a ticket (ui/Ticket.tsx): the game's mark on a stub in its colour,
 * and where it stands as a stamp. Once you are in, "Joined" is stamped across
 * it — landing with a small thump when it happens while you watch. A game
 * that finished or was called off is grey, its stub punched and the outcome
 * stamped; one that is gone is grey and punched, and says so.
 */
export function ChatGameCard({
  game,
  lobbyId,
  from,
}: ChatGameRef & {
  /** who posted it, so a screen reader hears whose invite it is */
  from?: { id: string; name: string } | null;
}): React.JSX.Element {
  const t = useT();
  const { client, user } = useAuth();
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
  const spent = card?.status === 'finished' || card?.status === 'cancelled' || card?.status === 'unavailable';
  // the stamp: in, or how it ended; a game that is simply gone says so in words instead
  const stamp = card?.isMember && live ? 'joined' : card?.status === 'finished' || card?.status === 'cancelled' ? card.status : null;
  const fresh = useFreshStamp(stamp, card !== null);
  const label =
    from && from.id !== user?.id ? t('play.ticket.from', { name: from.name, game: name }) : t('games.invite.preview', { game: name });

  return (
    <div
      className={ticketClass(spent ? 'muted' : game, 'row', `invite-card chat-game-card is-${card?.status ?? 'loading'}${spent ? ' is-punched' : ''}`)}
      role="group"
      aria-label={label}
    >
      <TicketStub className="invite-stub">
        <TicketGlyph game={game} />
      </TicketStub>
      <TicketBody className="invite-main">
        {stamp && (
          <TicketStamp key={stamp} className="invite-stamp" tone={stamp === 'joined' ? 'success' : 'muted'} fresh={fresh}>
            {stamp === 'joined' ? t('play.ticket.joined') : t(STATUS_KEY[stamp])}
          </TicketStamp>
        )}
        <span className="invite-eyebrow">{t('games.invite.eyebrow')}</span>
        <span className="invite-title">{name}</span>
        {/* Rated or Friendly, before anyone joins (Game Ranks) */}
        {card && typeof card.summary.rated === 'boolean' && <RatedBadge rated={card.summary.rated} size="sm" className="invite-rated" />}
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
        {/* a stamped ending is its own status line */}
        {!(stamp && stamp !== 'joined') && <span className="chat-game-status">{status}</span>}
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
      </TicketBody>
    </div>
  );
}

/**
 * What a thread hands `MessageList` as `renderBody` for game cards: the live
 * card for a message that is one, nothing (draw it as text) otherwise. A
 * thread that draws other kinds too tries theirs first and falls back to this.
 *
 * A card shared for a game that is no longer part of Hevalo has no lobby to
 * read and none to join: it is a line saying so, with nothing to press.
 */
export function gameCardBody(m: ChatExtras & { senderId?: string; username?: string }): React.ReactNode | undefined {
  if (m.kind !== 'game' || !m.game) return undefined;
  if (!isPlayGame(m.game.game)) return <RetiredGameNote />;
  const from = m.senderId && m.username ? { id: m.senderId, name: m.username } : null;
  return <ChatGameCard game={m.game.game} lobbyId={m.game.lobbyId} from={from} />;
}
