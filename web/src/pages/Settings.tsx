import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { useApiGet } from '../lib/useApi';
import type { MeProfile } from '../lib/types';
import { Loading, ErrorState } from '../components/states';
import { Button } from '../components/Button';

const VISIBILITIES = ['everyone', 'members', 'friends', 'nobody'] as const;
type Visibility = (typeof VISIBILITIES)[number];

/**
 * 'Everyone' has to say *the web*, out loud.
 *
 * MyKurda can be read without an account, so the widest setting is genuinely
 * public — findable, linkable, readable by someone who never signed up. A chip
 * labelled "Everyone" reads like "everyone here", which is what 'Members' is,
 * and nobody should learn the difference after the fact.
 */
const VIS_LABEL: Record<Visibility, string> = {
  everyone: 'Anyone on the web',
  members: 'MyKurda members',
  friends: 'Friends only',
  nobody: 'Nobody',
};

const VIS_HINT: Record<Visibility, string> = {
  everyone: 'Anyone at all, signed in or not — including search engines.',
  members: 'Anyone signed in to MyKurda. Signed-out visitors see only your name.',
  friends: 'Only people you have added as friends.',
  nobody: 'Nobody but you. You stay out of search and off the rankings.',
};

export function Settings(): React.JSX.Element {
  const { client, logout } = useAuth();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApiGet<{ user: MeProfile }>('/me');

  if (loading) return <Loading label="Loading settings…" />;
  if (error || !data) return <ErrorState message={error ?? 'Unavailable.'} onRetry={reload} />;

  return (
    <div className="container container-narrow">
      <div className="page-header">
        <span className="eyebrow">Mîheng · Account</span>
        <h1 className="page-title">Settings</h1>
      </div>

      <Privacy current={data.user.profileVisibility} />

      <section className="card" style={{ marginTop: 20 }}>
        <h2 className="friend-heading" style={{ marginTop: 0 }}>Sessions</h2>
        <p className="muted" style={{ fontSize: '0.92rem', marginBottom: 14 }}>
          Sign out here, or on every device at once.
        </p>
        {/*
          Signing out lives here now rather than in the nav, where it sat one slip
          away from ending your session every time you reached for your profile.
          It belongs with the other things you do to your account.
        */}
        <div className="settings-actions">
          <Button
            onClick={() => {
              void logout().then(() => navigate('/'));
            }}
          >
            Sign out
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              void client.delete('/me/sessions').then(() => logout()).then(() => navigate('/'));
            }}
          >
            Log out everywhere
          </Button>
        </div>
      </section>

      <ExportData />

      <DangerZone
        onDeleted={() => {
          void logout().then(() => navigate('/'));
        }}
      />
    </div>
  );
}

function Privacy({ current }: { current: Visibility }): React.JSX.Element {
  const { client } = useAuth();
  const [vis, setVis] = useState<Visibility>(current);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function change(next: Visibility): Promise<void> {
    setVis(next);
    setBusy(true);
    setMsg(null);
    const res = await client.request('PUT', '/me/privacy', { body: { visibility: next } });
    setBusy(false);
    if (res.ok) setMsg('Saved.');
    else {
      setVis(current);
      setMsg(describeError(res.error));
    }
  }

  return (
    <section className="card">
      <h2 className="friend-heading" style={{ marginTop: 0 }}>Profile visibility</h2>
      <p className="muted" style={{ fontSize: '0.92rem', marginBottom: 14 }}>Who can see your profile.</p>
      <div className="toolbar" style={{ marginBottom: 8 }} role="group" aria-label="Profile visibility">
        {VISIBILITIES.map((v) => (
          <button
            key={v}
            type="button"
            className={`chip${vis === v ? ' active' : ''}`}
            disabled={busy}
            aria-pressed={vis === v}
            onClick={() => change(v)}
          >
            {VIS_LABEL[v]}
          </button>
        ))}
      </div>
      <p className="field-hint" style={{ marginBottom: 0 }}>{VIS_HINT[vis]}</p>
      {msg && <span className="field-hint">{msg}</span>}
    </section>
  );
}

function ExportData(): React.JSX.Element {
  const { client } = useAuth();
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  return (
    <section className="card" style={{ marginTop: 20 }}>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>Your data</h2>
      <p className="muted" style={{ fontSize: '0.92rem', marginBottom: 14 }}>
        Request a copy of your MyKurda data. We’ll prepare it and email you when it’s ready.
      </p>
      {state === 'done' ? (
        <div className="msg msg-success">Export requested — you’ll be notified when it’s ready.</div>
      ) : (
        <Button
          variant="secondary"
          disabled={state === 'sending'}
          onClick={() => {
            setState('sending');
            void client.post('/me/export').then((r) => setState(r.ok ? 'done' : 'error'));
          }}
        >
          {state === 'sending' ? 'Requesting…' : 'Request data export'}
        </Button>
      )}
      {state === 'error' && <div className="msg msg-error" style={{ marginTop: 10 }}>Couldn’t request the export.</div>}
    </section>
  );
}

function DangerZone({ onDeleted }: { onDeleted: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function del(): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await client.delete<{ deletionScheduled: boolean; graceDays: number }>('/me');
    setBusy(false);
    if (res.ok) onDeleted();
    else setError(describeError(res.error));
  }

  return (
    <section className="card danger-card" style={{ marginTop: 20 }}>
      <h2 className="friend-heading" style={{ marginTop: 0, color: 'var(--danger)' }}>Delete account</h2>
      <p className="muted" style={{ fontSize: '0.92rem', marginBottom: 14 }}>
        Schedules your account for deletion after a grace period. Signing back in during that window cancels it.
      </p>
      {error && <div className="msg msg-error">{error}</div>}
      {confirming ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button variant="secondary" size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
          <button type="button" className="btn btn-sm" style={{ background: 'var(--danger)', color: '#fff', borderColor: 'var(--danger)' }} onClick={del} disabled={busy}>
            {busy ? 'Deleting…' : 'Yes, delete my account'}
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)', borderColor: 'color-mix(in srgb, var(--danger) 45%, var(--border-strong))' }} onClick={() => setConfirming(true)}>
          Delete account
        </button>
      )}
    </section>
  );
}
