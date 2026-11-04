import { useEffect, useMemo, useState } from 'react';
import { CEFR_LEVELS, STORY_DIALECTS, STORY_LENGTHS, levelOfCefr, storyTextDirection, type StoryCategory, type StoryDialect } from '@kurda/shared';
import {
  AUDIO_NAME,
  CEFR_WORD,
  DEFAULT_FILTER,
  DIALECT_NAME,
  LENGTH_NAME,
  PAGE_SIZE,
  REVIEW_NAME,
  STATUS_NAME,
  STATUS_TABS,
  bankLabel,
  categoryLabel,
  cefrLabel,
  isFiltered,
  listParams,
  needsNativeReview,
  problemLabel,
  publishedCoverage,
  readListFilter,
  type AdminStorySummary,
  type ListFilter,
  type StoryStatus,
} from '../stories';
import { listCategories, listStories, publishedStories, statusCounts } from '../storiesApi';
import { Badge, Button, Checkbox, Icon, PageHeader, Section, Table, Tabs, useDebounced, useLoad, type Column, type Tone } from '../ui';

const FILTER_KEY = 'kurda_admin_stories_filter';

export const STATUS_TONE: Record<StoryStatus, Tone> = { draft: 'warn', in_review: 'info', published: 'ok', archived: 'neutral' };
const REVIEW_TONE: Record<AdminStorySummary['reviewStatus'], Tone> = { unreviewed: 'warn', approved: 'ok' };
const AUDIO_TONE: Record<AdminStorySummary['audio'], Tone> = { none: 'neutral', partial: 'warn', full: 'ok' };

const PROBLEM_TONE: Record<ReturnType<typeof problemLabel>['tone'], Tone> = { danger: 'bad', mid: 'warn', ok: 'ok', '': 'neutral' };

/** The audio studio on one story's sentences. */
export function storyRecordHref(id: string): string {
  return `#/audio/stories?story=${encodeURIComponent(id)}`;
}

export const CATEGORIES_HREF = '#/stories/categories';

/** The filter and page as they were left, so coming back from a story lands where the editor was. */
function saved(): { filter: ListFilter; page: number } {
  try {
    const raw = JSON.parse(sessionStorage.getItem(FILTER_KEY) ?? 'null') as { page?: unknown } | null;
    const page = typeof raw?.page === 'number' && Number.isInteger(raw.page) && raw.page > 0 ? raw.page : 0;
    return { filter: readListFilter(raw), page };
  } catch {
    return { filter: DEFAULT_FILTER, page: 0 };
  }
}

function remember(filter: ListFilter, page: number): void {
  try {
    sessionStorage.setItem(FILTER_KEY, JSON.stringify({ ...filter, page }));
  } catch {
    // a blocked storage only means the filter is not remembered
  }
}

/**
 * Every story, whatever its status, with what stands between each and
 * publishing, and a Record link into the audio studio for its sentences.
 *
 * The server filters and pages the list (the library can grow past what one
 * request should carry), so each change to the filters is a new request, the
 * search once it has stopped being typed. The counts on the status tabs come
 * from the server too, for the filters without the status: a tab's count is
 * what choosing it would show.
 */
export function StoryList({ onNew }: { onNew: () => void }): React.JSX.Element {
  const [start] = useState(saved);
  const [filter, setFilterState] = useState<ListFilter>(start.filter);
  const [page, setPageState] = useState(start.page);
  const query = useDebounced(filter.query, 300);
  const effective = useMemo(() => ({ ...filter, query }), [filter, query]);
  const params = listParams(effective, page);
  const countParams = listParams({ ...effective, status: 'all' }, 0);

  const list = useLoad(() => listStories(effective, page), [params]);
  const counts = useLoad(() => statusCounts({ ...effective, status: 'all' }), [countParams]);
  const categories = useLoad(listCategories, []);
  const published = useLoad(publishedStories, []);

  const setFilter = (next: Partial<ListFilter>): void => {
    setFilterState((f) => {
      const merged = { ...f, ...next };
      remember(merged, 0);
      return merged;
    });
    // another filter is another list: it starts on its first page
    setPageState(0);
  };
  const setPage = (next: number): void => {
    setPageState(next);
    remember(filter, next);
  };

  const total = list.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // a page past the end (the list shrank since it was remembered) goes to the last one there is
  useEffect(() => {
    if (!list.data || page <= pageCount - 1) return;
    setPageState(pageCount - 1);
    remember(filter, pageCount - 1);
  }, [list.data, page, pageCount, filter]);

  const filtered = isFiltered(effective);
  const reload = (): void => {
    void list.reload();
    void counts.reload();
    void published.reload();
  };

  return (
    <div>
      <PageHeader
        title="Stories"
        subtitle="Short texts to read, each with the questions a quiz asks about it. Learners see a story once it is approved and published."
        actions={
          <>
            <Button icon="refresh" onClick={reload} disabled={list.loading}>
              Refresh
            </Button>
            <a className="button-link" href={CATEGORIES_HREF}>
              <Icon name="tag" />
              Categories
            </a>
            <Button variant="primary" icon="plus" onClick={onNew}>
              New story
            </Button>
          </>
        }
      />

      {published.data && published.data.total > 0 && <Coverage page={published.data} />}

      <Tabs
        label="Status"
        value={filter.status}
        onChange={(status) => setFilter({ status })}
        items={STATUS_TABS.map((s) => ({ key: s, label: s === 'all' ? 'All' : STATUS_NAME[s], count: counts.data?.[s] }))}
      />

      <Section flush className="st-list" title={list.data ? `${total.toLocaleString()} ${total === 1 ? 'story' : 'stories'}${filtered ? ' match' : ''}` : 'Stories'}>
        <Filters filter={filter} categories={categories.data} onChange={setFilter} />
        <StoryTable
          stories={list.data?.stories ?? null}
          categories={categories.data}
          loading={list.loading}
          error={list.error}
          onRetry={() => void list.reload()}
          empty={filtered ? 'No story matches these filters.' : 'No stories yet. Write the first one with “New story”.'}
          paging={{ page, pageCount, onPage: setPage, total, pageSize: PAGE_SIZE }}
        />
      </Section>
    </div>
  );
}

/** The choices that narrow the list, beyond the status tabs. */
function Filters({
  filter,
  categories,
  onChange,
}: {
  filter: ListFilter;
  categories: readonly StoryCategory[] | undefined;
  onChange: (next: Partial<ListFilter>) => void;
}): React.JSX.Element {
  return (
    <div className="table-tools st-tools">
      <div className="search-box">
        <Icon name="search" size={16} />
        <input
          type="search"
          aria-label="Search by title or address"
          placeholder="Search title or address"
          value={filter.query}
          onChange={(e) => onChange({ query: e.target.value })}
        />
      </div>
      <select aria-label="Variety" value={filter.dialect} onChange={(e) => onChange({ dialect: e.target.value as StoryDialect | 'all' })}>
        <option value="all">Both varieties</option>
        {STORY_DIALECTS.map((d) => (
          <option key={d} value={d}>
            {DIALECT_NAME[d]}
          </option>
        ))}
      </select>
      <select
        aria-label="Level"
        value={filter.level === 'all' ? 'all' : CEFR_LEVELS[filter.level - 1]}
        onChange={(e) => onChange({ level: e.target.value === 'all' ? 'all' : (levelOfCefr(e.target.value) ?? 'all') })}
      >
        <option value="all">Every level</option>
        {CEFR_LEVELS.map((c) => (
          <option key={c} value={c}>
            {c} — {CEFR_WORD[c]}
          </option>
        ))}
      </select>
      <select aria-label="Category" value={filter.category} onChange={(e) => onChange({ category: e.target.value })}>
        <option value="all">Every category</option>
        {categories?.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.name.en}
          </option>
        ))}
        {/* a remembered category that is gone stays choosable until it is changed, so the filter is not silently dropped */}
        {filter.category !== 'all' && categories && !categories.some((c) => c.slug === filter.category) && (
          <option value={filter.category}>{filter.category} (no longer a category)</option>
        )}
      </select>
      <select aria-label="Review" value={filter.review} onChange={(e) => onChange({ review: e.target.value as ListFilter['review'] })}>
        <option value="all">Reviewed or not</option>
        <option value="unreviewed">Unreviewed</option>
        <option value="approved">Approved</option>
      </select>
      <Checkbox label="Featured only" checked={filter.featured} onChange={(featured) => onChange({ featured })} />
    </div>
  );
}

/**
 * What learners can play today: published stories per variety and length. A
 * game's setup offers only the lengths that have one, so a zero is a length
 * nobody can choose.
 */
function Coverage({ page }: { page: { stories: readonly AdminStorySummary[]; total: number } }): React.JSX.Element {
  const coverage = publishedCoverage(page.stories);
  return (
    <Section
      title="What learners can play"
      description={
        page.total > page.stories.length
          ? `Published stories by variety and length, counted over the first ${page.stories.length} of ${page.total}.`
          : 'Published stories by variety and length. A game offers only the lengths that have one.'
      }
    >
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

function columnsFor(categories: readonly StoryCategory[] | undefined): Column<AdminStorySummary>[] {
  return [
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
              {s.featured && (
                <span className="st-star" title="Featured in the library" aria-label="Featured">
                  <Icon name="star" size={14} />
                </span>
              )}
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
    {
      key: 'variety',
      header: 'Variety',
      sort: (a, b) => a.dialect.localeCompare(b.dialect) || a.level - b.level,
      cell: (s) => (
        <>
          {DIALECT_NAME[s.dialect]}
          <span className="cell-sub">
            <Badge title={cefrLabel(s.level)}>{s.cefr ?? `Level ${s.level}`}</Badge>
          </span>
        </>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      sort: (a, b) => (a.category ?? '').localeCompare(b.category ?? ''),
      cell: (s) => {
        const label = categoryLabel(categories, s.category);
        return label ? label : <Badge tone="warn">Not filed</Badge>;
      },
    },
    {
      key: 'text',
      header: 'Text',
      sort: (a, b) => a.wordCount - b.wordCount,
      cell: (s) => {
        const bank = bankLabel(s);
        return (
          <>
            <span className="badges">
              {s.length ? (
                <Badge>{LENGTH_NAME[s.length]}</Badge>
              ) : (
                <Badge tone="warn" title="The word count is in no length's band">
                  No length
                </Badge>
              )}
              {bank.short && (
                <Badge tone="warn" title="Fewer questions than its length needs">
                  {bank.text} questions
                </Badge>
              )}
            </span>
            <span className="cell-sub">
              {s.wordCount.toLocaleString()} words
              {!bank.short && ` · ${bank.text} ${s.questionCount === 1 ? 'question' : 'questions'}`}
            </span>
          </>
        );
      },
    },
    {
      key: 'audio',
      header: 'Audio',
      sort: (a, b) => a.audio.localeCompare(b.audio),
      cell: (s) => <Badge tone={AUDIO_TONE[s.audio]}>{AUDIO_NAME[s.audio]}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      sort: (a, b) => a.status.localeCompare(b.status),
      cell: (s) => (
        <>
          <Badge tone={STATUS_TONE[s.status]}>{STATUS_NAME[s.status]}</Badge>
          {s.status !== 'archived' && (
            <span className="cell-sub">
              <Badge tone={REVIEW_TONE[s.reviewStatus]}>{REVIEW_NAME[s.reviewStatus]}</Badge>
            </span>
          )}
        </>
      ),
    },
    {
      key: 'problems',
      header: 'Problems',
      cell: (s) => {
        const p = problemLabel(s);
        return <Badge tone={PROBLEM_TONE[p.tone]}>{p.text}</Badge>;
      },
    },
  ];
}

export function StoryTable({
  stories,
  categories,
  loading,
  error,
  onRetry,
  empty,
  paging,
}: {
  stories: readonly AdminStorySummary[] | null;
  categories?: readonly StoryCategory[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  empty: string;
  paging?: { page: number; pageCount: number; onPage: (page: number) => void; total?: number; pageSize?: number };
}): React.JSX.Element {
  const columns = useMemo(() => columnsFor(categories), [categories]);
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
      wide="medium"
      paging={paging}
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
