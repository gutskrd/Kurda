import { useState } from 'react';
import { useApiGet } from '../lib/useApi';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { Loading, ErrorState, EmptyState } from '../components/states';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import type { LibraryPost } from '../lib/types';

type Sort = 'newest' | 'popular';

function excerpt(body: string, n = 180): string {
  const clean = body.replace(/\s+/g, ' ').trim();
  return clean.length > n ? `${clean.slice(0, n).trimEnd()}…` : clean;
}

/**
 * Browse the public community library, filtered to one type. `/library/posts`
 * is the one endpoint the API serves without auth, so Stories and Poems show
 * real content to signed-out visitors.
 */
export function Library({
  type,
  title,
  eyebrow,
  intro,
}: {
  type: 'story' | 'poem';
  title: string;
  eyebrow: string;
  intro: string;
}): React.JSX.Element {
  const { status } = useAuth();
  const [sort, setSort] = useState<Sort>('newest');
  const [composing, setComposing] = useState(false);
  const { data, error, loading, reload } = useApiGet<{ posts: LibraryPost[] }>(
    `/library/posts?type=${type}&sort=${sort}&limit=40`,
  );

  const posts = data?.posts ?? [];
  const kind = type === 'story' ? 'story' : 'poem';

  return (
    <div className="container">
      <div className="page-header">
        <span className="eyebrow">{eyebrow}</span>
        <h1 className="page-title">{title}</h1>
        <p className="page-sub">{intro}</p>
      </div>

      <div className="toolbar" role="tablist" aria-label="Sort">
        <button className={`chip${sort === 'newest' ? ' active' : ''}`} onClick={() => setSort('newest')}>
          Newest
        </button>
        <button className={`chip${sort === 'popular' ? ' active' : ''}`} onClick={() => setSort('popular')}>
          Most read
        </button>
        {status === 'signedIn' && (
          <Button size="sm" className="toolbar-end" onClick={() => setComposing(true)}>
            Write a {kind}
          </Button>
        )}
      </div>

      <Modal open={composing} onClose={() => setComposing(false)} label={`Write a ${kind}`}>
        <ComposeForm type={type} onDone={() => { setComposing(false); reload(); }} />
      </Modal>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : posts.length === 0 ? (
        <EmptyState
          title={`No ${type === 'story' ? 'stories' : 'poems'} yet`}
          message="Be the first to contribute — new pieces from the community will appear here."
        />
      ) : (
        <div className="post-list">
          {posts.map((p) => (
            <article className="post" key={p.id}>
              <div className="post-meta">
                <span className="badge">{p.type === 'poem' ? 'Poem' : 'Story'}</span>
                {p.audioUrl && <span className="badge badge-gold">Audio</span>}
                <span>{p.viewCount.toLocaleString()} reads</span>
              </div>
              <h3>{p.title}</h3>
              <p className="post-excerpt">{excerpt(p.body)}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

/** Compose + publish a new story or poem. */
function ComposeForm({ type, onDone }: { type: 'story' | 'poem'; onDone: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const kind = type === 'story' ? 'story' : 'poem';
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    setErr(null);
    const res = await client.post('/library/posts', { type, title: title.trim(), body: body.trim(), publish: true });
    setBusy(false);
    if (res.ok) onDone();
    else setErr(describeError(res.error));
  }

  return (
    <form className="compose" onSubmit={submit}>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>Write a {kind}</h2>
      {err && <div className="msg msg-error">{err}</div>}
      <div className="field">
        <label className="field-label" htmlFor="c-title">Title</label>
        <input id="c-title" className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder={`Your ${kind}'s title`} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="c-body">Text</label>
        <textarea id="c-body" className="input" style={{ height: 220, padding: '12px 14px', resize: 'vertical' }} value={body} maxLength={50_000} onChange={(e) => setBody(e.target.value)} placeholder={`Write your ${kind} here…`} />
        <span className="field-hint">{body.length.toLocaleString()}/50,000</span>
      </div>
      <Button type="submit" disabled={busy || !title.trim() || !body.trim()}>{busy ? 'Publishing…' : `Publish ${kind}`}</Button>
    </form>
  );
}

export function Stories(): React.JSX.Element {
  return (
    <Library
      type="story"
      eyebrow="Çîrok · Community library"
      title="Stories"
      intro="Read short stories in Kurdish, written and narrated by the MyKurda community. Many include audio you can listen along to."
    />
  );
}

export function Poems(): React.JSX.Element {
  return (
    <Library
      type="poem"
      eyebrow="Helbest · Community library"
      title="Poems"
      intro="A living collection of Kurdish poetry — from the classics to new voices, shared by readers like you."
    />
  );
}
