import { useEffect, useMemo, useRef, useState } from 'react';
import {
  REPORT_CATEGORIES,
  type CaseQueueItem,
  type CaseQueuePage,
  type ModerationSummary,
  type ReportPriority,
} from '@kurda/shared';
import { api } from '../api';
import { useRoute } from '../nav';
import {
  EMPTY_FILTERS,
  PRIORITY_NAME,
  PRIORITY_TONE,
  QUEUE_Q_MAX,
  SOURCE_GROUP_NAME,
  categoryName,
  filtersFrom,
  filtersQuery,
  queuePath,
  rememberQueueOrder,
  slaState,
  sourceName,
  statusName,
  statusTone,
  targetName,
  type QueueFilters,
} from '../moderation';
import { Badge, Button, Icon, PageHeader, Section, Table, Time, UserLink, errorLine, useDebounced, useLoad, useToast, type Column } from '../ui';
import { CaseView } from './CaseView';

/**
 * Moderation: the queue (#/moderation), and one case (#/moderation/<caseId>).
 *
 * Every report, every automatic flag (text, pictures), every bot score and
 * every anti-cheat review is a case in one queue — the old panel had three
 * pages for them, and a report on one never showed on the others. The queue
 * is ordered the way it should be worked: most urgent first, then whoever
 * has waited longest, with how long each still has before it is overdue.
 */
export function Moderation(): React.JSX.Element {
  const route = useRoute();
  const caseId = route.page === 'moderation' ? route.rest[0] : undefined;
  return caseId ? <CaseView key={caseId} caseId={caseId} /> : <Queue />;
}

const STATUS_OPTIONS = [
  { value: 'open', label: 'Still to decide' },
  { value: 'in_review', label: 'In review' },
  { value: 'needs_second_approval', label: 'Waiting for a second admin' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'closed', label: 'Decided' },
  { value: 'actioned', label: 'Action taken' },
  { value: 'no_violation', label: 'No rule broken' },
  { value: 'all', label: 'Every case' },
];

/** Put filters in the address, so a filtered queue can be linked, bookmarked and come back to. */
function applyFilters(f: QueueFilters): void {
  const q = filtersQuery(f);
  location.replace(`#/moderation${q ? `?${q}` : ''}`);
}

function Queue(): React.JSX.Element {
  const route = useRoute();
  const filters = useMemo(() => filtersFrom(route.query), [route.query]);
  const key = filtersQuery(filters);
  const toast = useToast();

  // the search box types freely; the queue follows it once typing pauses
  const [q, setQ] = useState(filters.q);
  const settledQ = useDebounced(q, 400);
  useEffect(() => {
    if (settledQ.trim() !== filters.q) applyFilters({ ...filters, q: settledQ });
    // only the typed text moves the address; the rest is already there
  }, [settledQ]);

  const first = useLoad(() => api<CaseQueuePage>(queuePath(filters)), [key]);
  const summary = useLoad(() => api<ModerationSummary>('/admin/moderation/summary'), []);
  const [more, setMore] = useState<{ cases: CaseQueueItem[]; next: string | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => setMore(null), [first.data]);

  const cases = useMemo(() => (first.data ? [...first.data.cases, ...(more?.cases ?? [])] : null), [first.data, more]);
  const next = more ? more.next : (first.data?.nextCursor ?? null);

  useEffect(() => {
    if (cases) rememberQueueOrder(cases.map((c) => c.id), key);
  }, [cases, key]);

  async function loadMore(): Promise<void> {
    if (!next) return;
    setLoadingMore(true);
    try {
      const page = await api<CaseQueuePage>(queuePath(filters, next));
      setMore((m) => ({ cases: [...(m?.cases ?? []), ...page.cases], next: page.nextCursor }));
    } catch (err) {
      toast.error(errorLine(err, 'the moderation queue'));
    } finally {
      setLoadingMore(false);
    }
  }

  const refresh = (): void => {
    void first.reload();
    void summary.reload();
  };

  const table = useRef<HTMLDivElement>(null);
  useTriageKeys(table, cases, () => refresh());

  const filtered = key !== '';
  const added = first.data?.added ?? 0;

  return (
    <div>
      <PageHeader
        title="Moderation queue"
        subtitle="Reports and automatic flags, most urgent first. Open a case to see the content, the people and their history, and decide."
        actions={
          <Button icon="refresh" onClick={refresh} busy={first.loading && !!first.data}>
            Refresh
          </Button>
        }
      />

      <PriorityBar summary={summary.data} filters={filters} />

      <Section flush>
        <div className="table-tools" role="search">
          <div className="search-box">
            <Icon name="search" size={16} />
            <input
              type="search"
              aria-label="Search cases"
              placeholder="Words, a username, or an id"
              maxLength={QUEUE_Q_MAX}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <label className="sr-only" htmlFor="queue-status">
            Status
          </label>
          <select id="queue-status" value={filters.status} onChange={(e) => applyFilters({ ...filters, status: e.target.value })}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="queue-source">
            Source
          </label>
          <select id="queue-source" value={filters.source} onChange={(e) => applyFilters({ ...filters, source: e.target.value })}>
            <option value="">Every source</option>
            {(Object.keys(SOURCE_GROUP_NAME) as Array<keyof typeof SOURCE_GROUP_NAME>).map((g) => (
              <option key={g} value={g}>
                {SOURCE_GROUP_NAME[g]}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="queue-category">
            Rule
          </label>
          <select id="queue-category" value={filters.category} onChange={(e) => applyFilters({ ...filters, category: e.target.value })}>
            <option value="">Every rule</option>
            {REPORT_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {categoryName(c.key)}
              </option>
            ))}
          </select>
          {filtered && (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setQ('');
                applyFilters(EMPTY_FILTERS);
              }}
            >
              Clear filters
            </button>
          )}
        </div>
        {added > 0 && (
          <p className="queue-added" role="status">
            {added === 1 ? 'One new case' : `${added} new cases`} from the automatic checks just joined the queue.
          </p>
        )}
        <div ref={table}>
          <Table
            caption="Moderation cases"
            wide="medium"
            columns={COLUMNS}
            rows={cases}
            rowKey={(c) => c.id}
            loading={first.loading}
            error={first.error}
            onRetry={() => void first.reload()}
            what="the moderation queue"
            rowClassName={(c) => (c.priority === 0 && slaState(c)?.tone === 'bad' ? 'is-urgent-row' : undefined)}
            empty={
              <div className="state state-empty is-compact">
                <Icon name="check" size={20} className="state-icon" />
                <div className="state-title">{filtered ? 'No case matches these filters' : 'Nothing to decide'}</div>
                <div className="state-text">
                  {filtered ? 'Clear the filters to see the whole queue.' : 'Every report and flag has a decision. New ones appear here as they come in.'}
                </div>
              </div>
            }
            actions={(c) => (
              <a className="button-link" href={`#/moderation/${c.id}`} aria-label={`Open case: ${categoryName(c.category)}, ${c.subject ? `@${c.subject.username}` : sourceName(c.source)}`}>
                Open
                <Icon name="chevronRight" size={16} />
              </a>
            )}
          />
        </div>
        {next && cases && (
          <div className="load-more">
            <Button onClick={() => void loadMore()} busy={loadingMore}>
              {loadingMore ? 'Loading…' : 'Show more cases'}
            </Button>
          </div>
        )}
      </Section>
      <p className="keys-hint" aria-hidden="true">
        <kbd>j</kbd> <kbd>k</kbd> move · <kbd>Enter</kbd> open · <kbd>c</kbd> claim
      </p>
    </div>
  );
}

const COLUMNS: ReadonlyArray<Column<CaseQueueItem>> = [
  {
    key: 'case',
    header: 'Case',
    card: 'title',
    cell: (c) => (
      <div className="queue-case">
        <span className="badges">
          <Badge tone={PRIORITY_TONE[c.priority]}>{PRIORITY_NAME[c.priority]}</Badge>
          {c.minorInvolved && (
            <Badge tone="warn" title="A child is the reported person or one of the reporters">
              Minor involved
            </Badge>
          )}
        </span>
        <a href={`#/moderation/${c.id}`} className="table-link queue-link" data-case={c.id}>
          <strong>{categoryName(c.category)}</strong>
          <span className="subtle"> · {c.targetType ? targetName(c.targetType) : sourceName(c.source)}</span>
        </a>
        <span className="cell-sub">{c.summary}</span>
        {c.degraded && <span className="cell-sub is-negative">Part of this case could not be read. Open it to see what is there.</span>}
      </div>
    ),
  },
  {
    key: 'subject',
    header: 'Reported',
    cell: (c) =>
      c.subject ? <UserLink user={c.subject} minor={c.subject.age === 'minor'} /> : <span className="subtle">No one named</span>,
  },
  {
    key: 'reports',
    header: 'From',
    cell: (c) =>
      c.reportCount > 0 ? (
        <span>
          {c.reportCount} {c.reportCount === 1 ? 'report' : 'reports'}
          {c.reporterCount > 1 && <span className="cell-sub">by {c.reporterCount} people</span>}
        </span>
      ) : (
        <span>{sourceName(c.source)}</span>
      ),
  },
  {
    key: 'waiting',
    header: 'Waiting',
    sort: (a, b) => a.firstReportedAt.localeCompare(b.firstReportedAt),
    cell: (c) => {
      const sla = slaState(c);
      return (
        <span>
          <Time value={c.firstReportedAt} />
          {sla && (
            <span className="cell-sub">
              <Badge tone={sla.tone}>{sla.text}</Badge>
            </span>
          )}
        </span>
      );
    },
  },
  {
    key: 'status',
    header: 'Status',
    cell: (c) => (
      <span>
        <Badge tone={statusTone(c.status)}>{statusName(c.status)}</Badge>
        {c.claimedBy && <span className="cell-sub">Claimed by {c.claimedBy.username ? `@${c.claimedBy.username}` : 'a moderator'}</span>}
      </span>
    ),
  },
];

/** The queue's size by priority, each a filter: "Urgent 2", "Overdue 1". */
function PriorityBar({ summary, filters }: { summary: ModerationSummary | undefined; filters: QueueFilters }): React.JSX.Element | null {
  if (!summary) return null;
  const pick = (priority: string): void => applyFilters({ ...filters, status: 'open', priority: filters.priority === priority ? '' : priority });
  return (
    <div className="priority-bar" role="group" aria-label="Open cases by priority">
      {([0, 1, 2, 3] as ReportPriority[]).map((p) => {
        const on = filters.priority === String(p);
        const overdue = summary.slaBreachesByPriority[p];
        return (
          <button
            key={p}
            type="button"
            className={`priority-chip tone-${PRIORITY_TONE[p]}${on ? ' is-on' : ''}`}
            aria-pressed={on}
            onClick={() => pick(String(p))}
          >
            <span className="priority-chip-name">{PRIORITY_NAME[p]}</span>
            <span className="priority-chip-n">{summary.byPriority[p]}</span>
            {overdue > 0 && <span className="priority-chip-late">{overdue} overdue</span>}
          </button>
        );
      })}
      <span className="priority-facts">
        {summary.oldestOpenAgeSeconds !== null && summary.open > 0 && (
          <span>
            {summary.open} open · oldest <Time value={new Date(Date.now() - summary.oldestOpenAgeSeconds * 1000)} />
          </span>
        )}
        {summary.appealsWaiting > 0 && <a href="#/appeals">{summary.appealsWaiting} {summary.appealsWaiting === 1 ? 'appeal' : 'appeals'} waiting</a>}
        {summary.pendingApprovals > 0 && (
          <a href="#/ban-approvals">
            {summary.pendingApprovals} {summary.pendingApprovals === 1 ? 'ban waits' : 'bans wait'} for a second admin
          </a>
        )}
      </span>
    </div>
  );
}

/**
 * Triage from the keyboard, as moderation tools do: j and k move down and up
 * the queue, Enter opens the case (it is a link), c claims it. Never while
 * typing in a field, and never with a modifier held (that is the browser's).
 */
function useTriageKeys(container: React.RefObject<HTMLDivElement | null>, cases: CaseQueueItem[] | null, claimed: () => void): void {
  const toast = useToast();
  useEffect(() => {
    if (!cases || cases.length === 0) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable], [role="dialog"], [role="alertdialog"]')) return;
      const links = [...(container.current?.querySelectorAll<HTMLAnchorElement>('a.queue-link') ?? [])];
      if (links.length === 0) return;
      const at = links.findIndex((l) => l === document.activeElement);
      if (e.key === 'j' || e.key === 'k') {
        e.preventDefault();
        const to = e.key === 'j' ? Math.min(links.length - 1, at + 1) : Math.max(0, at < 0 ? 0 : at - 1);
        links[to]?.focus();
        links[to]?.closest('tr')?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'c' && at >= 0) {
        e.preventDefault();
        const id = links[at]!.dataset.case!;
        void api(`/admin/moderation/cases/${id}/claim`, { method: 'POST' })
          .then(() => {
            toast.success('Claimed for 15 minutes. Nobody else can decide it while you hold it.');
            claimed();
          })
          .catch((err: unknown) => toast.error(errorLine(err, 'moderation')));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cases, container, claimed, toast]);
}
