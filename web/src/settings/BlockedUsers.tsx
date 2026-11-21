import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { failureText, useOptimisticSend } from '../lib/optimistic';
import { ConfirmButton } from '../components/ConfirmButton';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { BlocklistSkeleton } from '../components/skeletons';
import type { BlockedUser } from '../lib/types';
import { useT } from '../i18n/I18nProvider';

/** Matches the server's page size, so "Show more" asks for exactly one more page. */
const PAGE = 25;

/** "3 Sep" or "3 Sep 2024", with the year only when it is not this one. */
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
 * The people the reader has blocked, and the only way to unblock them: a block hides the person everywhere, so no
 * other screen could offer to undo it. Names are not links, since a blocked profile is a 404 to the blocker.
 */
export function BlockedUsers(): React.JSX.Element {
  const { client } = useAuth();
  const sendShown = useOptimisticSend();
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

  /** Loads one page; `offset` 0 replaces the list, anything else appends. */
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
      // A 200 without a list shows as empty rather than crashing.
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
   * Unblocks: the row goes at once, without a reload that would shuffle the rows below, and comes back in its place
   * with the reason if the server refuses (lib/optimistic.ts).
   */
  async function unblock(user: BlockedUser): Promise<void> {
    const at = list.findIndex((b) => b.userId === user.userId);
    setError(null);
    setList((prev) => prev.filter((b) => b.userId !== user.userId));
    setTotal((n) => Math.max(0, n - 1));
    await sendShown(
      () => client.delete(`/friends/${user.userId}/block`),
      {
        undo: () => {
          setList((prev) => (prev.some((b) => b.userId === user.userId) ? prev : [...prev.slice(0, at), user, ...prev.slice(at)]));
          setTotal((n) => n + 1);
        },
      },
      { onFailed: (refusal) => setError(failureText(refusal, t)) },
    );
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
      <p className="muted" style={{ fontSize: 'var(--text)', marginBottom: 14 }}>
        {t('settings.blocked.help')}
      </p>

      {error && <div className="msg msg-error" role="status" style={{ marginBottom: 12 }}>{error}</div>}

      {state === 'loading' ? (
        <BlocklistSkeleton label="settings.blocked.loading" />
      ) : state === 'error' ? (
        <Button variant="secondary" size="sm" onClick={() => void load(0)}>
          {t('common.retry')}
        </Button>
      ) : list.length === 0 ? (
        <p className="field-hint" style={{ marginBottom: 0 }}>
          {t('settings.blocked.none')}
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
                    @{u.username} · {t('settings.blocked.since', { date: when(u.blockedAt) })}
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

          {/* Shown outside the confirm too: unblocking does not restore a friendship, but does make the reader reachable again. */}
          <p className="field-hint" style={{ marginBottom: 0, marginTop: 14 }}>
            {t('settings.blocked.unblockHint')}
          </p>
        </>
      )}
    </section>
  );
}
