import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SECURITY_CATEGORIES,
  SECURITY_CATEGORY_LABELS,
  securityEventInfo,
  type SecurityCategory,
  type SecuritySeverity,
} from '@kurda/shared';
import { api } from '../api';
import type { Route } from '../navigation';
import {
  Badge,
  Banner,
  Button,
  Checkbox,
  Drawer,
  ErrorState,
  Loading,
  PageHeader,
  Section,
  Select,
  Stat,
  Table,
  Time,
  UserLink,
  errorLine,
  relativeTime,
  useDialogs,
  useToast,
  type Column,
  type Tone,
} from '../ui';

interface Person {
  id: string;
  username: string | null;
}

export interface SecurityEvent {
  id: string;
  occurredAt: string;
  kind: string;
  severity: SecuritySeverity;
  category: string;
  user: Person | null;
  actor: Person | null;
  network: string | null;
  country: string | null;
  device: string | null;
  requestId: string | null;
  details: Record<string, unknown>;
  hasAddress: boolean;
  alert: { reviewedAt: string | null; reviewedBy: string | null; note: string | null; emailedAt: string | null } | null;
}

type Counts = Record<SecuritySeverity, number> & { total: number };

export interface SecuritySummary {
  window: { from: string; to: string };
  counts: Counts;
  previous: Counts;
  failedSignIns: { now: number; before: number };
  blocked: { now: number; before: number };
  hourly: Array<{ hour: string } & Record<SecuritySeverity, number>>;
  networks: Array<{ network: string; events: number; failures: number; serious: number; accounts: number; country: string | null; lastAt: string }>;
  open: { warning: number; critical: number };
  lastConsoleSignIn: { at: string; device: string | null; country: string | null } | null;
}

interface Filters {
  category: SecurityCategory | '';
  severity: SecuritySeverity | '';
  open: boolean;
  userId: string;
  network: string;
}

const PAGE = 50;
const REFRESH_MS = 30_000;
const NO_FILTERS: Filters = { category: '', severity: '', open: false, userId: '', network: '' };

export const SEVERITY_TONE: Record<SecuritySeverity, Tone> = { info: 'neutral', notice: 'info', warning: 'warn', critical: 'bad' };
const SEVERITY_LABEL: Record<SecuritySeverity, string> = { info: 'Info', notice: 'Notice', warning: 'Warning', critical: 'Critical' };

/** A network's keyed hash, short enough to read and compare by eye. */
export function networkName(hash: string): string {
  return `Network ${hash.slice(0, 8)}`;
}

/** "+40% on the day before", "Same as the day before", or nothing to compare with. */
export function change(now: number, before: number): string {
  if (before === 0) return now === 0 ? 'None the day before either' : 'None the day before';
  if (now === before) return 'Same as the day before';
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct > 0 ? '+' : ''}${pct}% on the day before`;
}

/** The event's own words: the details worth a line, without what the list already says. */
function detailLines(details: Record<string, unknown>): Array<[string, string]> {
  const names: Record<string, string> = {
    reason: 'Why',
    why: 'Why',
    scope: 'Counted on',
    seconds: 'Paused for (seconds)',
    retryAfterSec: 'Wait (seconds)',
    route: 'Request',
    method: 'Signed in with',
    remember: 'Remembered',
    step: 'Step',
    roles: 'Roles',
    by: 'Given by',
    max: 'Limit',
    windowSec: 'Per (seconds)',
    score: 'Risk score',
    eventId: 'Event',
    found: 'Address still kept',
    console: 'On the admin console',
    staff: 'Staff account',
    newAccount: 'New account',
    otherSessionsEnded: 'Other sessions ended',
    sessionEnded: 'Session ended',
    holdSeconds: 'Challenge for (seconds)',
    answered: 'Challenge answered',
    per: 'Counted per',
  };
  return Object.entries(details).map(([k, v]) => [
    names[k] ?? k,
    typeof v === 'boolean' ? (v ? 'Yes' : 'No') : Array.isArray(v) ? v.join(', ') : String(v).replace(/-/g, ' '),
  ]);
}

/**
 * The security log: who is signing in and from where, who is being kept out,
 * what happened on this console, and who was given staff access. For
 * superadmins. Critical events are emailed as they happen; this page is where
 * they are looked into and marked reviewed. It keeps itself up to date while
 * it is open.
 */
export function SecurityLog({ route }: { route?: Route }): React.JSX.Element {
  const toast = useToast();
  const dialogs = useDialogs();
  const [filters, setFilters] = useState<Filters>(() => ({
    ...NO_FILTERS,
    userId: route?.query.get('user') ?? '',
    network: route?.query.get('network') ?? '',
  }));
  const [summary, setSummary] = useState<SecuritySummary | null>(null);
  const [summaryError, setSummaryError] = useState<unknown>(null);
  const [attention, setAttention] = useState<SecurityEvent[] | null>(null);
  const [events, setEvents] = useState<SecurityEvent[] | null>(null);
  const [eventsError, setEventsError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [looking, setLooking] = useState<SecurityEvent | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  /** addresses revealed in this visit, by event: shown in its details, never kept */
  const [revealed, setRevealed] = useState<Record<string, string | null>>({});
  const paged = useRef(false);

  const query = useCallback((f: Filters, beforeId?: string): string => {
    const q = new URLSearchParams({ limit: String(PAGE) });
    if (f.category) q.set('category', f.category);
    if (f.severity) q.set('severity', f.severity);
    if (f.open) q.set('open', 'true');
    if (f.userId) q.set('userId', f.userId);
    if (f.network) q.set('network', f.network);
    if (beforeId) q.set('beforeId', beforeId);
    return q.toString();
  }, []);

  const loadTop = useCallback(async (): Promise<void> => {
    const [s, open] = await Promise.allSettled([
      api<SecuritySummary>('/admin/security/summary'),
      api<{ events: SecurityEvent[] }>('/admin/security/events?open=true&limit=200'),
    ]);
    if (s.status === 'fulfilled') {
      setSummary(s.value);
      setSummaryError(null);
    } else setSummaryError(s.reason);
    if (open.status === 'fulfilled') setAttention(open.value.events);
  }, []);

  const loadEvents = useCallback(
    async (f: Filters, beforeId?: string): Promise<void> => {
      setLoading(true);
      try {
        const res = await api<{ events: SecurityEvent[] }>(`/admin/security/events?${query(f, beforeId)}`);
        setEvents((prev) => (beforeId && prev ? [...prev, ...res.events] : res.events));
        setMore(res.events.length === PAGE);
        setEventsError(null);
        paged.current = Boolean(beforeId);
      } catch (err) {
        if (beforeId) toast.error(errorLine(err, 'the security log'));
        else setEventsError(err);
      } finally {
        setLoading(false);
      }
    },
    [query, toast],
  );

  const refresh = useCallback(async (): Promise<void> => {
    await Promise.all([loadTop(), paged.current ? Promise.resolve() : loadEvents(filters)]);
    setUpdatedAt(new Date());
  }, [loadTop, loadEvents, filters]);

  useEffect(() => {
    void loadEvents(filters);
  }, [filters, loadEvents]);

  useEffect(() => {
    void loadTop().then(() => setUpdatedAt(new Date()));
  }, [loadTop]);

  // kept up to date while open and in view; a page someone is reading further down is left alone
  useEffect(() => {
    const tick = setInterval(() => {
      if (document.visibilityState === 'visible' && !looking) void refresh();
    }, REFRESH_MS);
    return () => clearInterval(tick);
  }, [refresh, looking]);

  const set = (patch: Partial<Filters>): void => setFilters((f) => ({ ...f, ...patch }));

  async function review(which: { kind?: string; eventIds?: string[]; all?: true }, what: string): Promise<void> {
    const note = await dialogs.prompt({
      title: `Mark ${what} reviewed`,
      label: 'Note (optional)',
      body: 'Say what you found, so whoever looks next knows. “It was me”, “Blocked network”, “Password changed”.',
      maxLength: 500,
      // a note helps, but is not required
      validate: () => null,
      confirmLabel: 'Mark reviewed',
    });
    if (note === null) return;
    try {
      const res = await api<{ reviewed: number }>('/admin/security/alerts/review', {
        method: 'POST',
        body: { ...which, ...(note.trim() ? { note: note.trim() } : {}) },
      });
      toast.success(res.reviewed === 1 ? 'One alert marked reviewed.' : `${res.reviewed} alerts marked reviewed.`);
      setLooking(null);
      await refresh();
    } catch (err) {
      toast.error(errorLine(err, 'the alerts'));
    }
  }

  async function reveal(event: SecurityEvent): Promise<void> {
    const reason = await dialogs.prompt({
      title: 'See the address',
      label: 'Why do you need it?',
      body: 'Addresses are kept sealed. Seeing one is recorded here and in the audit log, with your reason.',
      validate: (v) => (v.trim().length < 5 ? 'Say why in a few words.' : null),
      maxLength: 300,
      confirmLabel: 'Show the address',
    });
    if (reason === null) return;
    try {
      const res = await api<{ address: string | null }>(`/admin/security/events/${event.id}/reveal-address`, {
        method: 'POST',
        body: { reason: reason.trim() },
      });
      setRevealed((r) => ({ ...r, [event.id]: res.address }));
      if (!res.address) toast.info('This address is no longer kept: addresses are forgotten after 30 days.');
    } catch (err) {
      toast.error(errorLine(err, 'the address'));
    }
  }

  const s = summary;
  const openCount = s ? s.open.critical + s.open.warning : 0;
  const groups = groupAlerts(attention ?? []);

  const columns: Column<SecurityEvent>[] = [
    {
      key: 'what',
      header: 'What happened',
      card: 'title',
      cell: (e) => {
        const info = securityEventInfo(e.kind);
        return (
          <>
            <Badge tone={SEVERITY_TONE[e.severity]}>{SEVERITY_LABEL[e.severity]}</Badge> <strong>{info.title}</strong>
            {e.alert && !e.alert.reviewedAt && <span className="cell-sub">Needs attention</span>}
          </>
        );
      },
    },
    { key: 'when', header: 'When', cell: (e) => <Time value={e.occurredAt} /> },
    {
      key: 'who',
      header: 'Account',
      cell: (e) => (e.user ? <UserLink user={e.user} /> : <span className="subtle">No account</span>),
    },
    {
      key: 'from',
      header: 'From',
      cell: (e) => (
        <span className="sec-from">
          {[e.device, e.country].filter(Boolean).join(' · ') || <span className="subtle">Unknown device</span>}
          {e.network && <span className="cell-sub mono">{networkName(e.network)}</span>}
        </span>
      ),
    },
  ];

  const active = [
    filters.userId && { label: 'One account', clear: { userId: '' } },
    filters.network && { label: networkName(filters.network), clear: { network: '' } },
  ].filter(Boolean) as Array<{ label: string; clear: Partial<Filters> }>;

  return (
    <div>
      <PageHeader
        title="Security log"
        subtitle="Who is signing in and from where, who is being kept out, and every change to staff access. Critical events are emailed to superadmins as they happen."
        actions={
          <Button icon="refresh" onClick={() => void refresh()} busy={loading && !more}>
            Refresh
          </Button>
        }
        meta={updatedAt ? <span className="subtle sec-updated">Updated {relativeTime(updatedAt)}</span> : undefined}
      />

      {summaryError != null && !s ? (
        <ErrorState error={summaryError} onRetry={() => void refresh()} what="the security log" />
      ) : !s ? (
        <Loading rows={4} />
      ) : (
        <>
          {s.open.critical > 0 ? (
            <Banner tone="bad" title={`${s.open.critical} critical ${s.open.critical === 1 ? 'alert needs' : 'alerts need'} you`}>
              Look at each one below. If it was not you, change your password and end your other sessions now.
            </Banner>
          ) : s.open.warning > 0 ? (
            <Banner tone="warn" title={`${s.open.warning} ${s.open.warning === 1 ? 'warning' : 'warnings'} to look at`}>
              Nothing critical. Look when you can, and mark each one reviewed.
            </Banner>
          ) : (
            <Banner tone="ok" title="Nothing needs attention">
              No open warnings. Critical events will be emailed to you as they happen.
            </Banner>
          )}

          <div className="stats">
            <Stat
              icon="lock"
              label="Failed sign-ins (24 h)"
              value={s.failedSignIns.now.toLocaleString()}
              hint={change(s.failedSignIns.now, s.failedSignIns.before)}
              tone={s.failedSignIns.now > Math.max(20, s.failedSignIns.before * 2) ? 'warn' : 'neutral'}
            />
            <Stat icon="shield" label="Stopped (24 h)" value={s.blocked.now.toLocaleString()} hint={`Locks, limits and refusals · ${change(s.blocked.now, s.blocked.before)}`} />
            <Stat
              icon="alert"
              label="Needs attention"
              value={openCount.toLocaleString()}
              hint={s.open.critical > 0 ? `${s.open.critical} critical` : openCount > 0 ? 'Warnings only' : 'All reviewed'}
              tone={s.open.critical > 0 ? 'bad' : openCount > 0 ? 'warn' : 'ok'}
            />
            <Stat
              icon="server"
              label="Last console sign-in"
              value={s.lastConsoleSignIn ? relativeTime(new Date(s.lastConsoleSignIn.at)) : 'None yet'}
              hint={s.lastConsoleSignIn ? [s.lastConsoleSignIn.device, s.lastConsoleSignIn.country].filter(Boolean).join(' · ') || 'Device not known' : undefined}
            />
          </div>

          <Section title="The last 24 hours" description="Events per hour. Point at or touch an hour to see its numbers.">
            <ActivityChart hours={s.hourly} />
          </Section>

          {groups.length > 0 && (
            <Section
              title="Needs attention"
              description="Warnings and critical events nobody has marked reviewed yet."
              actions={
                <Button onClick={() => void review({ all: true }, 'every alert')} icon="check">
                  Mark all reviewed
                </Button>
              }
            >
              <ul className="sec-alerts">
                {groups.map((g) => {
                  const info = securityEventInfo(g.kind);
                  return (
                    <li key={g.kind} className={`sec-alert tone-${SEVERITY_TONE[g.severity]}`}>
                      <div className="sec-alert-text">
                        <strong>{info.title}</strong>
                        <span className="subtle">
                          {g.events.length === 1 ? 'Once' : `${g.events.length} times`} · last <Time value={g.events[0]!.occurredAt} />
                        </span>
                        <span className="sec-alert-meaning">{info.meaning}</span>
                      </div>
                      <div className="sec-alert-actions">
                        <Button onClick={() => setLooking(g.events[0]!)}>Latest</Button>
                        <Button onClick={() => void review({ kind: g.kind }, g.events.length === 1 ? 'this alert' : `these ${g.events.length} alerts`)}>Reviewed</Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {s.networks.length > 0 && (
            <Section title="Networks behind the most trouble" description="In the last 24 hours. A network is a home, office or phone network, never stored as its address.">
              <ul className="sec-networks">
                {s.networks.map((n) => (
                  <li key={n.network}>
                    <button type="button" className="sec-network" onClick={() => set({ ...NO_FILTERS, network: n.network })}>
                      <span className="mono">{networkName(n.network)}</span>
                      {n.country && <Badge>{n.country}</Badge>}
                      <span className="subtle">
                        {n.failures} failed · {n.accounts} {n.accounts === 1 ? 'account' : 'accounts'} · {n.serious} serious · last <Time value={n.lastAt} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}

      <Section
        flush
        title="Events"
        description="Newest first. Info is kept 90 days, warnings a year; addresses are forgotten after 30 days."
      >
        <div className="sec-filters">
          <div className="chips" role="radiogroup" aria-label="Show">
            {(['', ...SECURITY_CATEGORIES] as const).map((c) => (
              <button
                key={c || 'all'}
                type="button"
                role="radio"
                aria-checked={filters.category === c}
                className={`chip${filters.category === c ? ' is-on' : ''}`}
                onClick={() => set({ category: c })}
              >
                {c ? SECURITY_CATEGORY_LABELS[c] : 'Everything'}
              </button>
            ))}
          </div>
          <div className="sec-filter-row">
            <Select
              label="How serious"
              value={filters.severity}
              onChange={(e) => set({ severity: e.target.value as Filters['severity'] })}
              options={[
                { value: '', label: 'Everything' },
                { value: 'notice', label: 'Notice and worse' },
                { value: 'warning', label: 'Warnings and critical' },
                { value: 'critical', label: 'Critical only' },
              ]}
            />
            <Checkbox label="Only what needs attention" checked={filters.open} onChange={(open) => set({ open })} />
          </div>
          {active.length > 0 && (
            <div className="chips">
              {active.map((a) => (
                <button key={a.label} type="button" className="chip is-on" onClick={() => set(a.clear)} aria-label={`Stop showing only ${a.label}`}>
                  {a.label} ✕
                </button>
              ))}
            </div>
          )}
        </div>
        <Table
          caption="Security events"
          columns={columns}
          rows={events}
          rowKey={(e) => e.id}
          loading={loading}
          error={eventsError}
          onRetry={() => void loadEvents(filters)}
          what="the security log"
          wide="medium"
          empty={filters === NO_FILTERS ? 'Nothing recorded yet.' : 'No events match.'}
          rowClassName={(e) => (e.alert && !e.alert.reviewedAt ? 'is-flagged' : '')}
          actions={(e) => <Button onClick={() => setLooking(e)}>Details</Button>}
        />
        {more && events && (
          <div className="load-more">
            <Button onClick={() => void loadEvents(filters, events[events.length - 1]!.id)} busy={loading}>
              Older events
            </Button>
          </div>
        )}
      </Section>

      {looking && (
        <EventDrawer
          event={looking}
          address={revealed[looking.id]}
          onClose={() => setLooking(null)}
          onReview={() => void review({ eventIds: [looking.id] }, 'this alert')}
          onReveal={() => void reveal(looking)}
          onNetwork={(network) => {
            setLooking(null);
            set({ ...NO_FILTERS, network });
          }}
          onAccount={(userId) => {
            setLooking(null);
            set({ ...NO_FILTERS, userId });
          }}
        />
      )}
    </div>
  );
}

/** Open alerts by kind, the most serious first, then the most recent. */
export function groupAlerts(events: readonly SecurityEvent[]): Array<{ kind: string; severity: SecuritySeverity; events: SecurityEvent[] }> {
  const byKind = new Map<string, SecurityEvent[]>();
  for (const e of events) byKind.set(e.kind, [...(byKind.get(e.kind) ?? []), e]);
  const rank = (s: SecuritySeverity): number => (s === 'critical' ? 0 : s === 'warning' ? 1 : 2);
  return [...byKind]
    .map(([kind, list]) => ({
      kind,
      severity: list.some((e) => e.severity === 'critical') ? ('critical' as const) : list[0]!.severity,
      events: list,
    }))
    .sort((a, b) => rank(a.severity) - rank(b.severity) || b.events[0]!.occurredAt.localeCompare(a.events[0]!.occurredAt));
}

function EventDrawer({
  event,
  address,
  onClose,
  onReview,
  onReveal,
  onNetwork,
  onAccount,
}: {
  event: SecurityEvent;
  /** the address, once revealed; null when it was no longer kept */
  address: string | null | undefined;
  onClose: () => void;
  onReview: () => void;
  onReveal: () => void;
  onNetwork: (network: string) => void;
  onAccount: (userId: string) => void;
}): React.JSX.Element {
  const info = securityEventInfo(event.kind);
  const facts: Array<[string, React.ReactNode]> = [
    ['When', <Time key="t" value={event.occurredAt} mode="absolute" />],
    ['How serious', <Badge key="s" tone={SEVERITY_TONE[event.severity]}>{SEVERITY_LABEL[event.severity]}</Badge>],
    ['Account', event.user ? <UserLink key="u" user={event.user} /> : 'No account'],
    ['Signed in as', event.actor && event.actor.id !== event.user?.id ? <UserLink key="a" user={event.actor} /> : event.actor ? 'The same account' : 'Nobody'],
    ['Device', event.device ?? 'Not known'],
    ['Country', event.country ?? 'Not known'],
    ['Network', event.network ? <span key="n" className="mono">{networkName(event.network)}</span> : 'Not known'],
    ...(address !== undefined ? ([['Address', address ? <code key="ip">{address}</code> : 'No longer kept']] as Array<[string, React.ReactNode]>) : []),
    ...detailLines(event.details),
    ['Request id', <code key="r">{event.requestId ?? '—'}</code>],
  ];
  return (
    <Drawer open onClose={onClose} title={info.title}>
      <p className="sec-meaning">{info.meaning}</p>
      {event.alert && (
        <Banner tone={event.alert.reviewedAt ? 'ok' : event.severity === 'critical' ? 'bad' : 'warn'} title={event.alert.reviewedAt ? 'Reviewed' : 'Needs attention'}>
          {event.alert.reviewedAt ? (
            <>
              By {event.alert.reviewedBy ?? 'a removed account'}, <Time value={event.alert.reviewedAt} />
              {event.alert.note ? ` — “${event.alert.note}”` : ''}
            </>
          ) : event.alert.emailedAt ? (
            <>
              Emailed to superadmins <Time value={event.alert.emailedAt} />.
            </>
          ) : (
            'Not marked reviewed yet.'
          )}
        </Banner>
      )}
      <dl className="facts">
        {facts.map(([term, value], i) => (
          <div key={`${term}-${i}`} className="facts-row">
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="form-actions sec-drawer-actions">
        {event.alert && !event.alert.reviewedAt && (
          <Button variant="primary" icon="check" onClick={onReview}>
            Mark reviewed
          </Button>
        )}
        {event.network && <Button onClick={() => onNetwork(event.network!)}>Everything from this network</Button>}
        {event.user && <Button onClick={() => onAccount(event.user!.id)}>Everything for this account</Button>}
        {event.hasAddress && address === undefined && (
          <Button icon="eye" onClick={onReveal}>
            See the address
          </Button>
        )}
      </div>
    </Drawer>
  );
}

const SERIES = [
  { key: 'routine', label: 'Routine', className: 'is-routine' },
  { key: 'warning', label: 'Warning', className: 'is-warning' },
  { key: 'critical', label: 'Critical', className: 'is-critical' },
] as const;

/**
 * Events per hour as stacked bars, routine (info and notice) at the bottom,
 * then warnings, then critical, so a bad hour stands out at a glance. The
 * hour pointed at, or touched and slid along, is spelled out under the chart.
 */
export function ActivityChart({ hours }: { hours: SecuritySummary['hourly'] }): React.JSX.Element {
  const [at, setAt] = useState<number | null>(null);
  const rows = hours.map((h) => ({ hour: h.hour, routine: h.info + h.notice, warning: h.warning, critical: h.critical }));
  const total = (r: (typeof rows)[number]): number => r.routine + r.warning + r.critical;
  const max = Math.max(1, ...rows.map(total));
  const chosen = at === null ? undefined : rows[at];
  const clock = (iso: string): string => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const all = rows.reduce((n, r) => n + total(r), 0);
  const serious = rows.reduce((n, r) => n + r.warning + r.critical, 0);

  const pick = (e: React.PointerEvent<HTMLDivElement>): void => {
    const bars = [...e.currentTarget.children] as HTMLElement[];
    let best = 0;
    let gap = Infinity;
    bars.forEach((b, i) => {
      const r = b.getBoundingClientRect();
      const d = Math.abs(e.clientX - (r.left + r.width / 2));
      if (d < gap) {
        gap = d;
        best = i;
      }
    });
    setAt(best);
  };

  return (
    <figure className="chart sec-chart">
      <div className="sec-legend" aria-hidden="true">
        {SERIES.map((s) => (
          <span key={s.key}>
            <i className={`sec-swatch ${s.className}`} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="chart-plot">
        <div className="chart-axis" aria-hidden="true">
          <span>{max.toLocaleString()}</span>
          <span>0</span>
        </div>
        <div
          className="bars sec-bars"
          role="img"
          aria-label={`${all} events in the last 24 hours, ${serious} of them warnings or critical.`}
          onPointerDown={pick}
          onPointerMove={pick}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') setAt(null);
          }}
        >
          {rows.map((r, i) => (
            <div key={r.hour} className={`sec-bar${i === at ? ' is-on' : ''}`} style={{ height: `${(total(r) / max) * 100}%` }}>
              {SERIES.slice()
                .reverse()
                .map((sr) => (r[sr.key] > 0 ? <span key={sr.key} className={sr.className} style={{ flexGrow: r[sr.key] }} /> : null))}
            </div>
          ))}
        </div>
      </div>
      <figcaption className="chart-x">
        <span>{rows[0] ? clock(rows[0].hour) : ''}</span>
        {chosen ? (
          <span className="chart-at">
            {clock(chosen.hour)}: <strong>{total(chosen)}</strong> ({chosen.critical} critical, {chosen.warning} warning, {chosen.routine} routine)
          </span>
        ) : (
          <span className="subtle">
            {all.toLocaleString()} in all · {serious.toLocaleString()} serious
          </span>
        )}
        <span>Now</span>
      </figcaption>
    </figure>
  );
}
