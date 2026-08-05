import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';

type Kind = 'main' | 'claimable';
type Acquisition = 'default' | 'role' | 'purchase' | 'self_claim' | 'auto_grant';

interface Tag {
  id: string;
  key: string;
  label: string;
  kind: Kind;
  category: string;
  acquisition: Acquisition;
  sensitive: boolean;
}

/** User tags & badges catalog management (KUR-286). */
export function Tags(): React.JSX.Element {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ tags: Tag[] }>('/tags');
      setTags(res.tags);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function deactivate(key: string): Promise<void> {
    if (!confirm(`Deactivate the "${key}" tag? It disappears everywhere but history is kept.`)) return;
    setBusy(key);
    try {
      await api(`/admin/tags/${key}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed');
    } finally {
      setBusy(null);
    }
  }

  const main = tags.filter((t) => t.kind === 'main');
  const claimable = tags.filter((t) => t.kind === 'claimable');

  return (
    <div>
      <div className="toolbar">
        <div>
          <h1>Tags & Badges</h1>
          <div className="subtle">The identity-tag catalog (main + claimable)</div>
        </div>
        <div className="spacer" />
        <button onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="card empty">Loading…</div>
      ) : (
        <>
          <TagTable title="Main tags (by precedence)" tags={main} busy={busy} onDeactivate={deactivate} />
          <TagTable title="Claimable tags" tags={claimable} busy={busy} onDeactivate={deactivate} />
          <CreateTagForm onCreated={load} />
        </>
      )}
    </div>
  );
}

function TagTable({
  title,
  tags,
  busy,
  onDeactivate,
}: {
  title: string;
  tags: Tag[];
  busy: string | null;
  onDeactivate: (key: string) => void;
}): React.JSX.Element {
  return (
    <div className="card" style={{ padding: 0, marginBottom: 16 }}>
      <div className="section-title" style={{ margin: '14px 16px 8px' }}>
        {title}
      </div>
      {tags.length === 0 ? (
        <div className="empty">None.</div>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Label</th>
                <th>Category</th>
                <th>Acquisition</th>
                <th>Flags</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tags.map((t) => (
                <tr key={t.id}>
                  <td>
                    <code>{t.key}</code>
                  </td>
                  <td>{t.label}</td>
                  <td>
                    <span className="badge">{t.category}</span>
                  </td>
                  <td className="subtle">{t.acquisition}</td>
                  <td>{t.sensitive && <span className="badge mid">sensitive</span>}</td>
                  <td>
                    <button className="danger" onClick={() => onDeactivate(t.key)} disabled={busy === t.key}>
                      Deactivate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CreateTagForm({ onCreated }: { onCreated: () => Promise<void> }): React.JSX.Element {
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<Kind>('claimable');
  const [category, setCategory] = useState('custom');
  const [acquisition, setAcquisition] = useState<Acquisition>('self_claim');
  const [sensitive, setSensitive] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api('/admin/tags', { method: 'POST', body: { key, label, kind, category, acquisition, sensitive } });
      setMsg(`✅ Created "${key}".`);
      setKey('');
      setLabel('');
      await onCreated();
    } catch (err) {
      setMsg(err instanceof ApiError ? `❌ ${err.message}` : '❌ Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 480 }}>
      <h1 style={{ fontSize: 16 }}>Create a tag</h1>
      <div className="row" style={{ gap: 10 }}>
        <label style={{ flex: 1 }}>
          Key<input value={key} onChange={(e) => setKey(e.target.value)} placeholder="poet" required />
        </label>
        <label style={{ flex: 1 }}>
          Label<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Poet" required />
        </label>
      </div>
      <div className="row" style={{ gap: 10 }}>
        <label style={{ flex: 1 }}>
          Kind
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="claimable">Claimable</option>
            <option value="main">Main</option>
          </select>
        </label>
        <label style={{ flex: 1 }}>
          Category<input value={category} onChange={(e) => setCategory(e.target.value)} required />
        </label>
      </div>
      <label>
        Acquisition
        <select value={acquisition} onChange={(e) => setAcquisition(e.target.value as Acquisition)}>
          <option value="self_claim">Self-claim</option>
          <option value="auto_grant">Auto-grant</option>
          <option value="purchase">Purchase</option>
          <option value="role">Role</option>
          <option value="default">Default</option>
        </select>
      </label>
      <label className="row" style={{ gap: 8, width: 'auto' }}>
        <input type="checkbox" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} style={{ width: 'auto' }} />
        Sensitive (personal data — requires consent to claim)
      </label>
      {msg && <div className={msg.startsWith('❌') ? 'error' : 'subtle'}>{msg}</div>}
      <button className="primary" type="submit" disabled={busy}>
        {busy ? 'Creating…' : 'Create tag'}
      </button>
    </form>
  );
}
