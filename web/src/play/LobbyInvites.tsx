import { useRef, useState } from 'react';
import type { OutgoingInviteState, PlayGame } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { InviteIcon, TicketIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { prefersReducedMotion, useInFront } from '../lib/motion';
import { TicketBody, TicketStamp, TicketStub, ticketClass, useFreshStamp } from '../ui/Ticket';
import { InviteSheet } from './InviteSheet';
import { playError } from './playApi';
import { usePlayInvites } from './PlayProvider';

/** The friends the host asked into this lobby, newest first. */
function useInvited(game: PlayGame, lobbyId: string): OutgoingInviteState[] {
  const { lists } = usePlayInvites();
  return lists?.outgoing.find((o) => o.game === game && o.lobbyId === lobbyId)?.invitees ?? [];
}

/** "Invite friends" for a lobby's host: the invite sheet, leaving out friends already asked and not declined. */
export function InviteFriendsButton({
  game,
  lobbyId,
  room,
}: {
  game: PlayGame;
  lobbyId: string;
  /** Seats still free. */
  room: number;
}): React.JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(false);
  const invited = useInvited(game, lobbyId);
  const exclude = invited.filter((i) => i.status === 'pending' || i.status === 'accepted').map((i) => i.userId);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} disabled={room <= 0}>
        <InviteIcon size={16} />
        {t('play.invite.friendsButton')}
      </Button>
      <InviteSheet open={open} onClose={() => setOpen(false)} target={{ kind: 'lobby', game, lobbyId, room, exclude }} />
    </>
  );
}

/** How the host is told a friend's answer: softly, never as a refusal. */
function stateKey(i: OutgoingInviteState): MessageKey {
  switch (i.status) {
    case 'pending':
      return 'play.invited.pending';
    case 'accepted':
      return 'play.invited.joined';
    case 'expired':
      return 'play.invited.expired';
    case 'cancelled':
      return 'play.invited.cancelled';
    case 'declined':
      return i.declineReason === 'not_this_game' ? 'play.invited.notThisGame' : 'play.invited.later';
  }
}

/**
 * The lobby's "Invited" list: each friend asked and where they stand (asked, with Cancel; in; declined; or expired,
 * with Invite again), following answers as they come. Each is a small ticket with their face on the stub: outlined
 * while waiting, filled and stamped "Joined" once in, grey with the reason in words otherwise.
 */
export function InvitedList({
  game,
  lobbyId,
  room,
  headingLevel = 3,
}: {
  game: PlayGame;
  lobbyId: string;
  room: number;
  /** Matches the page's other panels: h3 in a story lobby, h2 in a battle or match. */
  headingLevel?: 2 | 3;
}): React.JSX.Element | null {
  const t = useT();
  const { client } = useAuth();
  const { refresh } = usePlayInvites();
  const invited = useInvited(game, lobbyId);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);
  const inFront = useInFront(ref);
  const [still] = useState(prefersReducedMotion);
  if (invited.length === 0) return null;
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  async function cancel(i: OutgoingInviteState): Promise<void> {
    setBusy(i.inviteId);
    setNotice(null);
    const res = await client.delete(`/play/invites/${encodeURIComponent(i.inviteId)}`);
    setBusy(null);
    if (!res.ok) setNotice(playError(res.error, t));
    refresh();
  }

  async function again(i: OutgoingInviteState): Promise<void> {
    setBusy(i.inviteId);
    setNotice(null);
    const res = await client.post('/play/invites', { game, lobbyId, userIds: [i.userId] });
    setBusy(null);
    if (!res.ok) setNotice(playError(res.error, t));
    refresh();
  }

  return (
    <section className="lobby-invited" ref={ref} aria-labelledby={`invited-${lobbyId}`}>
      <Heading className="sg-panel-title" id={`invited-${lobbyId}`}>
        {t('play.invited.title')}
      </Heading>
      <ul className="lobby-invited-list" aria-live="polite">
        {invited.map((i) => (
          <InvitedRow
            key={i.inviteId}
            invitee={i}
            game={game}
            awake={inFront && !still}
            busy={busy === i.inviteId}
            room={room}
            onCancel={() => void cancel(i)}
            onAgain={() => void again(i)}
          />
        ))}
      </ul>
      {notice && (
        <p className="sg-notice" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}

/** One friend asked into the lobby, as a small ticket with their face on the stub. */
function InvitedRow({
  invitee: i,
  game,
  awake,
  busy,
  room,
  onCancel,
  onAgain,
}: {
  invitee: OutgoingInviteState;
  game: PlayGame;
  /** The list is in front of the reader, so a waiting ticket may show its light. */
  awake: boolean;
  busy: boolean;
  room: number;
  onCancel: () => void;
  onAgain: () => void;
}): React.JSX.Element {
  const t = useT();
  const waiting = i.status === 'pending';
  const joined = i.status === 'accepted';
  const fresh = useFreshStamp(joined ? 'joined' : null);
  const look = `lobby-invited-row is-${i.status}${waiting ? ' is-outlined' : ''}${waiting && awake ? ' is-awake' : ''}`;
  return (
    <li className={ticketClass(waiting || joined ? game : 'muted', 'row', look)}>
      <TicketStub className="lobby-invited-stub">
        <Avatar url={i.avatarUrl} glyphSize={16} />
      </TicketStub>
      <TicketBody className="lobby-invited-main" shine={waiting}>
        <span className="lobby-invited-text">
          <span className="lobby-invited-name">{i.name}</span>
          {/* In: the stamp is the word. */}
          {!joined && <span className="lobby-invited-state">{t(stateKey(i))}</span>}
        </span>
        {joined && (
          <TicketStamp tone="success" fresh={fresh} className="lobby-invited-stamp">
            {t(stateKey(i))}
          </TicketStamp>
        )}
        {waiting && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={onCancel}
            aria-label={t('play.invited.cancelWho', { name: i.name })}
          >
            {t('common.cancel')}
          </button>
        )}
        {i.status === 'expired' && room > 0 && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy}
            onClick={onAgain}
            aria-label={t('play.invited.againWho', { name: i.name })}
          >
            <TicketIcon size={16} />
            {t('play.invited.again')}
          </button>
        )}
      </TicketBody>
    </li>
  );
}
