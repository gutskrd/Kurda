import { useState } from 'react';
import { api } from '../api';
import { Button, EmptyState, ErrorState, Loading, PageHeader, Section, Stat, errorLine, useLoad, useToast, type Tone } from '../ui';

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
export interface RetentionPoint {
  cohortDay: string;
  dayN: number;
  cohortSize: number;
  retained: number;
  rate: number;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The day `n` days before `day` (YYYY-MM-DD), in UTC like the rollups. */
function daysBefore(day: string, n: number): string {
  return ymd(new Date(Date.parse(`${day}T00:00:00Z`) - n * 86_400_000));
}

/** How many days a range covers, both ends counted. */
function spanDays(from: string, to: string): number {
  return Math.max(1, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1);
}

/** "12 Oct" from "2026-10-12", in the reader's language. */
function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** The ranges people ask for, and a custom one. */
const PRESETS = [
  { key: '7', label: '7 days', days: 7 },
  { key: '30', label: '30 days', days: 30 },
  { key: '90', label: '90 days', days: 90 },
] as const;
type Preset = (typeof PRESETS)[number]['key'] | 'custom';

/** What each funnel step means, in words; a step the panel does not know is shown as its name. */
const STEP_NAMES: Record<string, string> = {
  screen_view: 'Opened the app',
  lesson_start: 'Started a lesson',
  lesson_complete: 'Finished a lesson',
  signup: 'Signed up',
};
export function stepName(step: string): string {
  return STEP_NAMES[step] ?? step.replace(/_/g, ' ');
}

/** "+12% on the 30 days before", or nothing to compare with. */
export function versus(now: number, before: number, days: number): { text: string; tone: Tone } {
  const span = days === 1 ? 'the day before' : `the ${days} days before`;
  if (before === 0) return { text: now === 0 ? `None in ${span} either` : `None in ${span}`, tone: 'neutral' };
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return { text: `Same as ${span}`, tone: 'neutral' };
  return { text: `${pct > 0 ? '+' : ''}${pct}% on ${span}`, tone: pct > 0 ? 'ok' : 'warn' };
}

/** Of everyone who joined in the range, the share back on day N (cohorts too young for N left out). */
export function retentionAt(points: readonly RetentionPoint[], dayN: number): { rate: number; people: number } | null {
  const at = points.filter((p) => p.dayN === dayN && p.cohortSize > 0);
  const people = at.reduce((n, p) => n + p.cohortSize, 0);
  if (people === 0) return null;
  return { rate: at.reduce((n, p) => n + p.retained, 0) / people, people };
}

/**
 * Core analytics (KUR-106): active people, sign-ups, the onboarding and lesson
 * funnels, and retention, for a range picked in one tap, each figure beside
 * the same figure for the period just before. A failure used to draw zeros
 * everywhere — "nobody used Hevalo today" — so it is now said as a failure.
 */
export function Analytics(): React.JSX.Element {
  const toast = useToast();
  const today = ymd(new Date());
  const [preset, setPreset] = useState<Preset>('30');
  const [from, setFrom] = useState(daysBefore(today, 29));
  const [to, setTo] = useState(today);
  const [refreshing, setRefreshing] = useState(false);
  const days = spanDays(from, to);

  function choose(p: Preset): void {
    setPreset(p);
    const found = PRESETS.find((x) => x.key === p);
    if (found) {
      setTo(today);
      setFrom(daysBefore(today, found.days - 1));
    }
  }

  const data = useLoad(async () => {
    const q = `from=${from}&to=${to}`;
    // the same number of days just before, to compare with
    const before = `from=${daysBefore(from, days)}&to=${daysBefore(from, 1)}`;
    const [a, p, on, le, re] = await Promise.all([
      api<{ points: ActivityPoint[] }>(`/admin/analytics/activity?${q}`),
      api<{ points: ActivityPoint[] }>(`/admin/analytics/activity?${before}`),
      api<{ steps: FunnelStep[] }>(`/admin/analytics/funnel?${q}&name=onboarding`),
      api<{ steps: FunnelStep[] }>(`/admin/analytics/funnel?${q}&name=lesson`),
      api<{ cohorts: RetentionPoint[] }>(`/admin/analytics/retention?${q}`),
    ]);
    return { activity: a.points, previous: p.points, onboarding: on.steps, lesson: le.steps, retention: re.cohorts };
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
  const average = (points: readonly ActivityPoint[]): number => (points.length === 0 ? 0 : Math.round(points.reduce((n, p) => n + p.dau, 0) / points.length));
  const signups = (points: readonly ActivityPoint[]): number => points.reduce((n, p) => n + p.signups, 0);

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Active people, sign-ups, funnels and retention, each beside the same number for the period before."
        actions={
          <Button icon="refresh" onClick={() => void refreshRollups()} busy={refreshing}>
            {refreshing ? 'Working out…' : 'Recount'}
          </Button>
        }
      />

      <div className="range-bar">
        <div className="chips" role="radiogroup" aria-label="Days shown">
          {[...PRESETS, { key: 'custom' as const, label: 'Custom' }].map((p) => (
            <button key={p.key} type="button" role="radio" aria-checked={preset === p.key} className={`chip${preset === p.key ? ' is-on' : ''}`} onClick={() => choose(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' ? (
          <div className="range">
            <label>
              From
              <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
            </label>
            <label>
              To
              <input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} />
            </label>
          </div>
        ) : (
          <span className="subtle range-says">
            {dayLabel(from)} – {dayLabel(to)}
          </span>
        )}
      </div>

      {data.error != null ? (
        <ErrorState error={data.error} onRetry={() => void data.reload()} what="analytics" />
      ) : !d ? (
        <Loading rows={6} />
      ) : (
        <>
          <div className="stats">
            <Stat
              label="Active per day"
              value={average(d.activity).toLocaleString()}
              hint={versus(average(d.activity), average(d.previous), days).text}
              tone={d.previous.length > 0 ? versus(average(d.activity), average(d.previous), days).tone : 'neutral'}
              icon="users"
            />
            {/* the last day shown, which is today only when the range ends today */}
            <Stat label="Active in a day" value={(latest?.dau ?? 0).toLocaleString()} hint={latest ? `On ${dayLabel(latest.day)}` : 'No data in this range'} />
            <Stat label="Active in a month" value={(latest?.mau ?? 0).toLocaleString()} hint={latest ? `The 30 days to ${dayLabel(latest.day)}` : undefined} />
            <Stat
              label="New sign-ups"
              value={signups(d.activity).toLocaleString()}
              hint={versus(signups(d.activity), signups(d.previous), days).text}
              tone={versus(signups(d.activity), signups(d.previous), days).tone}
              icon="plus"
            />
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
            <Funnel title="First steps" description="Of the people who opened the app, how many went on to each step." steps={d.onboarding} />
            <Funnel title="Lessons" description="Of the lessons started, how many were finished." steps={d.lesson} />
          </div>

          <Retention points={d.retention} />
        </>
      )}
    </div>
  );
}

/**
 * A bar per day, with the highest value and the first and last day written
 * beside it, and the total under it unless it is a level rather than a count
 * (`total={false}`: what is in circulation is not summed over days).
 *
 * A day's own number is read by pointing at its bar, or by touching it and
 * sliding along: it takes the total's place under the chart. It used to be a
 * tooltip, which a finger never brings up.
 */
export function Bars({ points, unit, total: showTotal = true }: { points: Array<{ day: string; value: number }>; unit: string; total?: boolean }): React.JSX.Element {
  const [at, setAt] = useState<number | null>(null);
  if (points.length === 0) return <EmptyState title="Nothing in this range." compact icon="chart" />;
  const max = Math.max(1, ...points.map((p) => p.value));
  const total = points.reduce((n, p) => n + p.value, 0);
  const peak = points.reduce((a, b) => (b.value > a.value ? b : a));
  const chosen = at === null ? undefined : points[at];

  // the bar under the pointer, or the nearest one: a bar can be a few pixels wide
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
    <figure className="chart">
      <div className="chart-plot">
        <div className="chart-axis" aria-hidden="true">
          <span>{max.toLocaleString()}</span>
          <span>0</span>
        </div>
        <div
          className={`bars${points.length > 45 ? ' is-dense' : ''}`}
          role="img"
          aria-label={`${points.length} days, from ${dayLabel(points[0]!.day)} to ${dayLabel(points[points.length - 1]!.day)}. Highest: ${peak.value.toLocaleString()} ${unit} on ${dayLabel(peak.day)}.`}
          onPointerDown={pick}
          onPointerMove={pick}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') setAt(null);
          }}
        >
          {points.map((p, i) => (
            <div key={p.day} className={`b${i === at ? ' is-on' : ''}`} style={{ height: `${(Math.max(0, p.value) / max) * 100}%` }} />
          ))}
        </div>
      </div>
      <figcaption className="chart-x">
        <span>{dayLabel(points[0]!.day)}</span>
        {chosen ? (
          <span className="chart-at">
            {dayLabel(chosen.day)}: <strong>{chosen.value.toLocaleString()}</strong> {unit}
          </span>
        ) : showTotal ? (
          <span className="subtle">{total.toLocaleString()} in all</span>
        ) : (
          <span />
        )}
        {/* one day is named once */}
        <span>{points.length > 1 ? dayLabel(points[points.length - 1]!.day) : ''}</span>
      </figcaption>
    </figure>
  );
}

function Funnel({ title, description, steps }: { title: string; description: string; steps: FunnelStep[] }): React.JSX.Element {
  const top = steps[0]?.users ?? 0;
  return (
    <Section title={title} description={description}>
      {steps.length === 0 || top === 0 ? (
        <EmptyState title="No one in this range yet." compact icon="chart" />
      ) : (
        <ol className="funnel">
          {steps.map((s, i) => {
            const pct = Math.round((s.users / top) * 100);
            return (
              <li key={s.step} className="funnel-step">
                <div className="funnel-label">
                  <span>{stepName(s.step)}</span>
                  <span className="subtle">
                    {s.users.toLocaleString()} · {pct}%
                  </span>
                </div>
                <div className="funnel-track" aria-hidden="true">
                  <div className="funnel-fill" style={{ width: `${pct}%` }} />
                </div>
                {i > 0 && <span className="funnel-step-rate">{Math.round(s.rateFromPrev * 100)}% of the step before</span>}
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}

/**
 * Retention as a grid that fits a phone: a row for each day people joined,
 * newest first, and a column for each day after (1, 7, 30), the share who came
 * back in each cell, shaded by how many. The totals across the range are on
 * top. Fourteen rows at first; the rest on request.
 */
export function Retention({ points }: { points: readonly RetentionPoint[] }): React.JSX.Element {
  const [all, setAll] = useState(false);
  const dayNs = [...new Set(points.map((p) => p.dayN))].sort((a, b) => a - b);
  const cohorts = [...new Set(points.map((p) => p.cohortDay))].sort((a, b) => b.localeCompare(a));
  const shown = all ? cohorts : cohorts.slice(0, 14);
  const cell = new Map(points.map((p) => [`${p.cohortDay}|${p.dayN}`, p]));
  const sizeOf = (day: string): number => Math.max(0, ...points.filter((p) => p.cohortDay === day).map((p) => p.cohortSize));
  const after = (n: number): string => (n === 1 ? 'Next day' : n === 7 ? 'After a week' : n === 30 ? 'After a month' : `Day ${n}`);

  return (
    <Section title="Retention" description="Of the people who joined on a day, the share who came back a day, a week and a month later.">
      {cohorts.length === 0 ? (
        <EmptyState title="No group has been around long enough in this range." compact icon="chart" />
      ) : (
        <>
          <div className="stats is-flat retention-totals">
            {dayNs.map((n) => {
              const r = retentionAt(points, n);
              return <Stat key={n} label={after(n)} value={r ? `${Math.round(r.rate * 100)}%` : '—'} hint={r ? `of ${r.people.toLocaleString()}` : 'Too soon'} />;
            })}
          </div>
          <div className="cohorts" role="table" aria-label="Retention by the day people joined" style={{ '--cohort-cols': dayNs.length } as React.CSSProperties}>
            <div className="cohort-row is-head" role="row">
              <span role="columnheader">Joined</span>
              {dayNs.map((n) => (
                <span key={n} role="columnheader">
                  {after(n)}
                </span>
              ))}
            </div>
            {shown.map((day) => (
              <div key={day} className="cohort-row" role="row">
                <span role="rowheader" className="cohort-day">
                  {dayLabel(day)}
                  <span className="subtle">{sizeOf(day).toLocaleString()} joined</span>
                </span>
                {dayNs.map((n) => {
                  const p = cell.get(`${day}|${n}`);
                  if (!p || p.cohortSize === 0) {
                    return (
                      <span key={n} role="cell" className="cohort-cell is-empty" aria-label={`${after(n)}: not yet`}>
                        —
                      </span>
                    );
                  }
                  const pct = Math.round(p.rate * 100);
                  return (
                    <span
                      key={n}
                      role="cell"
                      className="cohort-cell"
                      style={{ '--share': Math.min(1, p.rate) } as React.CSSProperties}
                      title={`${p.retained.toLocaleString()} of ${p.cohortSize.toLocaleString()}`}
                      aria-label={`${after(n)}: ${pct}%, ${p.retained} of ${p.cohortSize}`}
                    >
                      {pct}%
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
          {cohorts.length > shown.length && (
            <div className="load-more">
              <Button onClick={() => setAll(true)}>Show all {cohorts.length} days</Button>
            </div>
          )}
        </>
      )}
    </Section>
  );
}
