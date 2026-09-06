import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { FeedItem } from '../lib/types';
import { Loading, ErrorState } from '../components/states';
import { FeedCard } from '../feed/FeedCard';
import { PostButton } from '../feed/PostButton';
import { SECTIONS, asSection, kindWithin } from '../feed/postKinds';

const PAGE = 20;

/**
 * Civak — everything the community has written and posted, on one wall.
 *
 * Stories, poems and pictures were three pages that were the same page three
 * times, and a poem posted this morning was invisible to anyone browsing
 * pictures. One wall, one card, and a filter for when you do want just one kind.
 *
 * The filter lives in the URL so a filtered wall can be linked to, and so the
 * old /app/stories and /app/poems addresses can simply redirect here.
 */
export function Civak(): React.JSX.Element {
  const { client } = useAuth();
  const [params, setParams] = useSearchParams();
  const section = asSection(params.get('section'));
  // a kind belongs to a half; one left over from the other half is dropped
  // rather than asked for, which the server would refuse
  const kind = kindWithin(section, params.get('kind'));
  const kinds = SECTIONS.find((s) => s.key === section)?.kinds ?? [];

  const choose = (nextSection: string, nextKind: string | null): void => {
    const next: Record<string, string> = {};
    if (nextSection !== 'all') next.section = nextSection;
    if (nextKind) next.kind = nextKind;
    setParams(next, { replace: true });
  };

  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  const load = useCallback(
    async (offset: number): Promise<void> => {
      const query = new URLSearchParams({ section, limit: String(PAGE), offset: String(offset) });
      if (kind) query.set('kind', kind);
      const res = await client.get<{ items: FeedItem[] }>(`/feed?${query}`);
      if (!res.ok) {
        setError(describeError(res.error));
        setItems([]);
        return;
      }
      setError(null);
      const batch = res.data.items ?? [];
      setItems((prev) => (offset === 0 ? batch : [...(prev ?? []), ...batch]));
      setMore(batch.length === PAGE);
    },
    [client, section, kind],
  );

  useEffect(() => {
    setItems(null);
    void load(0);
  }, [load]);

  /** Replace one card in place, so a like does not reload the wall. */
  const replace = useCallback((next: FeedItem) => {
    setItems((prev) => (prev ?? []).map((i) => (i.key === next.key ? next : i)));
  }, []);

  /** A post its author just deleted is gone; leaving the card would be a lie. */
  const drop = useCallback((gone: FeedItem) => {
    setItems((prev) => (prev ?? []).filter((i) => i.key !== gone.key));
  }, []);

  return (
    <div className="container container-feed">
      <div className="page-header">
        <span className="eyebrow">Civak · Community</span>
        <h1 className="page-title">Civak</h1>
        <p className="page-sub">Stories, poems and pictures from everyone.</p>
      </div>

      {/* the + belongs with the wall it adds to, not adrift under the heading */}
      <div className="feed-filters">
        <div className="seg" role="group" aria-label="Show">
          {SECTIONS.map((sct) => (
            <button
              key={sct.key}
              type="button"
              className={`seg-btn${section === sct.key ? ' is-active' : ''}`}
              aria-pressed={section === sct.key}
              /* "Gotin" is both a half and a kind within it, so each says which
                 it is — two identical buttons side by side is a coin toss */
              aria-label={`Show ${sct.label}`}
              onClick={() => choose(sct.key, null)}
            >
              {sct.label}
            </button>
          ))}
        </div>

        {/* the second level appears only once there is a half to narrow */}
        {kinds.length > 0 && (
          <div className="seg seg-sub" role="group" aria-label="Narrow">
            <button
              type="button"
              className={`seg-btn${kind === null ? ' is-active' : ''}`}
              aria-pressed={kind === null}
              aria-label="Only: everything"
              onClick={() => choose(section, null)}
            >
              Hemû
            </button>
            {kinds.map((k) => (
              <button
                key={k.key}
                type="button"
                className={`seg-btn${kind === k.key ? ' is-active' : ''}`}
                aria-pressed={kind === k.key}
                aria-label={`Only ${k.label}`}
                onClick={() => choose(section, k.key)}
              >
                {k.label}
              </button>
            ))}
          </div>
        )}

        <PostButton onPosted={() => void load(0)} />
      </div>

      {error && <ErrorState message={error} onRetry={() => void load(0)} />}

      {items === null ? (
        <Loading label="Loading the wall…" />
      ) : items.length === 0 ? (
        <p className="muted">Nothing here yet.</p>
      ) : (
        <>
          <div className="feed">
            {items.map((item) => (
              <FeedCard key={item.key} item={item} onChanged={replace} onRemoved={drop} />
            ))}
          </div>
          {more && (
            <button type="button" className="mkp-more" onClick={() => void load(items.length)}>
              Show more
            </button>
          )}
        </>
      )}
    </div>
  );
}
