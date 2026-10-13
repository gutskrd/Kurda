import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { useT } from '../i18n/I18nProvider';
import type { UserSummary } from '../lib/types';
import { recentFriends } from './playApi';

/** Friends a picker asks for: as many as `GET /friends` gives in one page. */
const FRIENDS_LIMIT = 500;

/**
 * Choosing friends to ask: a search over your friends, the ones you asked
 * recently on this device first, and who is online now (a dot, and the word
 * for a screen reader). Checkboxes, so choosing several is ordinary; when only
 * one may be asked (a game for two), choosing another swaps them.
 */
export function FriendPicker({
  selected,
  onChange,
  max,
  exclude = [],
}: {
  selected: readonly string[];
  onChange: (next: string[]) => void;
  max: number;
  /** already in the game, or already asked */
  exclude?: readonly string[];
}): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const [friends, setFriends] = useState<UserSummary[] | null>(null);
  const [q, setQ] = useState('');
  const recent = useMemo(() => recentFriends(), []);

  useEffect(() => {
    let alive = true;
    void client.get<{ friends: UserSummary[] }>(`/friends?limit=${FRIENDS_LIMIT}`).then((r) => {
      if (alive) setFriends(r.ok ? (r.data.friends ?? []) : []);
    });
    return () => {
      alive = false;
    };
  }, [client]);

  const visible = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase();
    const list = (friends ?? []).filter((f) => !exclude.includes(f.userId));
    const matching = needle
      ? list.filter((f) => `${f.displayName ?? ''} ${f.username}`.toLocaleLowerCase().includes(needle))
      : list;
    // recent first, then who is online, then by name
    const rank = (f: UserSummary): number => {
      const r = recent.indexOf(f.userId);
      return r >= 0 ? r : 100 + (f.online ? 0 : 100);
    };
    return [...matching].sort((a, b) => rank(a) - rank(b) || (a.displayName || a.username).localeCompare(b.displayName || b.username));
  }, [friends, q, exclude, recent]);

  function toggle(id: string): void {
    if (selected.includes(id)) onChange(selected.filter((s) => s !== id));
    else if (max === 1) onChange([id]);
    else if (selected.length < max) onChange([...selected, id]);
  }

  if (friends === null) return <p className="muted invite-friends-loading">{t('common.loading')}</p>;
  if (friends.length === 0) {
    return (
      <p className="invite-empty">
        {t('play.invite.none')}{' '}
        <Link to="/app/friends" className="link">
          {t('play.invite.findFriends')}
        </Link>
      </p>
    );
  }

  const recentCount = visible.filter((f) => recent.includes(f.userId)).length;
  return (
    <fieldset className="invite-friends">
      <legend className="chip-radio-legend">{t('play.invite.friends')}</legend>
      <input
        className="input invite-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('play.invite.search')}
        aria-label={t('play.invite.search')}
        autoComplete="off"
      />
      {visible.length === 0 ? (
        <p className="muted invite-empty">{t('play.invite.noMatch')}</p>
      ) : (
        <ul className="invite-list">
          {visible.map((f, i) => {
            const on = selected.includes(f.userId);
            const full = !on && max > 1 && selected.length >= max;
            return (
              <li key={f.userId}>
                {i === 0 && recentCount > 0 && !q && <span className="invite-group">{t('play.invite.recent')}</span>}
                {i === recentCount && recentCount > 0 && !q && <span className="invite-group">{t('play.invite.all')}</span>}
                <label className={`invite-friend${on ? ' is-on' : ''}${full ? ' is-full' : ''}`}>
                  <input type="checkbox" checked={on} disabled={full} onChange={() => toggle(f.userId)} />
                  <Avatar url={f.avatarUrl} online={f.online} glyphSize={18} />
                  <span className="invite-friend-text">
                    <span className="invite-friend-name">{f.displayName || f.username}</span>
                    <span className="invite-friend-handle">
                      @{f.username}
                      {f.online && <span className="sr-only"> · {t('play.invite.online')}</span>}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {max > 1 && selected.length >= max && <p className="muted invite-max">{t('play.invite.max', { count: max })}</p>}
    </fieldset>
  );
}
