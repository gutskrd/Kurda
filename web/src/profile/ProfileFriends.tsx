import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useProfileModal } from './ProfileModal';
import { Avatar } from '../components/Avatar';
import { useLocale, useT } from '../i18n/I18nProvider';
import { Sheet } from '../components/Sheet';
import type { UserSummary } from '../lib/types';

/** Enough to show who someone knows without turning a profile into a directory. */
/** How many faces the block draws; a page that asks for the list itself asks for this many. */
export const FRIENDS_SHOWN = 12;
const SHOW = FRIENDS_SHOWN;

/** A friend as `GET /users/:id/friends` returns one, in the client’s shared shape. */
type FriendOf = UserSummary;

/**
 * Who this person knows, as one line of faces and names that opens the list, each face there opening their card. The
 * server applies the profile's privacy and returns no friends when the detail is hidden; nothing renders for an empty
 * list.
 */
export function ProfileFriends({
  userId,
  initial,
}: {
  userId: string;
  /** The list when the page fetched it with the profile, so the block does not appear late and push content down. */
  initial?: { friends: FriendOf[]; total: number } | null;
}): React.JSX.Element | null {
  const { client } = useAuth();
  const { openProfile } = useProfileModal();
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<FriendOf[] | null>(initial?.friends ?? null);
  const [total, setTotal] = useState(initial?.total ?? 0);
  const given = initial != null;

  useEffect(() => {
    if (given) return;
    let cancelled = false;
    setFriends(null);
    void (async () => {
      // Only the twelve shown; `total` for the line below comes with the page.
      const res = await client.get<{ friends: FriendOf[]; total: number }>(
        `/users/${userId}/friends?limit=${SHOW}`,
      );
      if (cancelled) return;
      const list = res.ok ? (res.data.friends ?? []) : [];
      setFriends(list);
      // an API that predates paging sends no total, and sent every friend
      setTotal(res.ok ? (res.data.total ?? list.length) : 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [client, userId, given]);

  if (!friends || friends.length === 0) return null;
  const names = friends.slice(0, 2).map((f) => f.displayName || f.username);

  return (
    <>
      {/* Who they know in one line, as faces stacked with the first names; the whole list opens over the page. */}
      <button type="button" className="mkp-friends-line" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span className="mkp-friends-faces" aria-hidden="true">
          {friends.slice(0, 3).map((f) => (
            <Avatar key={f.userId} url={f.avatarUrl ?? null} glyphSize={14} />
          ))}
        </span>
        <span className="mkp-friends-said">
          <span className="mkp-friends-count">{t('nav.friends')} · {total.toLocaleString(locale)}</span>
          <span className="mkp-friends-names" dir="auto">
            {names.join(', ')}
          </span>
        </span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} label={t('nav.friends')}>
        <h2 className="friend-heading">
          {t('nav.friends')} <span className="mkp-friends-count">{total}</span>
        </h2>
        <ul className="mkp-friends-list">
          {friends.map((f) => (
            <li key={f.userId}>
              <button
                type="button"
                className="mkp-friend"
                onClick={() => {
                  setOpen(false);
                  openProfile({ kind: 'user', userId: f.userId, username: f.username });
                }}
                title={f.displayName || f.username}
              >
                <Avatar url={f.avatarUrl ?? null} glyphSize={20} />
                <span className="mkp-friend-name">{f.displayName || f.username}</span>
              </button>
            </li>
          ))}
        </ul>
        {total > friends.length && <p className="muted mkp-friends-more">{t('profile.friendsMore', { count: total - friends.length })}</p>}
      </Sheet>
    </>
  );
}
