import { useMemo, useState } from 'react';
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
import { listStories } from '../storiesApi';
import { Badge, Button, Icon, PageHeader, Section, Table, Tabs, useLoad, type Column, type Tone } from '../ui';

const FILTER_KEY = 'kurda_admin_stories_filter';

const STATUS_TABS: ReadonlyArray<StoryStatus | 'all'> = ['all', 'draft', 'in_review', 'published', 'archived'];

export const STATUS_TONE: Record<StoryStatus, Tone> = { draft: 'warn', in_review: 'info', published: 'ok', archived: 'neutral' };

const PROBLEM_TONE: Record<ReturnType<typeof problemLabel>['tone'], Tone> = { danger: 'bad', mid: 'warn', ok: 'ok', '': 'neutral' };

/** The audio studio on one story's sentences. */
export function storyRecordHref(id: string): string {
  return `#/audio/stories?story=${encodeURIComponent(id)}`;
}

function savedFilter(): ListFilter {
  const fallback: ListFilter = { status: 'all', dialect: 'all', query: '' };
  try {
    const raw = JSON.parse(sessionStorage.getItem(FILTER_KEY) ?? 'null') as Partial<ListFilter> | null;
    if (!raw) return fallback;
    return {
      status: STATUS_TABS.some((s) => s === raw.status) ? raw.status! : 'all',
      dialect: raw.dialect === 'kurmanci' || raw.dialect === 'sorani' ? raw.dialect : 'all',
      query: typeof raw.query === 'string' ? raw.query : '',
    };
  } catch {
    return fallback;
  }
}

/**
 * Every story, whatever its status, with what stands between each and
 * publishing, and a Record link into the audio studio for its sentences.
 * Filtering happens here rather than in the request: the list is small, and
 * the counts on the tabs and the coverage card must count every story, not
 * just the ones on screen.
 */
export function StoryList({ onNew }: { onNew: () => void }): React.JSX.Element {
  const list = useLoad(listStories, []);
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

  const all = useMemo(() => list.data ?? [], [list.data]);
  const shown = useMemo(() => (list.data ? filterStories(list.data, filter) : null), [list.data, filter]);
  const counts = statusCounts(all, filter.dialect);
  const filtered = filter.status !== 'all' || filter.dialect !== 'all' || filter.query.trim() !== '';

  return (
    <div>
      <PageHeader
        title="Stories"
        subtitle="Short texts to read, each with the questions a quiz asks about it. Learners see a story only once it is published."
        actions={
          <>
            <Button icon="refresh" onClick={() => void list.reload()} disabled={list.loading}>
              Refresh
            </Button>
            <Button variant="primary" icon="plus" onClick={onNew}>
              New story
            </Button>
          </>
        }
      />

      {all.length > 0 && <Coverage stories={all} />}

      <Tabs
        label="Status"
        value={filter.status}
        onChange={(status) => setFilter({ status })}
        items={STATUS_TABS.map((s) => ({ key: s, label: s === 'all' ? 'All' : STATUS_NAME[s], count: counts[s] }))}
      />

      <Section flush title={shown && shown.length !== all.length ? `${shown.length} of ${all.length} stories` : `${all.length} stories`}>
        <div className="table-tools">
          <div className="search-box">
            <Icon name="search" size={16} />
            <input
              type="search"
              aria-label="Search by title or address"
              placeholder="Search title or address"
              value={filter.query}
              onChange={(e) => setFilter({ query: e.target.value })}
            />
          </div>
          <select aria-label="Variety" value={filter.dialect} onChange={(e) => setFilter({ dialect: e.target.value as StoryDialect | 'all' })}>
            <option value="all">Both varieties</option>
            {STORY_DIALECTS.map((d) => (
              <option key={d} value={d}>
                {DIALECT_NAME[d]}
              </option>
            ))}
          </select>
        </div>
        <StoryTable
          stories={shown}
          loading={list.loading}
          error={list.error}
          onRetry={() => void list.reload()}
          empty={filtered ? 'No story matches these filters.' : 'No stories yet. Write the first one with “New story”.'}
        />
      </Section>
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
    <Section title="What learners can play" description="Published stories by variety and length. A game offers only the lengths that have one.">
      <div className="st-coverage">
        {STORY_DIALECTS.map((d) => (
          <div key={d} className="st-coverage-row">
            <strong>{DIALECT_NAME[d]}</strong>
            {STORY_LENGTHS.map((l) => (
              <Badge key={l} tone={coverage[d][l] === 0 ? 'bad' : 'ok'}>
                {LENGTH_NAME[l]}: {coverage[d][l]}
              </Badge>
            ))}
          </div>
        ))}
      </div>
    </Section>
  );
}

const columns: Column<AdminStorySummary>[] = [
  {
    key: 'title',
    header: 'Title',
    card: 'title',
    sort: (a, b) => a.title.localeCompare(b.title),
    cell: (s) => {
      const script = storyTextDirection(s.dialect);
      return (
        <>
          <a href={`#/stories/${s.id}`} className="st-open">
            <strong lang={script.lang} dir={script.dir}>
              {s.title || 'Untitled'}
            </strong>
          </a>
          {needsNativeReview(s) && (
            <span className="st-starter">
              <Badge tone="warn">Starter (needs native review)</Badge>
            </span>
          )}
          <span className="cell-sub mono">{s.slug}</span>
        </>
      );
    },
  },
  { key: 'variety', header: 'Variety', sort: (a, b) => a.dialect.localeCompare(b.dialect), cell: (s) => DIALECT_NAME[s.dialect] },
  { key: 'level', header: 'Level', sort: (a, b) => a.level - b.level, cell: (s) => <Badge>{s.level}</Badge> },
  {
    key: 'length',
    header: 'Length',
    cell: (s) =>
      s.length ? (
        <Badge>{LENGTH_NAME[s.length]}</Badge>
      ) : (
        <Badge tone="warn" title="The word count is in no length's band">
          No length
        </Badge>
      ),
  },
  { key: 'words', header: 'Words', align: 'end', sort: (a, b) => a.wordCount - b.wordCount, cell: (s) => s.wordCount.toLocaleString() },
  {
    key: 'questions',
    header: 'Questions',
    align: 'end',
    cell: (s) => {
      const bank = bankLabel(s);
      return bank.short ? (
        <Badge tone="warn" title="Fewer questions than its length needs">
          {bank.text}
        </Badge>
      ) : (
        bank.text
      );
    },
  },
  { key: 'status', header: 'Status', sort: (a, b) => a.status.localeCompare(b.status), cell: (s) => <Badge tone={STATUS_TONE[s.status]}>{STATUS_NAME[s.status]}</Badge> },
  {
    key: 'problems',
    header: 'Problems',
    cell: (s) => {
      const p = problemLabel(s);
      return <Badge tone={PROBLEM_TONE[p.tone]}>{p.text}</Badge>;
    },
  },
];

export function StoryTable({
  stories,
  loading,
  error,
  onRetry,
  empty,
}: {
  stories: readonly AdminStorySummary[] | null;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  empty: string;
}): React.JSX.Element {
  return (
    <Table
      caption="Stories"
      columns={columns}
      rows={stories}
      rowKey={(s) => s.id}
      loading={loading}
      error={error}
      onRetry={onRetry}
      what="writing stories"
      empty={empty}
      actions={(s) => (
        <>
          <a className="button-link" href={`#/stories/${s.id}`} aria-label={`Open “${s.title || 'Untitled'}”`}>
            Open
          </a>
          {s.status !== 'archived' && (
            <a className="button-link" href={storyRecordHref(s.id)} aria-label={`Record the sentences of “${s.title || 'Untitled'}”`}>
              <Icon name="mic" />
              Record
            </a>
          )}
        </>
      )}
    />
  );
}
