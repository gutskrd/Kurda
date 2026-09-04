import { useState } from 'react';
import { api, ApiError } from '../api';
import { ItemActions, WalletActions } from './UserEconomy';

type BanState = 'active' | 'temp_banned' | 'perm_banned';

interface SearchResult {
  id: string;
  username: string;
  email: string;
  ban: BanState;
}
interface UserDetail {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  roles: string[];
  createdAt: string;
  ban: BanState;
  bannedUntil: string | null;
  mutedUntil: string | null;
  balances: { zer: number; gems: number };
  ledger: Array<{ currency: string; amount: number; reason: string; createdAt: string }>;
  sessions: Array<{ deviceName: string | null; createdAt: string; expiresAt: string }>;
  actions: Array<{ action: string; reason: string; meta: unknown; adminId: string | null; createdAt: string }>;
}

const BAN_LABEL: Record<BanState, { text: string; cls: string }> = {
  active: { text: 'active', cls: '' },
  temp_banned: { text: 'temp banned', cls: 'mid' },
  perm_banned: { text: 'banned', cls: 'hi' },
};

/** Admin user management (KUR-101) — search, inspect, moderate. 2FA-gated. */
export function Users(): React.JSX.Element {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [selected, setSelected] = useState<UserDetail | null>(null);
  const [needs2fa, setNeeds2fa] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleErr(err: unknown): void {
    if (err instanceof ApiError && err.status === 403) {
      setNeeds2fa(true);
      return;
    }
    setError(err instanceof ApiError ? err.message : 'Something went wrong');
  }

  async function search(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!q.trim()) return;
    setSearching(true);
    setError(null);
    setSelected(null);
    try {
      const res = await api<{ users: SearchResult[] }>(`/admin/users?q=${encodeURIComponent(q.trim())}`);
      setResults(res.users);
    } catch (err) {
      handleErr(err);
    } finally {
      setSearching(false);
    }
  }

  async function open(id: string): Promise<void> {
    setError(null);
    try {
      setSelected(await api<UserDetail>(`/admin/users/${id}`));
    } catch (err) {
      handleErr(err);
    }
  }

  if (needs2fa) {
    return (
      <div>
        <div className="toolbar">
          <h1>Users</h1>
        </div>
        <div className="card" style={{ maxWidth: 520 }}>
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            <span className="badge mid">2FA required</span>
          </div>
          <div className="subtle">
            User management needs a confirmed authenticator. Open <a href="#/security">Security</a> to set up 2FA, then come back.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h1>Users</h1>
          <div className="subtle">Search by id, email, or username</div>
        </div>
        <div className="spacer" />
        <form onSubmit={search} className="row" style={{ gap: 8, width: 'auto' }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="username, email or uuid"
            style={{ width: 260 }}
          />
          <button className="primary" type="submit" disabled={searching || !q.trim()}>
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>
      </div>

      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}

      {results && (
        <div className="card" style={{ padding: 0, marginBottom: 16 }}>
          {results.length === 0 ? (
            <div className="empty">No users match “{q}”.</div>
          ) : (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((u) => {
                    const b = BAN_LABEL[u.ban];
                    return (
                      <tr key={u.id}>
                        <td>{u.username}</td>
                        <td className="subtle">{u.email}</td>
                        <td>
                          <span className={`badge ${b.cls}`}>{b.text}</span>
                        </td>
                        <td>
                          <button onClick={() => void open(u.id)}>Open</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {selected && <UserPanel user={selected} onChanged={() => void open(selected.id)} onError={handleErr} />}
    </div>
  );
}

function fmt(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}

function UserPanel({
  user,
  onChanged,
  onError,
}: {
  user: UserDetail;
  onChanged: () => void;
  onError: (err: unknown) => void;
}): React.JSX.Element {
  const b = BAN_LABEL[user.ban];
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>{user.username}</h1>
        <span className={`badge ${b.cls}`}>{b.text}</span>
        {user.roles.map((r) => (
          <span key={r} className="badge">
            {r}
          </span>
        ))}
      </div>
      <div className="grid2">
        <Field label="Email" value={user.email} />
        <Field label="Display name" value={user.displayName ?? '—'} />
        <Field label="User id" value={<code>{user.id}</code>} />
        <Field label="Joined" value={fmt(user.createdAt)} />
        <Field label="Banned until" value={fmt(user.bannedUntil)} />
        <Field label="Muted until" value={fmt(user.mutedUntil)} />
        <Field label="Balance (zêr)" value={String(user.balances.zer)} />
        <Field label="Balance (gems)" value={String(user.balances.gems)} />
      </div>

      <ModerationActions user={user} onChanged={onChanged} onError={onError} />

      <WalletActions user={user} onChanged={onChanged} onError={onError} />

      <ItemActions user={user} onChanged={onChanged} onError={onError} />

      {user.actions.length > 0 && (
        <div>
          <div className="section-title">Recent moderation actions</div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Reason</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {user.actions.map((a, i) => (
                  <tr key={i}>
                    <td>
                      <span className="badge">{a.action}</span>
                    </td>
                    <td className="subtle">{a.reason}</td>
                    <td className="subtle">{fmt(a.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <div>
      <div className="k">{label}</div>
      <div>{value}</div>
    </div>
  );
}

type ActionKind = 'warn' | 'mute' | 'ban' | 'unban';

function ModerationActions({
  user,
  onChanged,
  onError,
}: {
  user: UserDetail;
  onChanged: () => void;
  onError: (err: unknown) => void;
}): React.JSX.Element {
  const [kind, setKind] = useState<ActionKind>('warn');
  const [reason, setReason] = useState('');
  const [hours, setHours] = useState('24');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const banned = user.ban !== 'active';

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = { reason: reason.trim() };
      if (kind === 'mute') body.hours = Number(hours);
      if (kind === 'ban' && hours.trim()) body.hours = Number(hours);
      await api(`/admin/users/${user.id}/${kind}`, { method: 'POST', body });
      setMsg(`✅ ${kind} applied.`);
      setReason('');
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status !== 403) {
        setMsg(`❌ ${err.message}`);
      } else {
        onError(err);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="section-title" style={{ margin: 0 }}>
        Take action
      </div>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <label style={{ width: 'auto' }}>
          <select value={kind} onChange={(e) => setKind(e.target.value as ActionKind)} style={{ width: 'auto' }}>
            <option value="warn">Warn</option>
            <option value="mute">Mute</option>
            <option value="ban">Ban</option>
            <option value="unban" disabled={!banned}>
              Unban
            </option>
          </select>
        </label>
        {(kind === 'mute' || kind === 'ban') && (
          <label className="row" style={{ gap: 6, width: 'auto' }}>
            <span className="subtle">Hours</span>
            <input
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              inputMode="numeric"
              placeholder={kind === 'ban' ? 'blank = permanent' : '24'}
              style={{ width: 120 }}
            />
          </label>
        )}
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required)"
          style={{ flex: 1, minWidth: 200 }}
          required
        />
        <button
          className={kind === 'unban' ? 'primary' : 'danger'}
          type="submit"
          disabled={busy || !reason.trim() || (kind === 'mute' && !hours.trim())}
        >
          {busy ? 'Applying…' : `Apply ${kind}`}
        </button>
      </div>
      {msg && <div className={msg.startsWith('❌') ? 'error' : 'subtle'}>{msg}</div>}
    </form>
  );
}
