import { useCallback, useEffect, useMemo, useState } from 'react';
import { STORY_DIALECTS, STORY_LENGTHS, storyTextDirection, type StoryDialect } from '@kurda/shared';
import {
  DIALECT_NAME,
  LENGTH_NAME,
  STATUS_NAME,
  bankLabel,
  filterStories,
  needsNativeReview,
  problemLabel,
  publishedCoverage,
  statusCounts,
  type AdminStorySummary,
  type ListFilter,
  type StoryStatus,
} from '../stories';
import { listStories, storyFailure } from '../storiesApi';

const FILTER_KEY = 'kurda_admin_stories_filter';

const STATUS_TABS: ReadonlyArray<[StoryStatus | 'all', string]> = [
  ['all', 'All'],
  ['draft', STATUS_NAME.draft],
  ['in_review', STATUS_NAME.in_review],
  ['published', STATUS_NAME.published],
  ['archived', STATUS_NAME.archived],
];

export const STATUS_TONE: Record<StoryStatus, string> = { draft: 'mid', in_review: '', published: 'ok', archived: 'hi' };

function savedFilter(): ListFilter {
  const fallback: ListFilter = { status: 'all', dialect: 'all', query: '' };
  try {
    const raw = JSON.parse(sessionStorage.getItem(FILTER_KEY) ?? 'null') as Partial<ListFilter> | null;
    if (!raw) return fallback;
    return {
      status: STATUS_TABS.some(([s]) => s === raw.status) ? raw.status! : 'all',
      dialect: raw.dialect === 'kurmanci' || raw.dialect === 'sorani' ? raw.dialect : 'all',
      query: typeof raw.query === 'string' ? raw.query : '',
    };
  } catch {
    return fallback;
  }
}

/**
 * Every story, whatever its status, with what stands between each and
 * publishing. Filtering happens here rather than in the request: the list is
 * small, and the counts on the tabs and the coverage card must count every
 * story, not just the ones on screen.
 */
export function StoryList({
  onOpen,
  onNew,
  flash,
}: {
  onOpen: (id: string) => void;
  onNew: () => void;
  /** a line from the editor that just closed ("Deleted …") */
  flash: string | null;
}): React.JSX.Element {
  const [stories, setStories] = useState<AdminStorySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilterState] = useState<ListFilter>(savedFilter);

  const setFilter = (next: Partial<ListFilter>): void => {
    setFilterState((f) => {
      const merged = { ...f, ...next };
      try {
        sessionStorage.setItem(FILTER_KEY, JSON.stringify(merged));
      } catch {
        // a blocked storage only means the filter is not remembered
      }
      return merged;
    });
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      setStories(await listStories());
    } catch (err) {
      const failure = storyFailure(err);
      setError(
        failure.kind === 'forbidden'
          ? 'Writing stories needs the content_editor, admin or superadmin role.'
          : `Could not load the stories: ${failure.message}`,
      );
      setStories((s) => s ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const all = useMemo(() => stories ?? [], [stories]);
  const shown = useMemo(() => filterStories(all, filter), [all, filter]);
  const counts = statusCounts(all, filter.dialect);

  return (
    <div>
      <div className="toolbar">
        <div>
          <h1>Stories</h1>
          <div className="subtle">
            Short texts to read, each with the questions a quiz asks about it. Learners see a story only once it is published.
          </div>
        </div>
        <div className="spacer" />
        <button type="button" onClick={() => void load()} disabled={stories === null}>
          Refresh
        </button>
        <button type="button" className="primary" onClick={onNew}>
          New story
        </button>
      </div>

      {flash && (
        <div className="card st-flash" role="status">
          {flash}
        </div>
      )}
      {error && <div className="card empty">{error}</div>}

      {stories && stories.length > 0 && <Coverage stories={all} />}

      <div className="tabs" role="tablist" aria-label="Status">
        {STATUS_TABS.map(([status, label]) => (
          <button
            key={status}
            type="button"
            role="tab"
            aria-selected={filter.status === status}
            className={`tab${filter.status === status ? ' active' : ''}`}
            onClick={() => setFilter({ status })}
          >
            {label} ({counts[status]})
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="toolbar st-list-tools" style={{ margin: '14px 16px 8px' }}>
          <div className="section-title" style={{ margin: 0 }}>
            {shown.length === all.length ? `${all.length} stories` : `${shown.length} of ${all.length} stories`}
          </div>
          <div className="spacer" />
          <select
            aria-label="Variety"
            value={filter.dialect}
            onChange={(e) => setFilter({ dialect: e.target.value as StoryDialect | 'all' })}
          >
            <option value="all">Both varieties</option>
            {STORY_DIALECTS.map((d) => (
              <option key={d} value={d}>
                {DIALECT_NAME[d]}
              </option>
            ))}
          </select>
          <input
            type="search"
            aria-label="Search by title or address"
            placeholder="Search title or address…"
            value={filter.query}
            onChange={(e) => setFilter({ query: e.target.value })}
          />
        </div>
        {stories === null ? (
          <div className="empty">Loading…</div>
        ) : all.length === 0 ? (
          <div className="empty">No stories yet. Write the first one with “New story”.</div>
        ) : shown.length === 0 ? (
          <div className="empty">No story matches these filters.</div>
        ) : (
          <StoryTable stories={shown} onOpen={onOpen} />
        )}
      </div>
    </div>
  );
}

/**
 * What learners can play today: published stories per variety and length. A
 * game's setup offers only the lengths that have one, so a zero is a length
 * nobody can choose.
 */
function Coverage({ stories }: { stories: readonly AdminStorySummary[] }): React.JSX.Element {
  const coverage = publishedCoverage(stories);
  return (
    <div className="card st-coverage">
      <div className="subtle">Published, so learners can read and play them:</div>
      {STORY_DIALECTS.map((d) => (
        <div key={d} className="row st-coverage-row">
          <strong>{DIALECT_NAME[d]}</strong>
          {STORY_LENGTHS.map((l) => (
            <span key={l} className={`badge${coverage[d][l] === 0 ? ' danger' : ' ok'}`}>
              {LENGTH_NAME[l]}: {coverage[d][l]}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export function StoryTable({
  stories,
  onOpen,
}: {
  stories: readonly AdminStorySummary[];
  onOpen: (id: string) => void;
}): React.JSX.Element {
  return (
    <div className="tablewrap">
      <table className="st-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Variety</th>
            <th>Level</th>
            <th>Length</th>
            <th>Words</th>
            <th>Questions</th>
            <th>Status</th>
            <th>Problems</th>
          </tr>
        </thead>
        <tbody>
          {stories.map((s) => {
            const script = storyTextDirection(s.dialect);
            const problems = problemLabel(s);
            const bank = bankLabel(s);
            return (
              <tr key={s.id}>
                <td>
                  <a
                    href={`#/stories/${s.id}`}
                    className="st-open"
                    onClick={(e) => {
                      e.preventDefault();
                      onOpen(s.id);
                    }}
                  >
                    <strong lang={script.lang} dir={script.dir}>
                      {s.title || 'Untitled'}
                    </strong>
                  </a>
                  {needsNativeReview(s) && <span className="badge mid st-starter">Starter (needs native review)</span>}
                  <div className="subtle st-slug">{s.slug}</div>
                </td>
                <td className="subtle">{DIALECT_NAME[s.dialect]}</td>
                <td>
                  <span className="badge">{s.level}</span>
                </td>
                <td>
                  {s.length ? (
                    <span className="badge">{LENGTH_NAME[s.length]}</span>
                  ) : (
                    <span className="badge mid" title="The word count is in no length's band">
                      No length
                    </span>
                  )}
                </td>
                <td className="subtle">{s.wordCount}</td>
                <td>
                  <span className={bank.short ? 'badge mid' : 'subtle'} title={bank.short ? 'Fewer questions than its length needs' : undefined}>
                    {bank.text}
                  </span>
                </td>
                <td>
                  <span className={`badge ${STATUS_TONE[s.status]}`}>{STATUS_NAME[s.status]}</span>
                </td>
                <td>
                  <span className={`badge${problems.tone ? ` ${problems.tone}` : ''}`}>{problems.text}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
