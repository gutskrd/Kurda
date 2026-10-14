import { useState } from 'react';
import type { OutgoingInviteState, PlayGame } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { InviteIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { InviteSheet } from './InviteSheet';
import { playError } from './playApi';
import { usePlayInvites } from './PlayProvider';

/** The friends the host asked into this lobby, newest first, as the host's list says. */
function useInvited(game: PlayGame, lobbyId: string): OutgoingInviteState[] {
  const { lists } = usePlayInvites();
  return lists?.outgoing.find((o) => o.game === game && o.lobbyId === lobbyId)?.invitees ?? [];
}

/**
 * "Invite friends", for the host of a lobby: the invite sheet, with the
 * friends already asked (and not yet answered no) left out of the picker.
 */
export function InviteFriendsButton({
  game,
  lobbyId,
  room,
}: {
  game: PlayGame;
  lobbyId: string;
  /** seats still free */
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
 * The lobby's "Invited" list (contract §B1): each friend the host asked and
 * where they are — asked (with Cancel), in, "can't play right now", "would
 * rather play something else", or out of time (with Invite again). It follows
 * the friends' answers as they come, and says each change politely.
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
  /** beside the page's other panels: a story lobby's are h3, a battle's or a match's h2 */
  headingLevel?: 2 | 3;
}): React.JSX.Element | null {
  const t = useT();
  const { client } = useAuth();
  const { refresh } = usePlayInvites();
  const invited = useInvited(game, lobbyId);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
    <section className="lobby-invited" aria-labelledby={`invited-${lobbyId}`}>
      <Heading className="sg-panel-title" id={`invited-${lobbyId}`}>
        {t('play.invited.title')}
      </Heading>
      <ul className="lobby-invited-list" aria-live="polite">
        {invited.map((i) => (
          <li key={i.inviteId} className={`lobby-invited-row is-${i.status}`}>
            <Avatar url={i.avatarUrl} glyphSize={16} />
            <span className="lobby-invited-text">
              <span className="lobby-invited-name">{i.name}</span>
              <span className="lobby-invited-state">{t(stateKey(i))}</span>
            </span>
            {i.status === 'pending' && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy === i.inviteId}
                onClick={() => void cancel(i)}
                aria-label={t('play.invited.cancelWho', { name: i.name })}
              >
                {t('common.cancel')}
              </button>
            )}
            {i.status === 'expired' && room > 0 && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy === i.inviteId}
                onClick={() => void again(i)}
                aria-label={t('play.invited.againWho', { name: i.name })}
              >
                {t('play.invited.again')}
              </button>
            )}
          </li>
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
