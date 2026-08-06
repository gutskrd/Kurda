import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';

interface Variant {
  key: string;
  weight: number;
}
interface Experiment {
  key: string;
  description: string | null;
  enabled: boolean;
  variants: Variant[];
}

/** Parse a "control:1, treatment:2" variants string into weighted variants. */
function parseVariants(input: string): Variant[] | null {
  const parts = input
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const variants: Variant[] = [];
  for (const p of parts) {
    const [key, weightRaw] = p.split(':').map((s) => s.trim());
    if (!key || !/^[a-z0-9][a-z0-9_]*$/.test(key)) return null;
    const weight = weightRaw === undefined || weightRaw === '' ? 1 : Number(weightRaw);
    if (!Number.isFinite(weight) || weight < 0) return null;
    variants.push({ key, weight });
  }
  return variants;
}

/** A/B experiment (feature flag) config (KUR-107): list, kill-switch, create. */
export function Experiments(): React.JSX.Element {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ experiments: Experiment[] }>('/admin/experiments');
      setExperiments(res.experiments);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load experiments');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(key: string, enabled: boolean): Promise<void> {
    setBusy(key);
    try {
      await api(`/admin/experiments/${key}/enabled`, { method: 'POST', body: { enabled } });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Toggle failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h1>Experiments</h1>
          <div className="subtle">A/B experiments &amp; feature flags</div>
        </div>
        <div className="spacer" />
        <button onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </div>

      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="card" style={{ padding: 0, marginBottom: 16 }}>
        {loading ? (
          <div className="empty">Loading…</div>
        ) : experiments.length === 0 ? (
          <div className="empty">No experiments yet. Create one below.</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Description</th>
                  <th>Variants</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {experiments.map((e) => (
                  <tr key={e.key}>
                    <td>
                      <code>{e.key}</code>
                    </td>
                    <td className="subtle">{e.description ?? '—'}</td>
                    <td>
                      <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                        {e.variants.map((v) => (
                          <span key={v.key} className="badge">
                            {v.key} · {v.weight}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${e.enabled ? 'ok' : ''}`}>{e.enabled ? 'enabled' : 'disabled'}</span>
                    </td>
                    <td>
                      <button
                        className={e.enabled ? 'danger' : 'primary'}
                        onClick={() => void toggle(e.key, !e.enabled)}
                        disabled={busy === e.key}
                      >
                        {e.enabled ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateForm onCreated={load} />
    </div>
  );
}

function CreateForm({ onCreated }: { onCreated: () => Promise<void> }): React.JSX.Element {
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [variantsText, setVariantsText] = useState('control:1, treatment:1');
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const variants = parseVariants(variantsText);
    if (!variants) {
      setMsg('❌ Variants must be "key:weight" pairs (keys lowercase a-z0-9_, weight ≥ 0).');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await api('/admin/experiments', {
        method: 'POST',
        body: { key: key.trim(), description: description.trim() || null, enabled, variants },
      });
      setMsg(`✅ Saved "${key.trim()}".`);
      setKey('');
      setDescription('');
      await onCreated();
    } catch (err) {
      setMsg(err instanceof ApiError ? `❌ ${err.message}` : '❌ Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 520 }}>
      <h1 style={{ fontSize: 16, margin: 0 }}>Create / replace an experiment</h1>
      <label>
        Key
        <input value={key} onChange={(ev) => setKey(ev.target.value)} placeholder="new_onboarding_flow" required />
      </label>
      <label>
        Description
        <input value={description} onChange={(ev) => setDescription(ev.target.value)} placeholder="optional" />
      </label>
      <label>
        Variants (key:weight, comma-separated)
        <input value={variantsText} onChange={(ev) => setVariantsText(ev.target.value)} placeholder="control:1, treatment:1" required />
      </label>
      <label className="row" style={{ gap: 8, width: 'auto' }}>
        <input type="checkbox" checked={enabled} onChange={(ev) => setEnabled(ev.target.checked)} style={{ width: 'auto' }} />
        Enabled
      </label>
      {msg && <div className={msg.startsWith('❌') ? 'error' : 'subtle'}>{msg}</div>}
      <button className="primary" type="submit" disabled={busy} style={{ alignSelf: 'flex-start' }}>
        {busy ? 'Saving…' : 'Save experiment'}
      </button>
    </form>
  );
}
