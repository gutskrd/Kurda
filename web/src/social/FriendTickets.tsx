import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { ConfirmButton } from '../components/ConfirmButton';
import { TicketIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { describeError } from '../lib/api';
import { prefersReducedMotion } from '../lib/motion';
import { Ticket, TicketBody, TicketStamp, TicketStub, ticketClass } from '../ui/Ticket';

/**
 * Friend requests as tickets (ui/Ticket.tsx) in the heart colour. Sending: Add sends a small ticket away and becomes
 * "Requested"; pressing that twice takes the request back. Receiving: each request is a ticket with the sender's face
 * on the stub; Accept tears the stub off and stamps it "Friends", Decline folds it away. Under Reduce Motion only the
 * button and stamp change.
 */

/** How long a new friendship's stamp stays before the lists move on, and how long a decline takes to fold. */
const FRIENDS_MS = 1200;
const FOLD_MS = 300;

const wait = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

/** "Add friend" for someone not yet asked (`none`) or already asked (`pending_out`); it sends or withdraws the request. */
export function AddFriendButton({
  userId,
  name,
  status,
  onStatus,
  onError,
  label,
  variant = 'primary',
  block = false,
}: {
  userId: string;
  /** Who, for "Cancel your request to …". */
  name: string;
  status: 'none' | 'pending_out';
  onStatus?: (next: 'none' | 'pending_out') => void;
  /** Why a request failed, such as a full friend list (lib/limits.ts), or null once one goes. */
  onError?: (message: string | null) => void;
  /** The button's label where "Add friend" is too long, such as "Add" in a list row. */
  label?: string;
  variant?: 'primary' | 'secondary';
  block?: boolean;
}): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [state, setState] = useState(status);
  const [busy, setBusy] = useState(false);
  // The ticket sent away or brought back, counted so each one animates again.
  const [moment, setMoment] = useState<{ way: 'away' | 'back'; n: number } | null>(null);
  const [said, setSaid] = useState('');
  const [still] = useState(prefersReducedMotion);

  async function add(): Promise<void> {
    setBusy(true);
    onError?.(null);
    const res = await client.post('/friends/requests', { userId });
    setBusy(false);
    if (!res.ok) return onError?.(describeError(res.error, t));
    setState('pending_out');
    onStatus?.('pending_out');
    setMoment((m) => ({ way: 'away', n: (m?.n ?? 0) + 1 }));
    setSaid(t('profile.requestSent'));
  }

  async function cancel(): Promise<void> {
    onError?.(null);
    const res = await client.delete(`/friends/requests/${userId}`);
    if (!res.ok) return onError?.(describeError(res.error, t));
    setState('none');
    onStatus?.('none');
    setMoment((m) => ({ way: 'back', n: (m?.n ?? 0) + 1 }));
    setSaid('');
  }

  return (
    <span className={`friend-ask${block ? ' is-block' : ''}`}>
      {state === 'pending_out' ? (
        <ConfirmButton
          className={`btn btn-secondary btn-sm friend-ask-sent${block ? ' btn-block' : ''}${moment?.way === 'away' ? ' is-fresh' : ''}`}
          label={
            <>
              <TicketIcon size={16} />
              {t('friends.requested')}
            </>
          }
          title={t('friends.cancelRequest', { name })}
          onConfirm={cancel}
        />
      ) : (
        <Button size="sm" variant={variant} block={block} onClick={() => void add()} disabled={busy}>
          {busy ? t('profile.sending') : (label ?? t('profile.addFriend'))}
        </Button>
      )}
      {moment && !still && (
        <Ticket key={moment.n} tone="friend" stub={<TicketIcon size={11} />} className={`friend-ask-ticket is-${moment.way}`} aria-hidden="true" />
      )}
      <span className="sr-only" role="status">
        {said}
      </span>
    </span>
  );
}

/** Whoever is asking, as the lists hold them. */
interface Asker {
  userId: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

/**
 * A friend request waiting on you. `onAnswer` sends the answer and reports whether it went through; once stamped or
 * folded, `onSettled` lets the lists move on.
 */
export function RequestTicket({
  person,
  onAnswer,
  onSettled,
  onOpen,
  compact = false,
}: {
  person: Asker;
  onAnswer: (accept: boolean) => Promise<boolean>;
  onSettled: () => void;
  /** Opens their profile from their name. */
  onOpen?: () => void;
  /** The social rail's narrow column, with the answers under the name. */
  compact?: boolean;
}): React.JSX.Element {
  const t = useT();
  const [phase, setPhase] = useState<'open' | 'busy' | 'friends' | 'declined'>('open');
  const [still] = useState(prefersReducedMotion);
  const name = person.displayName || person.username;

  async function answer(accept: boolean): Promise<void> {
    // A decline folds away while it is sent; an accept waits for the server before it is stamped.
    setPhase(accept ? 'busy' : 'declined');
    const [ok] = await Promise.all([onAnswer(accept), accept || still ? null : wait(FOLD_MS)]);
    if (!ok) {
      setPhase('open');
      return;
    }
    if (accept) {
      setPhase('friends');
      await wait(FRIENDS_MS);
    }
    onSettled();
  }

  const friends = phase === 'friends';
  const look = `request-ticket${compact ? ' is-compact' : ''}${friends ? ' is-torn is-friends' : ''}${phase === 'declined' && !still ? ' is-leaving' : ''}`;
  return (
    <div className={ticketClass('friend', 'row', look)} role="group" aria-label={t('rail.wantsToBeFriendsWith', { name })}>
      <TicketStub className="request-stub">
        <Avatar url={person.avatarUrl} glyphSize={compact ? 14 : 18} />
      </TicketStub>
      <TicketBody className="request-main">
        <span className="request-text">
          {onOpen ? (
            <button type="button" className="request-name is-link" onClick={onOpen}>
              {name}
            </button>
          ) : (
            <span className="request-name">{name}</span>
          )}
          <span className="request-sub">{t('rail.wantsToBeFriends')}</span>
        </span>
        {friends ? (
          <span className="request-stamped">
            <TicketStamp tone="success" fresh>
              {t('friends.stamp')}
            </TicketStamp>
            <span className="ticket-burst is-on" />
          </span>
        ) : (
          <span className="request-actions">
            <Button size="sm" disabled={phase !== 'open'} onClick={() => void answer(true)}>
              {t('friends.accept')}
            </Button>
            <Button size="sm" variant="ghost" disabled={phase !== 'open'} onClick={() => void answer(false)}>
              {/* Each place keeps its own label. */}
              {compact ? t('rail.decline') : t('friends.decline')}
            </Button>
          </span>
        )}
        <span className="sr-only" role="status">
          {friends ? t('friends.nowFriends', { name }) : ''}
        </span>
      </TicketBody>
    </div>
  );
}
