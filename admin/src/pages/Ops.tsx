import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';

interface GemRule {
  key: string;
  amount: number;
  dailyCap: number | null;
  cooldownSeconds: number;
  active: boolean;
}

/** Ops: gem earning-rule config (KUR-068) + idempotent maintenance jobs. */
export function Ops(): React.JSX.Element {
  const [rules, setRules] = useState<GemRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ rules: GemRule[] }>('/admin/gem-rules');
      setRules(res.rules);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load gem rules');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="toolbar">
        <div>
          <h1>Ops</h1>
          <div className="subtle">Gem earning rules &amp; maintenance jobs</div>
        </div>
        <div className="spacer" />
        <button onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </div>

      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="card" style={{ padding: 0, marginBottom: 20 }}>
        <div className="section-title" style={{ margin: '14px 16px 8px' }}>
          Gem earning rules
        </div>
        {loading ? (
          <div className="empty">Loading…</div>
        ) : rules.length === 0 ? (
          <div className="empty">No gem rules configured.</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Amount</th>
                  <th>Daily cap</th>
                  <th>Cooldown (s)</th>
                  <th>Active</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <RuleRow key={r.key} rule={r} onSaved={load} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Maintenance />
    </div>
  );
}

function RuleRow({ rule, onSaved }: { rule: GemRule; onSaved: () => Promise<void> }): React.JSX.Element {
  const [amount, setAmount] = useState(String(rule.amount));
  const [dailyCap, setDailyCap] = useState(rule.dailyCap === null ? '' : String(rule.dailyCap));
  const [cooldown, setCooldown] = useState(String(rule.cooldownSeconds));
  const [active, setActive] = useState(rule.active);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const dirty =
    amount !== String(rule.amount) ||
    dailyCap !== (rule.dailyCap === null ? '' : String(rule.dailyCap)) ||
    cooldown !== String(rule.cooldownSeconds) ||
    active !== rule.active;

  async function save(): Promise<void> {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/admin/gem-rules/${rule.key}`, {
        method: 'PUT',
        body: {
          amount: Number(amount),
          dailyCap: dailyCap.trim() === '' ? null : Number(dailyCap),
          cooldownSeconds: Number(cooldown),
          active,
        },
      });
      await onSaved();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td>
        <code>{rule.key}</code>
        {msg && <div className="error" style={{ fontSize: 12 }}>{msg}</div>}
      </td>
      <td>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" style={{ width: 90 }} />
      </td>
      <td>
        <input value={dailyCap} onChange={(e) => setDailyCap(e.target.value)} inputMode="numeric" placeholder="none" style={{ width: 90 }} />
      </td>
      <td>
        <input value={cooldown} onChange={(e) => setCooldown(e.target.value)} inputMode="numeric" style={{ width: 90 }} />
      </td>
      <td>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ width: 'auto' }} />
      </td>
      <td>
        <button className="primary" onClick={() => void save()} disabled={busy || !dirty}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </td>
    </tr>
  );
}

interface JobDef {
  key: string;
  label: string;
  path: string;
  describe: (res: Record<string, unknown>) => string;
}

const JOBS: JobDef[] = [
  {
    key: 'leaderboards',
    label: 'Rebuild leaderboards',
    path: '/admin/leaderboards/rebuild',
    describe: (r) => `Rebuilt — rating: ${r.rating ?? 0}, weekly_xp: ${r.weekly_xp ?? 0}.`,
  },
  {
    key: 'leagues',
    label: 'Settle league weeks',
    path: '/admin/leagues/settle',
    describe: (r) => `Settled ${r.settled ?? 0} cohort(s).`,
  },
  {
    key: 'seasons',
    label: 'End due seasons',
    path: '/admin/seasons/end',
    describe: (r) => `Processed ${r.processed ?? 0} season(s).`,
  },
];

function Maintenance(): React.JSX.Element {
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});

  async function run(job: JobDef): Promise<void> {
    setBusy(job.key);
    try {
      const res = await api<Record<string, unknown>>(job.path, { method: 'POST' });
      setResults((prev) => ({ ...prev, [job.key]: `✅ ${job.describe(res)}` }));
    } catch (err) {
      setResults((prev) => ({ ...prev, [job.key]: `❌ ${err instanceof ApiError ? err.message : 'Failed'}` }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card">
      <div className="section-title" style={{ marginTop: 0 }}>
        Maintenance jobs
      </div>
      <div className="subtle" style={{ marginBottom: 12 }}>
        These are idempotent — the scheduler runs them automatically; use these to trigger one now.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {JOBS.map((job) => (
          <div key={job.key} className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <button onClick={() => void run(job)} disabled={busy === job.key} style={{ minWidth: 200 }}>
              {busy === job.key ? 'Running…' : job.label}
            </button>
            {results[job.key] && (
              <span className={results[job.key]!.startsWith('❌') ? 'error' : 'subtle'}>{results[job.key]}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
