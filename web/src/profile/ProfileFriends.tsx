import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useProfileModal } from './ProfileModal';
import { Avatar } from '../components/Avatar';
import { useT } from '../i18n/I18nProvider';
import type { UserSummary } from '../lib/types';

/** Enough to show who someone knows without turning a profile into a directory. */
const SHOW = 12;

/**
 * A friend, as `GET /users/:id/friends` actually returns one.
 *
 * This said `id`, and the endpoint has always said `userId`. So every face in
 * this list opened `/users/undefined` and the card came back "Couldn't load this
 * profile — request validation failed": the one thing the list is for did not
 * work, and nothing in the types noticed, because the shape was declared here
 * by hand instead of being the one the client already has.
 *
 * `UserSummary` is that shape. Using it means the next change to the endpoint
 * is a type error here rather than a dead link.
 */
type FriendOf = UserSummary;

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
  const t = useT();
  const [friends, setFriends] = useState<FriendOf[] | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFriends(null);
    void (async () => {
      // ask for the twelve this draws, not all five hundred somebody may
      // have; `total` is what the line underneath needs, and it comes back
      // with the page
      const res = await client.get<{ friends: FriendOf[]; total: number }>(
        `/users/${userId}/friends?limit=${SHOW}`,
      );
      if (cancelled) return;
      setFriends(res.ok ? (res.data.friends ?? []) : []);
      setTotal(res.ok ? (res.data.total ?? 0) : 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [client, userId]);

  if (!friends || friends.length === 0) return null;

  return (
    <section className="mkp-friends">
      <h2 className="friend-heading">
        {t('nav.friends')} <span className="mkp-friends-count">{total}</span>
      </h2>
      <ul className="mkp-friends-list">
        {friends.map((f) => (
          <li key={f.userId}>
            <button
              type="button"
              className="mkp-friend"
              onClick={() => openProfile({ kind: 'user', userId: f.userId, username: f.username })}
              title={f.displayName || f.username}
            >
              <Avatar url={f.avatarUrl ?? null} glyphSize={20} />
              <span className="mkp-friend-name">{f.displayName || f.username}</span>
            </button>
          </li>
        ))}
      </ul>
      {total > friends.length && (
        <p className="muted mkp-friends-more">{t('profile.friendsMore', { count: total - friends.length })}</p>
      )}
    </section>
  );
}
