import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { ConfirmButton } from '../components/ConfirmButton';
import { useApiGet } from '../lib/useApi';
import { useProfileModal } from '../profile/ProfileModal';
import { ErrorState, EmptyState } from '../components/states';
import { FriendListSkeleton } from '../components/skeletons';
import { Button } from '../components/Button';
import { Avatar } from '../components/Avatar';
import { useT } from '../i18n/I18nProvider';
import type { SuggestedFriend, UserSummary } from '../lib/types';

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

export function Friends(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const friends = useApiGet<{ friends: UserSummary[] }>('/friends');
  const requests = useApiGet<{ requests: UserSummary[] }>('/friends/requests');
  const sent = useApiGet<{ requests: UserSummary[] }>('/friends/requests/outgoing');
  const suggestions = useApiGet<{ suggestions: SuggestedFriend[] }>('/friends/suggestions');

  const [q, setQ] = useState('');
  const [results, setResults] = useState<UserSummary[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [requested, setRequested] = useState<Set<string>>(new Set());

  async function addFriend(userId: string): Promise<void> {
    const res = await client.post('/friends/requests', { userId });
    if (res.ok) {
      setRequested((prev) => new Set(prev).add(userId));
      sent.reload();
    }
  }

  /** Take back a request you sent — nothing tells the other person either way. */
  async function cancelRequest(userId: string): Promise<void> {
    await client.delete(`/friends/requests/${userId}`);
    setRequested((prev) => {
      const next = new Set(prev);
      next.delete(userId);
      return next;
    });
    sent.reload();
    suggestions.reload();
  }

  async function search(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (q.trim().length < 1) return;
    setSearching(true);
    const res = await client.get<{ results: UserSummary[] }>(`/users/search?q=${encodeURIComponent(q.trim())}`);
    setSearching(false);
    setResults(res.ok ? res.data.results : []);
  }

  /**
   * Unfriending and blocking are different things and are offered as such.
   * Removing is mutual and reversible; blocking is silent and absolute, so it
   * is the quieter of the two buttons rather than the louder one.
   */
  async function unfriend(userId: string): Promise<void> {
    await client.delete(`/friends/${userId}`);
    friends.reload();
    suggestions.reload();
  }

  async function block(userId: string): Promise<void> {
    await client.post(`/friends/${userId}/block`);
    friends.reload();
    suggestions.reload();
  }

  async function respond(userId: string, accept: boolean): Promise<void> {
    await client.post(`/friends/requests/${userId}/${accept ? 'accept' : 'decline'}`);
    requests.reload();
    friends.reload();
    suggestions.reload();
  }

  return (
    <div className="container container-narrow">
      <div className="page-header">
        <span className="eyebrow">{t('friends.eyebrow')}</span>
        <h1 className="page-title">{t('friends.title')}</h1>
        <p className="page-sub">{t('friends.subtitle')}</p>
      </div>

      {/* search */}
      <form className="friend-search" onSubmit={search}>
        <input
          className="input"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('friends.searchPlaceholder')}
          aria-label={t('friends.searchLabel')}
        />
        <Button type="submit" disabled={searching}>
          {searching ? t('friends.searching') : t('friends.search')}
        </Button>
      </form>

      {results !== null && (
        <section className="friend-section">
          <h2 className="friend-heading">{t('friends.results')}</h2>
          {results.length === 0 ? (
            <p className="muted" style={{ fontSize: '0.92rem' }}>{t('friends.noResults')}</p>
          ) : (
            <div className="post-list">
              {results.map((u) => (
                <Row key={u.userId} user={u} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* incoming requests */}
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

      {/* people you may know */}
      {!suggestions.loading && (suggestions.data?.suggestions?.length ?? 0) > 0 && (
        <section className="friend-section">
          <h2 className="friend-heading">{t('friends.suggestions')}</h2>
          <div className="post-list">
            {suggestions.data!.suggestions.map((u) => (
              <Row
                key={u.userId}
                user={u}
                meta={t('friends.mutual', { count: u.mutualCount })}
                actions={
                  requested.has(u.userId) ? (
                    <Button size="sm" disabled>
                      {t('friends.requested')}
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => addFriend(u.userId)}>
                      {t('friends.add')}
                    </Button>
                  )
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
          <FriendListSkeleton />
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
