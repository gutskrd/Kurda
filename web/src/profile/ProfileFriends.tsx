import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useProfileModal } from './ProfileModal';
import { Avatar } from '../components/Avatar';

/** Enough to show who someone knows without turning a profile into a directory. */
const SHOW = 12;

interface FriendOf {
  id: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

/**
 * Who this person knows.
 *
 * A profile that shows a level, a country and what someone is wearing but not
 * who they know is a profile of an account rather than of a person — and on a
 * community app, who someone knows is most of what makes anyone else findable.
 *
 * The privacy rules are the profile's own and live on the server: a profile
 * whose detail you may not see returns no friends at all, so there is nothing
 * to gate here. Nothing is rendered when the list is empty, because "0 friends"
 * on someone's profile is a worse thing to publish than silence.
 *
 * Each face opens that person's own card, which is how you get from one person
 * to the next without going back to search.
 */
export function ProfileFriends({ userId }: { userId: string }): React.JSX.Element | null {
  const { client } = useAuth();
  const { openProfile } = useProfileModal();
  const [friends, setFriends] = useState<FriendOf[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFriends(null);
    void (async () => {
      const res = await client.get<{ friends: FriendOf[] }>(`/users/${userId}/friends`);
      if (cancelled) return;
      setFriends(res.ok ? (res.data.friends ?? []) : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [client, userId]);

  if (!friends || friends.length === 0) return null;
  const shown = friends.slice(0, SHOW);

  return (
    <section className="mkp-friends">
      <h2 className="friend-heading">
        Friends <span className="mkp-friends-count">{friends.length}</span>
      </h2>
      <ul className="mkp-friends-list">
        {shown.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              className="mkp-friend"
              onClick={() => openProfile({ kind: 'user', userId: f.id })}
              title={f.displayName || f.username}
            >
              <Avatar url={f.avatarUrl ?? null} glyphSize={20} />
              <span className="mkp-friend-name">{f.displayName || f.username}</span>
            </button>
          </li>
        ))}
      </ul>
      {friends.length > shown.length && (
        <p className="muted mkp-friends-more">and {friends.length - shown.length} more</p>
      )}
    </section>
  );
}
