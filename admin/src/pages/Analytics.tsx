import { useState } from 'react';
import { api } from '../api';
import { Button, EmptyState, ErrorState, Loading, PageHeader, Section, Stat, Table, errorLine, useLoad, useToast, type Column } from '../ui';

interface ActivityPoint {
  day: string;
  dau: number;
  wau: number;
  mau: number;
  signups: number;
}
interface FunnelStep {
  step: string;
  users: number;
  /** of the first step's people, the share still here */
  rateFromFirst: number;
  rateFromPrev: number;
}
interface RetentionPoint {
  cohortDay: string;
  dayN: number;
  cohortSize: number;
  retained: number;
  rate: number;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "12 Oct" from "2026-10-12", in the reader's language. */
function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/**
 * Core analytics (KUR-106): active people, sign-ups, the onboarding and lesson
 * funnels, and retention. A failure used to draw zeros everywhere — "nobody
 * used Hevalo today" — so it is now said as a failure.
 */
export function Analytics(): React.JSX.Element {
  const toast = useToast();
  const today = ymd(new Date());
  const [from, setFrom] = useState(ymd(new Date(Date.now() - 29 * 86_400_000)));
  const [to, setTo] = useState(today);
  const [refreshing, setRefreshing] = useState(false);

  const data = useLoad(async () => {
    const q = `from=${from}&to=${to}`;
    const [a, on, le, re] = await Promise.all([
      api<{ points: ActivityPoint[] }>(`/admin/analytics/activity?${q}`),
      api<{ steps: FunnelStep[] }>(`/admin/analytics/funnel?${q}&name=onboarding`),
      api<{ steps: FunnelStep[] }>(`/admin/analytics/funnel?${q}&name=lesson`),
      api<{ cohorts: RetentionPoint[] }>(`/admin/analytics/retention?${q}`),
    ]);
    return { activity: a.points, onboarding: on.steps, lesson: le.steps, retention: re.cohorts };
  }, [from, to]);

  async function refreshRollups(): Promise<void> {
    setRefreshing(true);
    try {
      await api('/admin/analytics/refresh', { method: 'POST' });
      toast.success('The daily numbers were worked out again from the raw events.');
      await data.reload();
    } catch (err) {
      toast.error(errorLine(err, 'analytics'));
    } finally {
      setRefreshing(false);
    }
  }

  const d = data.data;
  const latest = d?.activity[d.activity.length - 1];

  const retentionColumns: Column<RetentionPoint>[] = [
    { key: 'cohort', header: 'Joined on', card: 'title', sort: (a, b) => a.cohortDay.localeCompare(b.cohortDay), cell: (r) => dayLabel(r.cohortDay) },
    { key: 'day', header: 'Day', sort: (a, b) => a.dayN - b.dayN, cell: (r) => `Day ${r.dayN}` },
    { key: 'size', header: 'Joined', align: 'end', cell: (r) => r.cohortSize.toLocaleString() },
    { key: 'retained', header: 'Came back', align: 'end', cell: (r) => r.retained.toLocaleString() },
    { key: 'rate', header: 'Rate', align: 'end', sort: (a, b) => a.rate - b.rate, cell: (r) => `${Math.round(r.rate * 100)}%` },
  ];

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Active people, sign-ups, funnels and retention, for the days you choose."
        actions={
          <>
            <div className="range">
              <label>
                From
                <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label>
                To
                <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
              </label>
            </div>
            <Button icon="refresh" onClick={() => void refreshRollups()} busy={refreshing}>
              {refreshing ? 'Working out…' : 'Recount'}
            </Button>
          </>
        }
      />

      {data.error != null ? (
        <ErrorState error={data.error} onRetry={() => void data.reload()} what="analytics" />
      ) : !d ? (
        <Loading rows={6} />
      ) : (
        <>
          <div className="stats">
            {/* the last day shown, which is today only when the range ends today */}
            <Stat label="Active in a day" value={(latest?.dau ?? 0).toLocaleString()} hint={latest ? `On ${dayLabel(latest.day)}` : 'No data in this range'} />
            <Stat label="Active in a week" value={(latest?.wau ?? 0).toLocaleString()} hint={latest ? `The 7 days to ${dayLabel(latest.day)}` : undefined} />
            <Stat label="Active in a month" value={(latest?.mau ?? 0).toLocaleString()} hint={latest ? `The 30 days to ${dayLabel(latest.day)}` : undefined} />
            <Stat label="New sign-ups" value={d.activity.reduce((n, p) => n + p.signups, 0).toLocaleString()} hint="In the days shown" />
          </div>

          <Section title="Active people per day">
            <Bars points={d.activity.map((p) => ({ day: p.day, value: p.dau }))} unit="active" />
          </Section>

          <Section
            title="New sign-ups per day"
            description="Counted from when accounts were made, so this covers the whole history — unlike active people, which start from when activity began to be recorded."
          >
            <Bars points={d.activity.map((p) => ({ day: p.day, value: p.signups }))} unit="sign-ups" />
          </Section>

          <div className="two-up">
            <Funnel title="Onboarding" steps={d.onboarding} />
            <Funnel title="Lessons" steps={d.lesson} />
          </div>

          <Section flush title="Retention" description="Of the people who joined on a day, how many came back on a later day.">
            <Table
              caption="Retention by the day people joined"
              columns={retentionColumns}
              rows={d.retention}
              rowKey={(r) => `${r.cohortDay}-${r.dayN}`}
              empty="No group has been around long enough in this range."
            />
          </Section>
        </>
      )}
    </div>
  );
}

/**
 * A bar per day, with the highest value and the first and last day written
 * beside it, and the total under it unless it is a level rather than a count
 * (`total={false}`: what is in circulation is not summed over days).
 */
export function Bars({ points, unit, total: showTotal = true }: { points: Array<{ day: string; value: number }>; unit: string; total?: boolean }): React.JSX.Element {
  if (points.length === 0) return <EmptyState title="Nothing in this range." compact icon="chart" />;
  const max = Math.max(1, ...points.map((p) => p.value));
  const total = points.reduce((n, p) => n + p.value, 0);
  const peak = points.reduce((a, b) => (b.value > a.value ? b : a));
  return (
    <figure className="chart">
      <div className="chart-plot">
        <div className="chart-axis" aria-hidden="true">
          <span>{max.toLocaleString()}</span>
          <span>0</span>
        </div>
        <div
          className="bars"
          role="img"
          aria-label={`${points.length} days, from ${dayLabel(points[0]!.day)} to ${dayLabel(points[points.length - 1]!.day)}. Highest: ${peak.value.toLocaleString()} ${unit} on ${dayLabel(peak.day)}.`}
        >
          {points.map((p) => (
            <div key={p.day} className="b" style={{ height: `${(Math.max(0, p.value) / max) * 100}%` }} title={`${dayLabel(p.day)}: ${p.value.toLocaleString()} ${unit}`} />
          ))}
        </div>
      </div>
      <figcaption className="chart-x">
        <span>{dayLabel(points[0]!.day)}</span>
        {showTotal ? <span className="subtle">{total.toLocaleString()} in all</span> : <span />}
        {/* one day is named once */}
        <span>{points.length > 1 ? dayLabel(points[points.length - 1]!.day) : ''}</span>
      </figcaption>
    </figure>
  );
}

function Funnel({ title, steps }: { title: string; steps: FunnelStep[] }): React.JSX.Element {
  const top = steps[0]?.users ?? 0;
  return (
    <Section title={`${title} funnel`} description="Of the people who began, how many reached each step.">
      {steps.length === 0 || top === 0 ? (
        <EmptyState title="No one in this range yet." compact icon="chart" />
      ) : (
        <ol className="funnel">
          {steps.map((s) => {
            const pct = Math.round((s.users / top) * 100);
            return (
              <li key={s.step} className="funnel-step">
                <div className="funnel-label">
                  <span>{s.step.replace(/_/g, ' ')}</span>
                  <span className="subtle">
                    {s.users.toLocaleString()} · {pct}%
                  </span>
                </div>
                <div className="funnel-track" aria-hidden="true">
                  <div className="funnel-fill" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}
