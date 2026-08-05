import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';

interface ActivityPoint {
  day: string;
  dau: number;
  wau: number;
  mau: number;
}
interface FunnelStep {
  step: string;
  users: number;
  rate: number;
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

/** Core analytics dashboards (KUR-106): activity, funnels, retention. */
export function Analytics(): React.JSX.Element {
  const today = ymd(new Date());
  const [from, setFrom] = useState(ymd(new Date(Date.now() - 29 * 86_400_000)));
  const [to, setTo] = useState(today);
  const [activity, setActivity] = useState<ActivityPoint[]>([]);
  const [onboarding, setOnboarding] = useState<FunnelStep[]>([]);
  const [lesson, setLesson] = useState<FunnelStep[]>([]);
  const [retention, setRetention] = useState<RetentionPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = `from=${from}&to=${to}`;
      const [a, on, le, re] = await Promise.all([
        api<{ points: ActivityPoint[] }>(`/admin/analytics/activity?${q}`),
        api<{ steps: FunnelStep[] }>(`/admin/analytics/funnel?${q}&name=onboarding`),
        api<{ steps: FunnelStep[] }>(`/admin/analytics/funnel?${q}&name=lesson`),
        api<{ cohorts: RetentionPoint[] }>(`/admin/analytics/retention?${q}`),
      ]);
      setActivity(a.points);
      setOnboarding(on.steps);
      setLesson(le.steps);
      setRetention(re.cohorts);
    } finally {
      setLoading(false);
    }
  }, [from, to]);
  useEffect(() => {
    void load();
  }, [load]);

  async function refreshRollups(): Promise<void> {
    setRefreshing(true);
    try {
      await api('/admin/analytics/refresh', { method: 'POST' });
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  }

  const latest = activity[activity.length - 1];
  const maxDau = Math.max(1, ...activity.map((p) => p.dau));

  return (
    <div>
      <div className="toolbar">
        <div>
          <h1>Analytics</h1>
          <div className="subtle">Active users, funnels & retention</div>
        </div>
        <div className="spacer" />
        <label className="subtle" style={{ width: 'auto' }}>
          From <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} style={{ width: 'auto' }} />
        </label>
        <label className="subtle" style={{ width: 'auto' }}>
          To <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} style={{ width: 'auto' }} />
        </label>
        <button onClick={() => void refreshRollups()} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh rollups'}
        </button>
      </div>

      {loading ? (
        <div className="card empty">Loading…</div>
      ) : (
        <>
          <div className="tiles">
            <div className="card tile">
              <div className="n">{latest?.dau ?? 0}</div>
              <div className="k">DAU (latest)</div>
            </div>
            <div className="card tile">
              <div className="n">{latest?.wau ?? 0}</div>
              <div className="k">WAU</div>
            </div>
            <div className="card tile">
              <div className="n">{latest?.mau ?? 0}</div>
              <div className="k">MAU</div>
            </div>
          </div>

          <div className="card">
            <div className="section-title" style={{ marginTop: 0 }}>
              Daily active users
            </div>
            {activity.length === 0 ? (
              <div className="empty">No activity in this range.</div>
            ) : (
              <div className="bars" title="DAU per day">
                {activity.map((p) => (
                  <div key={p.day} className="b" style={{ height: `${(p.dau / maxDau) * 100}%` }} title={`${p.day}: ${p.dau}`} />
                ))}
              </div>
            )}
          </div>

          <div className="row" style={{ alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <Funnel title="Onboarding funnel" steps={onboarding} />
            <Funnel title="Lesson funnel" steps={lesson} />
          </div>

          <div className="card" style={{ padding: 0, marginTop: 16 }}>
            <div className="section-title" style={{ margin: '14px 16px 8px' }}>
              Retention
            </div>
            {retention.length === 0 ? (
              <div className="empty">No matured cohorts in this range.</div>
            ) : (
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Cohort</th>
                      <th>Day</th>
                      <th>Size</th>
                      <th>Retained</th>
                      <th>Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {retention.map((r) => (
                      <tr key={`${r.cohortDay}-${r.dayN}`}>
                        <td>{r.cohortDay}</td>
                        <td>D{r.dayN}</td>
                        <td>{r.cohortSize}</td>
                        <td>{r.retained}</td>
                        <td>{Math.round(r.rate * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Funnel({ title, steps }: { title: string; steps: FunnelStep[] }): React.JSX.Element {
  const top = steps[0]?.users ?? 0;
  return (
    <div className="card" style={{ flex: 1, minWidth: 260, marginTop: 16 }}>
      <div className="section-title" style={{ marginTop: 0 }}>
        {title}
      </div>
      {steps.length === 0 || top === 0 ? (
        <div className="empty">No data.</div>
      ) : (
        steps.map((s) => {
          const pct = top === 0 ? 0 : Math.round((s.users / top) * 100);
          return (
            <div key={s.step} className="funnel-step">
              <div className="funnel-label">
                <span>{s.step}</span>
                <span className="subtle">
                  {s.users} · {pct}%
                </span>
              </div>
              <div className="funnel-track">
                <div className="funnel-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
