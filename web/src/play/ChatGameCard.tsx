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
 * A game shared in a chat, read live so the card follows the game: its settings, where it stands ("2 of 4 joined",
 * started, finished), Join while it can be joined and Open once you are in. A game this reader may not see reads as no
 * longer available. It refreshes when shown, on the server's change events and when the tab returns, never by polling.
 * It is a ticket (ui/Ticket.tsx), stamped "Joined" or with its outcome, and greyed and punched once over or gone.
 */
export function ChatGameCard({
  game,
  lobbyId,
  from,
}: ChatGameRef & {
  /** Who posted it, so a screen reader hears whose invite it is. */
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
  // The stamp: joined, or how it ended; a game that is gone says so in words instead.
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
        {/* Rated or Friendly, before anyone joins. */}
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
        {/* A stamped ending is its own status line. */}
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
 * `renderBody` for game cards in a `MessageList`: the live card for a game message, else undefined (draw it as text).
 * A card for a retired game is a line saying so.
 */
export function gameCardBody(m: ChatExtras & { senderId?: string; username?: string }): React.ReactNode | undefined {
  if (m.kind !== 'game' || !m.game) return undefined;
  if (!isPlayGame(m.game.game)) return <RetiredGameNote />;
  const from = m.senderId && m.username ? { id: m.senderId, name: m.username } : null;
  return <ChatGameCard game={m.game.game} lobbyId={m.game.lobbyId} from={from} />;
}
