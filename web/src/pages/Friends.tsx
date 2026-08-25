import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useApiGet } from '../lib/useApi';
import { useProfileModal } from '../profile/ProfileModal';
import { Loading, ErrorState, EmptyState } from '../components/states';
import { Button } from '../components/Button';
import { Avatar } from '../components/Avatar';
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
  const friends = useApiGet<{ friends: UserSummary[] }>('/friends');
  const requests = useApiGet<{ requests: UserSummary[] }>('/friends/requests');
  const suggestions = useApiGet<{ suggestions: SuggestedFriend[] }>('/friends/suggestions');

  const [q, setQ] = useState('');
  const [results, setResults] = useState<UserSummary[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [requested, setRequested] = useState<Set<string>>(new Set());

  async function addFriend(userId: string): Promise<void> {
    const res = await client.post('/friends/requests', { userId });
    if (res.ok) setRequested((prev) => new Set(prev).add(userId));
  }

  async function search(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (q.trim().length < 1) return;
    setSearching(true);
    const res = await client.get<{ results: UserSummary[] }>(`/users/search?q=${encodeURIComponent(q.trim())}`);
    setSearching(false);
    setResults(res.ok ? res.data.results : []);
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
        <span className="eyebrow">Heval · Community</span>
        <h1 className="page-title">Friends</h1>
        <p className="page-sub">Find other learners, send requests, and see who you’re learning alongside.</p>
      </div>

      {/* search */}
      <form className="friend-search" onSubmit={search}>
        <input
          className="input"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by username…"
          aria-label="Search users by username"
        />
        <Button type="submit" disabled={searching}>
          {searching ? 'Searching…' : 'Search'}
        </Button>
      </form>

      {results !== null && (
        <section className="friend-section">
          <h2 className="friend-heading">Search results</h2>
          {results.length === 0 ? (
            <p className="muted" style={{ fontSize: '0.92rem' }}>No users found.</p>
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
          <h2 className="friend-heading">Requests</h2>
          <div className="post-list">
            {requests.data!.requests.map((u) => (
              <Row
                key={u.userId}
                user={u}
                actions={
                  <span className="friend-actions">
                    <Button size="sm" onClick={() => respond(u.userId, true)}>
                      Accept
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => respond(u.userId, false)}>
                      Decline
                    </Button>
                  </span>
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* people you may know */}
      {!suggestions.loading && (suggestions.data?.suggestions?.length ?? 0) > 0 && (
        <section className="friend-section">
          <h2 className="friend-heading">People you may know</h2>
          <div className="post-list">
            {suggestions.data!.suggestions.map((u) => (
              <Row
                key={u.userId}
                user={u}
                meta={`${u.mutualCount} mutual friend${u.mutualCount === 1 ? '' : 's'}`}
                actions={
                  requested.has(u.userId) ? (
                    <Button size="sm" disabled>
                      Requested
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => addFriend(u.userId)}>
                      Add
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
        <h2 className="friend-heading">Your friends</h2>
        {friends.loading ? (
          <Loading />
        ) : friends.error ? (
          <ErrorState message={friends.error} onRetry={friends.reload} />
        ) : (friends.data?.friends.length ?? 0) === 0 ? (
          <EmptyState title="No friends yet" message="Search for a username above to send your first friend request." />
        ) : (
          <div className="post-list">
            {friends.data!.friends.map((u) => (
              <Row key={u.userId} user={u} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
