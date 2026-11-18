import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { ConfirmButton } from '../components/ConfirmButton';
import { useApiGet } from '../lib/useApi';
import { describeError } from '../lib/api';
import { useProfileModal } from '../profile/ProfileModal';
import { UserActions } from '../profile/UserActions';
import { ErrorState, EmptyState } from '../components/states';
import { FriendListSkeleton } from '../components/skeletons';
import { Avatar } from '../components/Avatar';
import { useT } from '../i18n/I18nProvider';
import { PlayWithButton } from '../play/PlayButtons';
import type { UserSummary } from '../lib/types';
import { LinkButton } from '../components/Button';
import { SearchIcon } from '../components/icons';
import { useRail } from '../social/RailProvider';
import { RequestTicket } from '../social/FriendTickets';

function Row({ user, actions, meta }: { user: UserSummary; actions?: React.ReactNode; meta?: string }): React.JSX.Element {
  const { openProfile } = useProfileModal();
  return (
    <div className="friend-row">
      <button
        type="button"
        className="friend-id"
        onClick={() => openProfile({ kind: 'user', userId: user.userId, username: user.username })}
      >
        <Avatar url={user.avatarUrl} online={user.online} />
        <span className="friend-name">{user.displayName || user.username}</span>
        <span className="friend-handle">{meta ?? `@${user.username}`}</span>
      </button>
      {actions}
    </div>
  );
}

/**
 * Friends (/app/friends): your friends, requests waiting on you, and the ones you sent; finding new people is Search's
 * job, linked at the top. Messages links here for requests, so they come first, each a friendship ticket
 * (social/FriendTickets.tsx) that Accept stamps and Decline folds away.
 */
export function Friends(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const { openProfile } = useProfileModal();
  const friends = useApiGet<{ friends: UserSummary[] }>('/friends');
  const requests = useApiGet<{ requests: UserSummary[] }>('/friends/requests');
  const sent = useApiGet<{ requests: UserSummary[] }>('/friends/requests/outgoing');
  // The waiting count the social column already knows, so their place is held while this page fetches them.
  const waiting = useRail().data.requests.length;
  // Why an answer failed: a full friend list (theirs or yours) is said rather than the request just staying.
  const [err, setErr] = useState<string | null>(null);

  /** Takes back a request you sent; the other person is not told either way. */
  async function cancelRequest(userId: string): Promise<void> {
    await client.delete(`/friends/requests/${userId}`);
    sent.reload();
  }

  /**
   * Removes a friend. Removing (mutual, reversible) and blocking (silent, absolute) both live in the row's ⋯
   * (profile/UserActions.tsx), where removing is confirmed and a block says what it does first.
   */
  async function unfriend(userId: string): Promise<void> {
    await client.delete(`/friends/${userId}`);
    friends.reload();
  }

  /** Answers a request; returns whether it went through, so the ticket is stamped or folded only then. */
  async function respond(userId: string, accept: boolean): Promise<boolean> {
    setErr(null);
    const res = await client.post(`/friends/requests/${userId}/${accept ? 'accept' : 'decline'}`);
    if (!res.ok) {
      setErr(describeError(res.error, t));
      requests.reload();
    }
    return res.ok;
  }

  /** After a ticket's moment the request leaves, and a new friend joins the list. */
  function settled(): void {
    requests.reload();
    friends.reload();
  }

  return (
    <div className="container container-narrow">
      <div className="page-header page-header-row">
        <div>
          <h1 className="page-title">{t('friends.title')}</h1>
          <p className="page-sub">{t('friends.subtitle')}</p>
        </div>
        <LinkButton to="/app/search" variant="secondary" size="sm">
          <SearchIcon size={16} />
          {t('rail.findPeople')}
        </LinkButton>
      </div>

      {err && (
        <div className="msg msg-error" role="alert">
          {err}
        </div>
      )}

      {/* Incoming requests. */}
      {requests.loading && waiting > 0 && (
        <section className="friend-section">
          <h2 className="friend-heading">{t('friends.requests')}</h2>
          <FriendListSkeleton count={waiting} actions={2} />
        </section>
      )}
      {!requests.loading && (requests.data?.requests.length ?? 0) > 0 && (
        <section className="friend-section">
          <h2 className="friend-heading">{t('friends.requests')}</h2>
          <div className="post-list">
            {requests.data!.requests.map((u) => (
              <RequestTicket
                key={u.userId}
                person={u}
                onAnswer={(accept) => respond(u.userId, accept)}
                onSettled={settled}
                onOpen={() => openProfile({ kind: 'user', userId: u.userId, username: u.username })}
              />
            ))}
          </div>
        </section>
      )}

      {/* Requests you sent, so a misfire is visible and can be undone. */}
      {!sent.loading && (sent.data?.requests.length ?? 0) > 0 && (
        <section className="friend-section">
          <h2 className="friend-heading">{t('friends.sent')}</h2>
          <div className="post-list">
            {sent.data!.requests.map((u) => (
              <Row
                key={u.userId}
                user={u}
                actions={
                  <ConfirmButton
                    className="btn btn-ghost btn-sm"
                    label={t('friends.cancel')}
                    title={t('friends.cancelRequest', { name: u.displayName ?? u.username })}
                    onConfirm={() => cancelRequest(u.userId)}
                  />
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* Friends. */}
      <section className="friend-section">
        <h2 className="friend-heading">{t('friends.yours')}</h2>
        {friends.loading ? (
          <FriendListSkeleton widths={[44, 36]} />
        ) : friends.error ? (
          <ErrorState message={friends.error} onRetry={friends.reload} />
        ) : (friends.data?.friends.length ?? 0) === 0 ? (
          <EmptyState title={t('friends.noneTitle')} message={t('friends.noneBody')} />
        ) : (
          <div className="post-list">
            {friends.data!.friends.map((u) => (
              <Row
                key={u.userId}
                user={u}
                actions={
                  <>
                    {/* A game with them: the invite sheet with them chosen. */}
                    <PlayWithButton userId={u.userId} name={u.displayName || u.username} className="btn btn-secondary btn-sm friend-play" iconOnly />
                    {/* Everything else about them: remove, report, block. */}
                    <UserActions
                      userId={u.userId}
                      name={u.displayName || u.username}
                      remove={{
                        label: t('friends.remove'),
                        title: t('friends.removeWho', { name: u.username }),
                        onConfirm: () => unfriend(u.userId),
                      }}
                      onBlocked={friends.reload}
                    />
                  </>
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
