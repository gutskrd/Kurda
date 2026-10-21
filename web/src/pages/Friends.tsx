import { useAuth } from '../auth/AuthProvider';
import { ConfirmButton } from '../components/ConfirmButton';
import { useApiGet } from '../lib/useApi';
import { useProfileModal } from '../profile/ProfileModal';
import { ErrorState, EmptyState } from '../components/states';
import { FriendListSkeleton } from '../components/skeletons';
import { Button } from '../components/Button';
import { Avatar } from '../components/Avatar';
import { useT } from '../i18n/I18nProvider';
import { PlayWithButton } from '../play/PlayButtons';
import type { UserSummary } from '../lib/types';
import { LinkButton } from '../components/Button';
import { SearchIcon } from '../components/icons';
import { useRail } from '../social/RailProvider';

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
 * Friends (/app/friends): the people you have, the requests waiting on you and
 * the ones you sent.
 *
 * Finding someone new is Search's job now — one field for people and words,
 * with the people you may know under it — so this page keeps to the people
 * already in your life, and a way across to Search at the top. Messages links
 * here from its "Friend requests" row, which is why requests come first.
 */
export function Friends(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const friends = useApiGet<{ friends: UserSummary[] }>('/friends');
  const requests = useApiGet<{ requests: UserSummary[] }>('/friends/requests');
  const sent = useApiGet<{ requests: UserSummary[] }>('/friends/requests/outgoing');
  // how many requests are waiting, as the social column already knows: their
  // place is held while this page asks for them, rather than opening up above
  // your friends once they arrive
  const waiting = useRail().data.requests.length;

  /** Take back a request you sent — nothing tells the other person either way. */
  async function cancelRequest(userId: string): Promise<void> {
    await client.delete(`/friends/requests/${userId}`);
    sent.reload();
  }

  /**
   * Unfriending and blocking are different things and are offered as such.
   * Removing is mutual and reversible; blocking is silent and absolute, so it
   * is the quieter of the two buttons rather than the louder one.
   */
  async function unfriend(userId: string): Promise<void> {
    await client.delete(`/friends/${userId}`);
    friends.reload();
  }

  async function block(userId: string): Promise<void> {
    await client.post(`/friends/${userId}/block`);
    friends.reload();
  }

  async function respond(userId: string, accept: boolean): Promise<void> {
    await client.post(`/friends/requests/${userId}/${accept ? 'accept' : 'decline'}`);
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

      {/* incoming requests */}
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
              <Row
                key={u.userId}
                user={u}
                actions={
                  <span className="friend-actions">
                    <Button size="sm" onClick={() => respond(u.userId, true)}>
                      {t('friends.accept')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => respond(u.userId, false)}>
                      {t('friends.decline')}
                    </Button>
                  </span>
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* requests you sent — otherwise a misfire is invisible and permanent */}
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

      {/* friends */}
      <section className="friend-section">
        <h2 className="friend-heading">{t('friends.yours')}</h2>
        {friends.loading ? (
          <FriendListSkeleton actions={3} />
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
                    {/* a game with them: the invite sheet, with them already chosen */}
                    <PlayWithButton userId={u.userId} name={u.displayName || u.username} className="btn btn-secondary btn-sm friend-play" iconOnly />
                    <ConfirmButton
                      className="btn btn-secondary btn-sm"
                      title={t('friends.removeWho', { name: u.username })}
                      label={t('friends.remove')}
                      onConfirm={() => unfriend(u.userId)}
                    />
                    <ConfirmButton
                      className="btn btn-ghost btn-sm"
                      title={t('friends.blockWho', { name: u.username })}
                      label={t('friends.block')}
                      onConfirm={() => block(u.userId)}
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
