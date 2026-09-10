import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { ConfirmButton } from '../components/ConfirmButton';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { FriendListSkeleton } from '../components/skeletons';
import type { BlockedUser } from '../lib/types';
import { useT } from '../i18n/I18nProvider';

/** Matches the server's page size, so "Show more" asks for exactly one more page. */
const PAGE = 25;

/** "3 Sep" / "3 Sep 2024" — the year only when it is not this one. */
function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

interface Page {
  blocked: BlockedUser[];
  total: number;
}

/**
 * The people you have blocked, and the only way back.
 *
 * A block is deliberately total: the other person disappears from search, from
 * your friends list and from every board, and their profile answers "no such
 * user" — which means that the moment it is done, there is no longer any screen
 * anywhere in the app that could offer to undo it. Without this list a block
 * placed by accident, or in a moment, is permanent in practice. That is the
 * whole reason it lives in Settings: it is account state, like your privacy
 * setting, not a social screen.
 *
 * Names here are deliberately not clickable. Every other user's name in the app
 * opens their card, but a blocked user's profile is a 404 to you by design, so
 * a link would be a promise the app cannot keep.
 */
export function BlockedUsers(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [list, setList] = useState<BlockedUser[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  /** False once unmounted, so a page that lands late does not set state. */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** Load one page. `offset` 0 replaces the list; anything else appends. */
  const load = useCallback(
    async (offset: number): Promise<void> => {
      if (offset === 0) setState('loading');
      const res = await client.get<Page>(`/friends/blocks?limit=${PAGE}&offset=${offset}`);
      if (!alive.current) return;
      if (!res.ok) {
        setError(describeError(res.error, t));
        if (offset === 0) setState('error');
        return;
      }
      // a 200 with a body that isn't a page is still a failure to show a list;
      // an empty one is the right thing to show, and better than a crash
      const page = res.data.blocked ?? [];
      setError(null);
      setTotal(res.data.total ?? page.length);
      setList((prev) => (offset === 0 ? page : [...prev, ...page]));
      setState('ready');
    },
    [client],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  /**
   * Unblock, then take the row out — rather than reloading the page from the
   * server, which would shuffle everything below the row you just touched.
   *
   * Only on success. An unblock that quietly failed while the row vanished
   * would leave you believing you had let someone back in, or kept them out,
   * with no way to tell which.
   */
  async function unblock(user: BlockedUser): Promise<void> {
    const res = await client.delete(`/friends/${user.userId}/block`);
    if (!res.ok) {
      setError(describeError(res.error, t));
      return;
    }
    setError(null);
    setList((prev) => prev.filter((b) => b.userId !== user.userId));
    setTotal((n) => Math.max(0, n - 1));
  }

  async function more(): Promise<void> {
    setLoadingMore(true);
    await load(list.length);
    setLoadingMore(false);
  }

  return (
    <section className="card" style={{ marginTop: 20 }}>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>
        {t('settings.blocked.title')} {total > 0 && <span className="mkp-friends-count">{total}</span>}
      </h2>
      <p className="muted" style={{ fontSize: '0.92rem', marginBottom: 14 }}>
        Someone you block cannot find you, message you or send you a friend request, and you will not see them
        anywhere either. They are never told.
      </p>

      {error && <div className="msg msg-error" style={{ marginBottom: 12 }}>{error}</div>}

      {state === 'loading' ? (
        <FriendListSkeleton count={3} label="settings.blocked.loading" />
      ) : state === 'error' ? (
        <Button variant="secondary" size="sm" onClick={() => void load(0)}>
          {t('common.retry')}
        </Button>
      ) : list.length === 0 ? (
        <p className="field-hint" style={{ marginBottom: 0 }}>
          You haven’t blocked anyone. You can block someone from their profile, or from your friends list.
        </p>
      ) : (
        <>
          <ul className="blocklist">
            {list.map((u) => (
              <li key={u.userId} className="blocklist-row">
                <Avatar url={u.avatarUrl} glyphSize={20} />
                <span className="blocklist-who">
                  <span className="blocklist-name">{u.displayName || u.username}</span>
                  <span className="blocklist-meta">
                    @{u.username} · blocked {when(u.blockedAt)}
                  </span>
                </span>
                <ConfirmButton
                  className="btn btn-secondary btn-sm"
                  label={t('settings.blocked.unblock')}
                  busyLabel={t('settings.blocked.unblocking')}
                  title={t('settings.blocked.unblockWho', { name: u.displayName || u.username })}
                  onConfirm={() => unblock(u)}
                />
              </li>
            ))}
          </ul>

          {list.length < total && (
            <div style={{ marginTop: 12 }}>
              <Button variant="secondary" size="sm" disabled={loadingMore} onClick={() => void more()}>
                {loadingMore ? t('common.loading') : t('common.showMoreCount', { count: total - list.length })}
              </Button>
            </div>
          )}

          {/*
            Said here rather than only inside the confirm, because it is the part
            people get wrong: unblocking does not restore a friendship, and it
            does put you back within reach of someone you chose to get away from.
          */}
          <p className="field-hint" style={{ marginBottom: 0, marginTop: 14 }}>
            Unblocking lets that person find you and contact you again. It does not make you friends again, and they
            are not told either way.
          </p>
        </>
      )}
    </section>
  );
}
