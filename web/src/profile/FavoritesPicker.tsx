import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { FavoriteRef, LibraryPost, MeProfile } from '../lib/types';
import { useT } from '../i18n/I18nProvider';

/**
 * Favorite poem/story picker: browse the published library and pin one of each to
 * your profile. Wires the phase-3b PUT/DELETE /me/favorites/{poem,story}
 * endpoints — the server verifies the post exists, is the right type, and is
 * published, so the client only sends a post id.
 */
export function FavoritesPicker({ me, onChanged }: { me: MeProfile; onChanged: () => void }): React.JSX.Element {
  const t = useT();
  return (
    <section className="card" style={{ marginTop: 24 }}>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>{t('favorites.title')}</h2>
      <FavoriteKind kind="poem" label={t('profile.favoritePoem')} initial={me.favoritePoem ?? null} onChanged={onChanged} />
      <FavoriteKind kind="story" label={t('profile.favoriteStory')} initial={me.favoriteStory ?? null} onChanged={onChanged} />
    </section>
  );
}

function FavoriteKind({
  kind,
  label,
  initial,
  onChanged,
}: {
  kind: 'poem' | 'story';
  label: string;
  initial: FavoriteRef | null;
  onChanged: () => void;
}): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const [current, setCurrent] = useState<FavoriteRef | null>(initial);
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<LibraryPost[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function toggleBrowse(): Promise<void> {
    const next = !open;
    setOpen(next);
    setMsg(null);
    if (next && list === null) {
      setLoading(true);
      const res = await client.get<{ posts: LibraryPost[] }>(`/library/posts?type=${kind}&limit=50`);
      setLoading(false);
      if (res.ok) setList(res.data.posts ?? []);
      else setMsg({ kind: 'err', text: describeError(res.error, t) });
    }
  }

  async function choose(post: LibraryPost): Promise<void> {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const res = await client.put(`/me/favorites/${kind}`, { postId: post.id });
    setBusy(false);
    if (res.ok) {
      setCurrent({ id: post.id, title: post.title });
      setOpen(false);
      onChanged();
    } else {
      setMsg({ kind: 'err', text: describeError(res.error, t) });
    }
  }

  async function remove(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const res = await client.delete(`/me/favorites/${kind}`);
    setBusy(false);
    if (res.ok) {
      setCurrent(null);
      onChanged();
    } else {
      setMsg({ kind: 'err', text: describeError(res.error, t) });
    }
  }

  return (
    <div className="fav-kind">
      <div className="fav-row">
        <div className="fav-current">
          <span className="fav-label">{label}</span>
          <span className="fav-value">{current ? current.title : <span className="muted">{t('favorites.none')}</span>}</span>
        </div>
        <div className="fav-actions">
          {current && (
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void remove()}>
              {t('groups.remove')}
            </button>
          )}
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void toggleBrowse()}>
            {open ? t('common.cancel') : t('favorites.change')}
          </button>
        </div>
      </div>

      {msg && <div className={`msg ${msg.kind === 'ok' ? 'msg-success' : 'msg-error'}`}>{msg.text}</div>}

      {open && (
        <div className="fav-browse">
          {loading ? (
            <p className="muted" style={{ margin: 0 }}>
              {kind === 'poem' ? t('favorites.loadingPoems') : t('favorites.loadingStories')}
            </p>
          ) : list && list.length > 0 ? (
            <ul className="fav-options">
              {list.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`fav-option${current?.id === p.id ? ' is-current' : ''}`}
                    disabled={busy}
                    onClick={() => void choose(p)}
                  >
                    {p.title}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              {kind === 'poem' ? t('favorites.noPoems') : t('favorites.noStories')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
