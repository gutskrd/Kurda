import { useState } from 'react';
import { api } from '../api';
import { Banner, Button, ErrorState, FieldRow, FormActions, Loading, PageHeader, Section, Select, TextInput, Textarea, errorLine, useDialogs, useLoad, useToast } from '../ui';

interface JobDef {
  key: string;
  label: string;
  what: string;
  path: string;
  /** asked first: it changes what players see */
  ask?: string;
  describe: (res: Record<string, unknown>) => string;
}

/**
 * The jobs a person may run from here. The weekly league settle and the
 * season close used to be here too; they live on the Leagues and Seasons
 * pages now, beside what they change and with their status. The board by
 * rating went with the old Elo rating: game ranks have boards of their own.
 */
const JOBS: JobDef[] = [
  {
    key: 'leaderboards',
    label: 'Rebuild the weekly XP board',
    what: 'Recounts the weekly XP leaderboard from the scores. Safe at any time; nothing is lost.',
    path: '/admin/leaderboards/rebuild',
    describe: (r) => `Rebuilt the weekly XP board: ${Number(r.weekly_xp ?? 0).toLocaleString()} ${Number(r.weekly_xp) === 1 ? 'learner' : 'learners'}.`,
  },
];

interface MediaUsage {
  storedBytes: number;
  storageLimitBytes: number;
  objectCount: number;
  period: string;
  classAOps: number;
  classALimit: number;
  classBOps: number;
  classBLimit: number;
  note: string;
}

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

/**
 * System: the jobs the server runs on its own, to run now; storage use against
 * its limits; and a test notification. They were mixed in with the Gem rules
 * under "Ops"; the jobs that change what players see are asked first.
 */
export function System(): React.JSX.Element {
  return (
    <div>
      <PageHeader title="System" subtitle="Jobs the server runs by itself, to run now; storage against its limits; and a test notification." />
      <Jobs />
      <Storage />
      <PushTest />
    </div>
  );
}

function Jobs(): React.JSX.Element {
  const toast = useToast();
  const dialogs = useDialogs();
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});

  async function run(job: JobDef): Promise<void> {
    if (job.ask && !(await dialogs.confirm({ title: `${job.label}?`, body: job.ask, confirmLabel: 'Run it now' }))) return;
    setBusy(job.key);
    try {
      const res = await api<Record<string, unknown>>(job.path, { method: 'POST' });
      const said = job.describe(res);
      setResults((r) => ({ ...r, [job.key]: said }));
      toast.success(said);
    } catch (err) {
      toast.error(errorLine(err, 'system jobs'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section
      title="Maintenance jobs"
      description={
        <>
          Each is safe to run twice. The league settle and the season close are on the <a href="#/leagues">Leagues</a> and <a href="#/seasons">Seasons</a> pages.
        </>
      }
    >
      <ul className="job-list">
        {JOBS.map((job) => (
          <li key={job.key} className="job">
            <div className="job-text">
              <strong>{job.label}</strong>
              <span className="subtle">{job.what}</span>
              {results[job.key] && (
                <span className="job-result" role="status">
                  {results[job.key]}
                </span>
              )}
            </div>
            <Button onClick={() => void run(job)} busy={busy === job.key} disabled={busy !== null && busy !== job.key}>
              {busy === job.key ? 'Running…' : 'Run now'}
            </Button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Meter({ label, used, limit, format = (n: number) => n.toLocaleString() }: { label: string; used: number; limit: number; format?: (n: number) => string }): React.JSX.Element {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div className="meter">
      <div className="meter-head">
        <span>{label}</span>
        <span className="subtle">
          {format(used)} of {format(limit)} · {Math.round(pct)}%
        </span>
      </div>
      <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
        <div className={`progress-bar${pct > 80 ? ' is-high' : ''}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Storage(): React.JSX.Element {
  const usage = useLoad(() => api<MediaUsage>('/admin/media/usage'), []);
  const u = usage.data;
  return (
    <Section title="Media storage" description={u ? `Pictures and recordings this month (${u.period}).` : 'Pictures and recordings.'}>
      {usage.error != null ? (
        <ErrorState error={usage.error} onRetry={() => void usage.reload()} what="media usage" compact />
      ) : !u ? (
        <Loading rows={3} />
      ) : (
        <div className="meters">
          <Meter label={`Stored (${u.objectCount.toLocaleString()} files)`} used={u.storedBytes} limit={u.storageLimitBytes} format={bytes} />
          <Meter label="Writes this month" used={u.classAOps} limit={u.classALimit} />
          <Meter label="Reads through the API this month" used={u.classBOps} limit={u.classBLimit} />
          <p className="note">Public reads of pictures do not pass through the API, so the reads here are not the whole bill; Cloudflare has the real numbers.</p>
        </div>
      )}
    </Section>
  );
}

function PushTest(): React.JSX.Element {
  const toast = useToast();
  const [userId, setUserId] = useState('');
  const [category, setCategory] = useState('events');
  const [title, setTitle] = useState('A test from Hevalo');
  const [body, setBody] = useState('If you can read this, notifications work.');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const badId = userId.trim() !== '' && !uuid.test(userId.trim());

  async function send(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (badId) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await api<{ queued: boolean; sent?: number; pruned?: number; suppressed?: boolean }>('/admin/push/test', {
        method: 'POST',
        body: { ...(userId.trim() ? { userId: userId.trim() } : {}), category, title: title.trim(), body: body.trim() },
      });
      const said = res.queued
        ? 'Queued: it goes to the inbox, and to the phone if this kind of notification is switched on there.'
        : res.suppressed
          ? 'In the inbox only: this kind of notification is switched off on that account, or it is their quiet hours.'
          : `In the inbox, and sent to ${res.sent ?? 0} ${res.sent === 1 ? 'device' : 'devices'}${res.pruned ? ` (${res.pruned} old ${res.pruned === 1 ? 'device' : 'devices'} removed)` : ''}.`;
      setResult(said);
      toast.success(said);
    } catch (err) {
      toast.error(errorLine(err, 'notifications'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Send a test notification" description="To your own account, or to the account whose id you paste. It also lands in their inbox.">
      <form className="form" onSubmit={(e) => void send(e)}>
        <FieldRow>
          <TextInput
            label="Account id"
            hint="Empty sends it to you."
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            error={badId ? 'That is not an account id.' : undefined}
            autoCapitalize="off"
            spellCheck={false}
          />
          <Select
            label="Kind"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={['events', 'streak', 'friends', 'games', 'marketing'].map((c) => ({ value: c, label: c[0]!.toUpperCase() + c.slice(1) }))}
          />
        </FieldRow>
        <TextInput label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
        <Textarea label="Message" value={body} onChange={(e) => setBody(e.target.value)} required maxLength={500} rows={2} />
        {result && <Banner tone="ok">{result}</Banner>}
        <FormActions>
          <Button variant="primary" type="submit" busy={busy} icon="arrowRight">
            {busy ? 'Sending…' : 'Send the test'}
          </Button>
        </FormActions>
      </form>
    </Section>
  );
}
