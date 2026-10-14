import { useEffect, useMemo, useState } from 'react';
import {
  APP_FEEDBACK_CATEGORIES,
  APP_PLATFORMS,
  type AdminFeedbackItem,
  type AdminFeedbackList,
  type AdminFeedbackPatch,
  type AdminFeedbackSummary,
  type AppFeedbackCategory,
  type AppFeedbackStatus,
  type AppPlatform,
  type FeedbackStats,
} from '@kurda/shared';
import { api } from '../api';
import { useRoute } from '../nav';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Icon,
  Loading,
  PageHeader,
  Section,
  Tabs,
  Time,
  UserLink,
  errorLine,
  useDebounced,
  useDialogs,
  useLoad,
  useToast,
  type Loaded,
} from '../ui';
import { Bars } from './Analytics';

export const CATEGORY_NAME: Readonly<Record<AppFeedbackCategory, string>> = {
  lessons: 'Lessons',
  games: 'Games',
  stories: 'Stories',
  bugs: 'Bugs',
  too_hard: 'Too hard',
  too_easy: 'Too easy',
  other: 'Something else',
};
const PLATFORM_NAME: Readonly<Record<AppPlatform, string>> = { web: 'Web', ios: 'iPhone', android: 'Android' };

type StatusFilter = AppFeedbackStatus | 'all';
const STATUS_TABS: ReadonlyArray<{ key: StatusFilter; label: string }> = [
  { key: 'new', label: 'New' },
  { key: 'read', label: 'Read' },
  { key: 'archived', label: 'Archived' },
  { key: 'all', label: 'All' },
];

export interface FeedbackFilters {
  status: StatusFilter;
  /** chosen star counts, e.g. [1, 2]; empty is every answer */
  stars: number[];
  category: string;
  platform: string;
  q: string;
}

/** The filters an address asks for (#/feedback?status=new&stars=1,2). New answers are the inbox. */
export function feedbackFilters(query: URLSearchParams): FeedbackFilters {
  const status = query.get('status');
  const stars = (query.get('stars') ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 5);
  return {
    status: STATUS_TABS.some((t) => t.key === status) ? (status as StatusFilter) : 'new',
    stars: [...new Set(stars)].sort(),
    category: (APP_FEEDBACK_CATEGORIES as readonly string[]).includes(query.get('category') ?? '') ? query.get('category')! : '',
    platform: (APP_PLATFORMS as readonly string[]).includes(query.get('platform') ?? '') ? query.get('platform')! : '',
    q: query.get('q') ?? '',
  };
}

/** The filters as the address's query, the defaults left out. */
export function feedbackQuery(f: FeedbackFilters): string {
  const p = new URLSearchParams();
  if (f.status !== 'new') p.set('status', f.status);
  if (f.stars.length) p.set('stars', f.stars.join(','));
  if (f.category) p.set('category', f.category);
  if (f.platform) p.set('platform', f.platform);
  if (f.q.trim()) p.set('q', f.q.trim());
  return p.toString();
}

export const FEEDBACK_PAGE = 50;
/** the longest search the API takes; a longer paste would be refused, not searched */
export const FEEDBACK_Q_MAX = 80;

/**
 * The API path for a page of answers ("all" is no status filter). A next page
 * starts after the last answer shown (`beforeId`), not at an offset: marking
 * answers read or archived takes them out of the filter while they stay on
 * screen, and an offset would then skip as many answers as were marked.
 */
export function feedbackPath(f: FeedbackFilters, beforeId?: string): string {
  const p = new URLSearchParams();
  if (f.status !== 'all') p.set('status', f.status);
  if (f.stars.length) p.set('stars', f.stars.join(','));
  if (f.category) p.set('category', f.category);
  if (f.platform) p.set('platform', f.platform);
  const q = f.q.trim().slice(0, FEEDBACK_Q_MAX).trim();
  if (q) p.set('q', q);
  p.set('limit', String(FEEDBACK_PAGE));
  if (beforeId) p.set('beforeId', beforeId);
  return `/admin/feedback?${p}`;
}

/** Whether an answer belongs on the tab it is shown on, as it is now. */
function inStatus(f: FeedbackFilters, item: AdminFeedbackItem): boolean {
  return f.status === 'all' || item.status === f.status;
}

function setFilters(f: FeedbackFilters): void {
  const q = feedbackQuery(f);
  location.replace(`#/feedback${q ? `?${q}` : ''}`);
}

/**
 * The feedback inbox (#/feedback): every answer from the rating box after a
 * player's first game, and from Settings → Send feedback. New answers are the
 * inbox; reading one marks it read, archiving puts it away, and a private
 * note keeps what was done about it. Above the list, how people rate Hevalo
 * over the last 30 days.
 */
export function Feedback(): React.JSX.Element {
  const route = useRoute();
  const filters = useMemo(() => feedbackFilters(route.query), [route.query]);
  const key = feedbackQuery(filters);
  const summary = useLoad(() => api<AdminFeedbackSummary>('/admin/feedback/summary'), []);
  const first = useLoad(() => api<AdminFeedbackList>(feedbackPath(filters)), [key]);
  /*
   * What is on screen: the first page and every page shown after it, with the
   * answers marked since, and how many answers match the filter now (the
   * latest page's count, moved by each answer marked out of or back into the
   * tab). It belongs to one load of the first page; a reload starts it again.
   */
  const [shown, setShown] = useState<{ from: AdminFeedbackList; items: AdminFeedbackItem[]; total: number } | null>(null);
  const fresh = (d: AdminFeedbackList) => ({ from: d, items: d.items, total: d.total });
  const list = first.data ? (shown?.from === first.data ? shown : fresh(first.data)) : null;
  const [loadingMore, setLoadingMore] = useState(false);
  const toast = useToast();

  // the search box types freely; the list follows once typing pauses
  const [q, setQ] = useState(filters.q);
  const settledQ = useDebounced(q, 400);
  useEffect(() => {
    if (settledQ.trim() !== filters.q) setFilters({ ...filters, q: settledQ });
    // only the typed text moves the address; the rest is already there
  }, [settledQ]);

  const items = list?.items ?? null;
  const total = list?.total ?? 0;
  // still to load: the answers that match now, less those on screen that still match
  const left = items ? Math.max(0, total - items.filter((i) => inStatus(filters, i)).length) : 0;

  async function loadMore(): Promise<void> {
    const last = items?.[items.length - 1];
    const from = first.data;
    if (!last || !from) return;
    setLoadingMore(true);
    try {
      const page = await api<AdminFeedbackList>(feedbackPath(filters, last.id));
      setShown((s) => {
        const base = s?.from === from ? s : fresh(from);
        return { from, items: [...base.items, ...page.items.filter((p) => !base.items.some((i) => i.id === p.id))], total: page.total };
      });
    } catch (err) {
      toast.error(errorLine(err, 'feedback'));
    } finally {
      setLoadingMore(false);
    }
  }

  /** One answer changed: replace it where it is (it stays put until the list is loaded again). */
  const replace = (next: AdminFeedbackItem): void => {
    const from = first.data;
    if (!from) return;
    setShown((s) => {
      const base = s?.from === from ? s : fresh(from);
      const before = base.items.find((i) => i.id === next.id);
      // marked out of this tab (or back into it): the filter's count moves with it
      const moved = before && inStatus(filters, before) !== inStatus(filters, next) ? (inStatus(filters, next) ? 1 : -1) : 0;
      return { from, items: base.items.map((i) => (i.id === next.id ? next : i)), total: base.total + moved };
    });
    void summary.reload();
  };

  const filtered = filters.stars.length > 0 || !!filters.category || !!filters.platform || !!filters.q.trim();
  const toggleStar = (n: number): void =>
    setFilters({ ...filters, stars: filters.stars.includes(n) ? filters.stars.filter((s) => s !== n) : [...filters.stars, n].sort() });

  return (
    <div>
      <PageHeader
        title="Feedback"
        subtitle="What people tell us in the rating box after their first game, and from Send feedback in Settings."
        actions={
          <Button
            icon="refresh"
            onClick={() => {
              void first.reload();
              void summary.reload();
            }}
            busy={first.loading && !!first.data}
          >
            Refresh
          </Button>
        }
      />

      <SummaryPanel loaded={summary} />

      <Tabs
        label="Show"
        value={filters.status}
        items={STATUS_TABS.map((t) => ({
          key: t.key,
          label: t.label,
          count: t.key !== 'all' && summary.data ? summary.data.byStatus[t.key] : undefined,
          href: `#/feedback${feedbackQuery({ ...filters, status: t.key }) ? `?${feedbackQuery({ ...filters, status: t.key })}` : ''}`,
        }))}
      />

      <Section flush>
        <div className="table-tools" role="search">
          <div className="search-box">
            <Icon name="search" size={16} />
            <input
              type="search"
              aria-label="Search feedback"
              placeholder="Words or a username"
              maxLength={FEEDBACK_Q_MAX}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="star-filter" role="group" aria-label="Stars">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" className={`chip${filters.stars.includes(n) ? ' is-on' : ''}`} aria-pressed={filters.stars.includes(n)} onClick={() => toggleStar(n)}>
                {n} ★<span className="sr-only">{n === 1 ? ' star' : ' stars'}</span>
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="fb-category">
            Category
          </label>
          <select id="fb-category" value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
            <option value="">Every category</option>
            {APP_FEEDBACK_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_NAME[c]}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="fb-platform">
            Platform
          </label>
          <select id="fb-platform" value={filters.platform} onChange={(e) => setFilters({ ...filters, platform: e.target.value })}>
            <option value="">Every platform</option>
            {APP_PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_NAME[p]}
              </option>
            ))}
          </select>
          {filtered && (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setQ('');
                setFilters({ status: filters.status, stars: [], category: '', platform: '', q: '' });
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        {first.error != null && !items ? (
          <ErrorState error={first.error} onRetry={() => void first.reload()} what="feedback" />
        ) : !items ? (
          <Loading rows={3} label="Loading feedback…" />
        ) : items.length === 0 ? (
          <EmptyState title={filtered ? 'No answer matches these filters' : filters.status === 'new' ? 'Nothing new' : 'Nothing here'} icon="check" compact>
            {filtered ? 'Clear the filters to see more.' : filters.status === 'new' ? 'Every answer has been read. New ones arrive here.' : 'Choose another tab to see the rest.'}
          </EmptyState>
        ) : (
          <>
            <p className="sr-only" role="status">
              {total.toLocaleString()} {total === 1 ? 'answer' : 'answers'}
            </p>
            <ul className="fb-list" aria-label="Feedback">
              {items.map((item) => (
                <FeedbackRow key={item.id} item={item} onChanged={replace} />
              ))}
            </ul>
            {left > 0 && (
              <div className="load-more">
                <Button onClick={() => void loadMore()} busy={loadingMore}>
                  {loadingMore ? 'Loading…' : `Show more (${left.toLocaleString()} left)`}
                </Button>
              </div>
            )}
          </>
        )}
      </Section>
    </div>
  );
}

/** Five stars, filled to the count, read out as words. */
export function Stars({ n }: { n: number }): React.JSX.Element {
  return (
    <span className="stars" role="img" aria-label={`${n} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Icon key={i} name="star" className={i <= n ? 'is-full' : 'is-empty'} />
      ))}
    </span>
  );
}

function statLine(s: FeedbackStats): string {
  return `${s.count.toLocaleString()} ${s.count === 1 ? 'answer' : 'answers'}`;
}

function SummaryPanel({ loaded }: { loaded: Loaded<AdminFeedbackSummary> }): React.JSX.Element {
  const s = loaded.data;
  if (loaded.error != null && !s) {
    return (
      <Section title="How people rate Hevalo">
        <ErrorState error={loaded.error} onRetry={() => void loaded.reload()} what="feedback" compact />
      </Section>
    );
  }
  if (!s) {
    return (
      <Section title="How people rate Hevalo">
        <Loading rows={2} />
      </Section>
    );
  }
  const recent = s.last30Days;
  const most = Math.max(1, ...recent.distribution);
  const categories = APP_FEEDBACK_CATEGORIES.filter((c) => (s.byCategory[c] ?? 0) > 0);
  return (
    <Section title="How people rate Hevalo" description="The last 30 days.">
      <div className="fb-summary">
        <div className="fb-average">
          <span className="fb-average-n">{recent.averageStars === null ? '—' : recent.averageStars.toFixed(1)}</span>
          {recent.averageStars !== null && <Stars n={Math.round(recent.averageStars)} />}
          <span className="subtle">
            {statLine(recent)}
            {/* all time only when it says something more */}
            {s.total.count !== recent.count &&
              ` · ${s.total.count.toLocaleString()} in all${s.total.averageStars !== null ? `, ${s.total.averageStars.toFixed(1)} ★ average` : ''}`}
          </span>
        </div>
        <ul className="fb-dist" aria-label="Answers by stars, last 30 days">
          {[5, 4, 3, 2, 1].map((n) => {
            const count = recent.distribution[n - 1] ?? 0;
            return (
              <li key={n}>
                <span>{n} ★</span>
                <div className="progress" aria-hidden="true">
                  <div className="progress-bar" style={{ width: `${(count / most) * 100}%` }} />
                </div>
                <span className="fb-dist-n">
                  {count.toLocaleString()}
                  <span className="sr-only">{n === 1 ? ' with 1 star' : ` with ${n} stars`}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      {s.daily.some((d) => d.count > 0) && (
        <>
          <h3 className="drawer-sub">Answers per day</h3>
          <Bars points={s.daily.map((d) => ({ day: d.day, value: d.count }))} unit="answers" />
        </>
      )}
      {categories.length > 0 && (
        <>
          <h3 className="drawer-sub">What could be better, by category (all time)</h3>
          <div className="fb-cats">
            {categories.map((c) => (
              <a key={c} className="chip" href={`#/feedback?status=all&category=${c}`}>
                {CATEGORY_NAME[c]} · {s.byCategory[c]}
              </a>
            ))}
          </div>
        </>
      )}
    </Section>
  );
}

const SOURCE_NAME = { first_game: 'After their first game', settings: 'From Settings' } as const;

function FeedbackRow({ item, onChanged }: { item: AdminFeedbackItem; onChanged: (next: AdminFeedbackItem) => void }): React.JSX.Element {
  const toast = useToast();
  const dialogs = useDialogs();
  const [busy, setBusy] = useState(false);

  async function patch(body: AdminFeedbackPatch, done?: string): Promise<void> {
    setBusy(true);
    try {
      const next = await api<AdminFeedbackItem>(`/admin/feedback/${item.id}`, { method: 'PATCH', body });
      onChanged(next);
      if (done) toast.success(done);
    } catch (err) {
      toast.error(errorLine(err, 'feedback'));
    } finally {
      setBusy(false);
    }
  }

  async function note(): Promise<void> {
    const text = await dialogs.prompt({
      title: item.adminNote ? 'Edit the note' : 'Add a note',
      label: 'Note (only admins see it)',
      body: 'What was done about it: a bug filed, a lesson fixed, a reply sent.',
      initial: item.adminNote ?? '',
      multiline: true,
      maxLength: 2000,
      // an emptied note clears it
      validate: () => null,
      confirmLabel: 'Save note',
    });
    if (text === null) return;
    await patch({ adminNote: text.trim() ? text.trim() : null }, text.trim() ? 'Note saved.' : 'Note removed.');
  }

  return (
    <li className={`fb-item${item.status === 'new' ? ' is-new' : ''}`}>
      <div className="fb-item-head">
        {item.stars !== null ? <Stars n={item.stars} /> : <span className="subtle">No stars</span>}
        {item.status === 'new' && <Badge tone="info">New</Badge>}
        {item.status === 'archived' && <Badge>Archived</Badge>}
        {item.categories.length > 0 && (
          <span className="fb-cats">
            {item.categories.map((c) => (
              <Badge key={c}>{CATEGORY_NAME[c] ?? c}</Badge>
            ))}
          </span>
        )}
      </div>
      {item.comment ? (
        <p className="fb-comment" dir="auto" lang={item.locale ?? undefined}>
          {item.comment}
        </p>
      ) : (
        <p className="fb-comment subtle">No comment.</p>
      )}
      <div className="fb-meta">
        <UserLink user={item.user} />
        <span>
          {PLATFORM_NAME[item.platform] ?? item.platform}
          {/* the web has no version of its own (it sends "web") */}
          {item.platform !== 'web' && item.appVersion && item.appVersion !== 'web' ? ` ${item.appVersion}` : ''}
        </span>
        <span>{SOURCE_NAME[item.source] ?? item.source}</span>
        {item.locale && <span>Language: {item.locale}</span>}
        <Time value={item.createdAt} />
      </div>
      {item.adminNote && (
        <p className="fb-note" dir="auto">
          <strong>Note:</strong> {item.adminNote}
        </p>
      )}
      <div className="fb-actions">
        {item.status === 'new' && (
          <Button onClick={() => void patch({ status: 'read' })} disabled={busy}>
            Mark read
          </Button>
        )}
        {item.status === 'archived' ? (
          <Button onClick={() => void patch({ status: 'read' }, 'Back in the list.')} disabled={busy}>
            Unarchive
          </Button>
        ) : (
          <Button onClick={() => void patch({ status: 'archived' }, 'Archived.')} disabled={busy}>
            Archive
          </Button>
        )}
        <Button variant="ghost" onClick={() => void note()} disabled={busy}>
          {item.adminNote ? 'Edit note' : 'Add note'}
        </Button>
      </div>
    </li>
  );
}
