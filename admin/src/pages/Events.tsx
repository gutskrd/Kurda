import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';

interface GameEvent {
  key: string;
  name: string;
  type: string;
  startsAt: string;
  endsAt: string;
  priority: number;
  theme: string | null;
  enabled: boolean;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString();
}

/** A window/enabled-derived lifecycle label for the status badge. */
function lifecycle(e: GameEvent): { text: string; cls: string } {
  if (!e.enabled) return { text: 'disabled', cls: '' };
  const now = Date.now();
  const start = Date.parse(e.startsAt);
  const end = Date.parse(e.endsAt);
  if (now < start) return { text: 'upcoming', cls: 'mid' };
  if (now > end) return { text: 'ended', cls: 'hi' };
  return { text: 'live', cls: 'ok' };
}

/** ISO string → value for <input type="datetime-local"> (local, minute precision). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}

/** Config-driven events (KUR-089): list, kill-switch, schedule. */
export function Events(): React.JSX.Element {
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ events: GameEvent[] }>('/admin/events');
      setEvents(res.events);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load events');
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
      await api(`/admin/events/${key}/enabled`, { method: 'POST', body: { enabled } });
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
          <h1>Events</h1>
          <div className="subtle">Config-driven in-app events &amp; their schedule</div>
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
        ) : events.length === 0 ? (
          <div className="empty">No events yet. Schedule one below.</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Window</th>
                  <th>Prio</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => {
                  const l = lifecycle(e);
                  return (
                    <tr key={e.key}>
                      <td>
                        <code>{e.key}</code>
                      </td>
                      <td>{e.name}</td>
                      <td>
                        <span className="badge">{e.type}</span>
                      </td>
                      <td className="subtle" style={{ whiteSpace: 'nowrap' }}>
                        {fmt(e.startsAt)} → {fmt(e.endsAt)}
                      </td>
                      <td>{e.priority}</td>
                      <td>
                        <span className={`badge ${l.cls}`}>{l.text}</span>
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
                  );
                })}
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
  const now = new Date();
  const weekOut = new Date(now.getTime() + 7 * 86_400_000);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('seasonal');
  const [startsAt, setStartsAt] = useState(toLocalInput(now.toISOString()));
  const [endsAt, setEndsAt] = useState(toLocalInput(weekOut.toISOString()));
  const [priority, setPriority] = useState('0');
  const [theme, setTheme] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (Date.parse(endsAt) <= Date.parse(startsAt)) {
      setMsg('❌ End must be after start.');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await api('/admin/events', {
        method: 'POST',
        body: {
          key: key.trim(),
          name: name.trim(),
          type: type.trim(),
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          priority: Number(priority),
          theme: theme.trim() || null,
          enabled,
        },
      });
      setMsg(`✅ Saved "${key.trim()}".`);
      setKey('');
      setName('');
      await onCreated();
    } catch (err) {
      setMsg(err instanceof ApiError ? `❌ ${err.message}` : '❌ Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 560 }}>
      <h1 style={{ fontSize: 16, margin: 0 }}>Schedule / replace an event</h1>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <label style={{ flex: 1, minWidth: 180 }}>
          Key
          <input value={key} onChange={(ev) => setKey(ev.target.value)} placeholder="winter_2026" required />
        </label>
        <label style={{ flex: 1, minWidth: 180 }}>
          Name
          <input value={name} onChange={(ev) => setName(ev.target.value)} placeholder="Winter Festival" required />
        </label>
      </div>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <label style={{ flex: 1, minWidth: 140 }}>
          Type
          <input value={type} onChange={(ev) => setType(ev.target.value)} placeholder="seasonal" required />
        </label>
        <label style={{ width: 110 }}>
          Priority
          <input value={priority} onChange={(ev) => setPriority(ev.target.value)} inputMode="numeric" />
        </label>
        <label style={{ flex: 1, minWidth: 140 }}>
          Theme
          <input value={theme} onChange={(ev) => setTheme(ev.target.value)} placeholder="optional" />
        </label>
      </div>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <label style={{ flex: 1, minWidth: 200 }}>
          Starts
          <input type="datetime-local" value={startsAt} onChange={(ev) => setStartsAt(ev.target.value)} required />
        </label>
        <label style={{ flex: 1, minWidth: 200 }}>
          Ends
          <input type="datetime-local" value={endsAt} onChange={(ev) => setEndsAt(ev.target.value)} required />
        </label>
      </div>
      <label className="row" style={{ gap: 8, width: 'auto' }}>
        <input type="checkbox" checked={enabled} onChange={(ev) => setEnabled(ev.target.checked)} style={{ width: 'auto' }} />
        Enabled
      </label>
      {msg && <div className={msg.startsWith('❌') ? 'error' : 'subtle'}>{msg}</div>}
      <button className="primary" type="submit" disabled={busy} style={{ alignSelf: 'flex-start' }}>
        {busy ? 'Saving…' : 'Save event'}
      </button>
    </form>
  );
}
