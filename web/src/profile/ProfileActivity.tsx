import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ActivityEntry, ProfileSection, ProfileSections } from '../lib/types';
import { PROFILE_SECTIONS } from '../lib/types';
import { BookIcon, BookmarkIcon, FeatherIcon, GameIcon, HeartIcon, PhotoIcon } from '../components/icons';

const PAGE = 12;

/** What each tab is called, and the icon that stands in for an empty one. */
const LABELS: Record<ProfileSection, string> = {
  stories: 'Stories',
  poems: 'Poems',
  images: 'Dîmen',
  games: 'Games',
  likes: 'Likes',
  bookmarks: 'Saved',
};

function SectionGlyph({ kind, size = 22 }: { kind: ProfileSection; size?: number }): React.JSX.Element {
  if (kind === 'stories') return <BookIcon size={size} />;
  if (kind === 'poems') return <FeatherIcon size={size} />;
  if (kind === 'images') return <PhotoIcon size={size} />;
  if (kind === 'likes') return <HeartIcon size={size} />;
  if (kind === 'bookmarks') return <BookmarkIcon size={size} />;
  return <GameIcon size={size} />;
}

/** "3 Sep" / "3 Sep 2024" — a year only when it is not the current one. */
function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

/**
 * What someone has posted and played, under their profile.
 *
 * Tabs come from `sections` — the profile itself says which ones it shows, so a
 * hidden section never even appears as an empty tab to be clicked. Each tab
 * fetches only when it is first opened: most visitors read one of them, and
 * loading four lists to show one would cost four queries per profile view.
 *
 * On your own profile every tab stays, with the hidden ones marked: turning a
 * section off should not make your own work vanish on you, and seeing the
 * hidden ones is how you remember they are there to turn back on.
 */
export function ProfileActivity({
  userId,
  sections,
  own = false,
}: {
  userId: string;
  sections?: ProfileSections | null;
  /** viewing your own profile: show hidden sections too, labelled */
  own?: boolean;
}): React.JSX.Element | null {
  const shown = PROFILE_SECTIONS.filter((s) => own || sections?.[s] !== false);
  const [tab, setTab] = useState<ProfileSection | null>(null);

  // the first visible section is the open one; recomputed if the owner turns
  // the current tab off while the page is up
  const active = tab && shown.includes(tab) ? tab : (shown[0] ?? null);

  if (!sections || shown.length === 0 || !active) return null;

  return (
    <div className="mkp-showcase-block">
      <div className="mkp-showcase-label">Activity</div>
      <div className="mkp-showcase mkp-activity">
        <div className="mkp-tabs" role="tablist" aria-label="Profile activity">
          {shown.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              id={`mkp-tab-${s}`}
              aria-selected={s === active}
              aria-controls={`mkp-panel-${s}`}
              className={`mkp-tab${s === active ? ' is-active' : ''}`}
              onClick={() => setTab(s)}
            >
              <SectionGlyph kind={s} size={16} />
              <span>{LABELS[s]}</span>
              {sections[s] === false && <span className="mkp-tab-hidden">Hidden</span>}
            </button>
          ))}
        </div>

        {/* keyed so switching tabs starts a fresh list rather than showing the
            previous tab's entries under the new heading */}
        <ActivityPanel key={active} userId={userId} kind={active} />
      </div>
    </div>
  );
}

/** One tab's list, paged with a Show more button. */
function ActivityPanel({ userId, kind }: { userId: string; kind: ProfileSection }): React.JSX.Element {
  const { client } = useAuth();
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  const load = useCallback(
    async (offset: number): Promise<void> => {
      const res = await client.get<{ entries: ActivityEntry[] }>(
        `/users/${userId}/activity?kind=${kind}&limit=${PAGE}&offset=${offset}`,
      );
      if (!res.ok) {
        setError(describeError(res.error));
        setState('error');
        return;
      }
      const batch = res.data.entries ?? [];
      setEntries((prev) => (offset === 0 ? batch : [...prev, ...batch]));
      // a short page means the end; asking again would return nothing
      setMore(batch.length === PAGE);
      setState('ready');
    },
    [client, userId, kind],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await load(0);
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (state === 'loading') return <p className="muted mkp-activity-note">Loading…</p>;
  if (state === 'error') return <p className="muted mkp-activity-note">{error}</p>;
  if (entries.length === 0) {
    return <p className="muted mkp-activity-note">Nothing here yet.</p>;
  }

  return (
    <div id={`mkp-panel-${kind}`} role="tabpanel" aria-labelledby={`mkp-tab-${kind}`}>
      {kind === 'images' ? (
        <div className="mkp-gallery">
          {entries.map((e) => {
            const shot = (
              <>
                {e.imageUrl ? (
                  <img src={e.imageUrl} alt={e.title} loading="lazy" />
                ) : (
                  <span className="mkp-shot-empty" aria-hidden="true"><PhotoIcon size={24} /></span>
                )}
                <figcaption>{e.title}</figcaption>
              </>
            );
            return (
              <figure className="mkp-shot" key={e.id}>
                {/* a thumbnail is a promise that there is something to open */}
                {e.href ? <Link to={e.href}>{shot}</Link> : shot}
              </figure>
            );
          })}
        </div>
      ) : (
        <ul className="mkp-activity-list">
          {entries.map((e) => (
            <li key={e.id}>
              <ActivityRow entry={e} />
            </li>
          ))}
        </ul>
      )}

      {more && (
        <button type="button" className="mkp-more" onClick={() => void load(entries.length)}>
          Show more
        </button>
      )}
    </div>
  );
}

/** A row is a link when the thing has a page, and plain text when it does not. */
function ActivityRow({ entry }: { entry: ActivityEntry }): React.JSX.Element {
  const inner = (
    <>
      <span className="mkp-activity-glyph" aria-hidden="true"><SectionGlyph kind={entry.kind} /></span>
      <span className="mkp-activity-meta">
        <span className="mkp-activity-title">{entry.title}</span>
        {entry.detail && <span className="mkp-activity-detail">{entry.detail}</span>}
      </span>
      <time className="mkp-activity-when" dateTime={entry.at}>{when(entry.at)}</time>
    </>
  );
  return entry.href ? (
    <Link to={entry.href} className="mkp-activity-row">{inner}</Link>
  ) : (
    <div className="mkp-activity-row">{inner}</div>
  );
}
