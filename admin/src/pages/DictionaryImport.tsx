import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useSession } from '../session';
import { Banner, Button, ErrorState, FormActions, Section, Select, errorLine, useDialogs, useToast } from '../ui';

type Status = 'running' | 'done' | 'failed' | 'cancelled';

interface Run {
  id: string;
  lang: string;
  status: Status;
  filesTotal: number;
  filesDone: number;
  entries: number;
  senses: number;
  duplicates: number;
  conflicts: number;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  percent: number;
  etaMinutes: number | null;
}

interface Response {
  run: Run | null;
  languages: Record<string, string>;
}

/** While it is running, ask again this often. */
const POLL_MS = 4000;

const LANG_LABEL: Record<string, string> = {
  ku: 'Kurmancî — about 447,000 words',
  sor: 'Soranî',
  zza: 'Zazakî',
};

/**
 * Importing Wîkîferheng, from here rather than from a shell on the host.
 *
 * It takes about an hour and a half, which is longer than any request and longer
 * than a browser tab is reliably open, so the button starts the work and this
 * watches it. Closing the page does not stop it; coming back shows where it got
 * to. A deploy in the middle does stop it, and pressing the button again carries
 * on from the file it reached.
 *
 * Nothing it imports becomes a Peyvok answer or a rhyme prompt — those come from
 * the curated pool, and this only makes the games accept more of what players
 * type. The note under the button says so, because that is the thing most likely
 * to be misread as "it did not work".
 */
export function DictionaryImport(): React.JSX.Element | null {
  const session = useSession();
  const toast = useToast();
  const dialogs = useDialogs();
  const [state, setState] = useState<Response | null>(null);
  const [lang, setLang] = useState('ku');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  /*
   * The API refuses this to a content editor whatever the page shows. Hidden
   * rather than disabled because a button somebody can never press is worse
   * than no button: it invites them to keep trying.
   */
  const mayImport = session.staffRoles.some((r) => r === 'admin' || r === 'superadmin');

  const load = useCallback(async () => {
    try {
      setState(await api<Response>('/admin/dictionary/import'));
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    if (mayImport) void load();
  }, [load, mayImport]);

  // poll only while something is actually moving, and stop when it stops
  useEffect(() => {
    if (state?.run?.status !== 'running') return;
    timer.current = window.setTimeout(() => void load(), POLL_MS);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [state, load]);

  async function start(): Promise<void> {
    setBusy(true);
    try {
      const res = await api<{ run: Run }>('/admin/dictionary/import', { method: 'POST', body: { lang } });
      setState((s) => ({ languages: s?.languages ?? {}, run: res.run }));
      toast.success('The import has started. You can leave this page; it keeps going.');
    } catch (err) {
      toast.error(errorLine(err, 'the dictionary import'));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(): Promise<void> {
    const yes = await dialogs.confirm({
      title: 'Stop watching this import?',
      body: 'The words it has already added stay. This only frees the button, for when a run has died and the page is still waiting on it.',
      confirmLabel: 'Stop watching',
    });
    if (!yes) return;
    setBusy(true);
    try {
      await api('/admin/dictionary/import', { method: 'DELETE' });
      await load();
    } catch (err) {
      toast.error(errorLine(err, 'the dictionary import'));
    } finally {
      setBusy(false);
    }
  }

  if (!mayImport) return null;

  const run = state?.run ?? null;
  const running = run?.status === 'running';
  const resumable = run?.status === 'failed' && run.filesDone < run.filesTotal;

  return (
    <Section
      title="Import the dictionary"
      description="Words arrive in the dictionary, which is what a guess is checked against. None of them becomes a Peyvok answer or a rhyme base word: add the ones you want asked to the games above."
      actions={run ? <span className="subtle">{describe(run)}</span> : undefined}
    >
      {error != null && <ErrorState error={error} onRetry={() => void load()} what="the dictionary import" compact />}

      {running ? (
        <div className="import-run">
          <div className="progress" role="progressbar" aria-label="Import progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={run.percent}>
            <div className="progress-bar" style={{ width: `${run.percent}%` }} />
          </div>
          <p className="note" role="status">
            {run.filesDone} of {run.filesTotal} files · {run.entries.toLocaleString()} words added
            {run.etaMinutes !== null && ` · about ${run.etaMinutes} min left`}. You can close this page; it keeps going.
          </p>
          <FormActions>
            <Button onClick={() => void cancel()} disabled={busy}>
              Stop watching
            </Button>
          </FormActions>
        </div>
      ) : (
        <div className="form">
          {run?.error && (
            <Banner tone="bad" title={`It stopped after ${run.filesDone} of ${run.filesTotal} files`}>
              {run.error}
              {resumable && ' Everything it had written is kept, and continuing picks up from there.'}
            </Banner>
          )}
          <FormActions>
            <Select
              label="Dictionary"
              fieldClassName="is-inline"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              disabled={busy}
              options={Object.keys(state?.languages ?? { ku: 'kurmanji' }).map((code) => ({ value: code, label: LANG_LABEL[code] ?? code }))}
            />
            <Button variant="primary" onClick={() => void start()} busy={busy}>
              {resumable ? 'Continue the import' : 'Start the import'}
            </Button>
          </FormActions>
          <p className="note">It takes about an hour and a half.</p>
        </div>
      )}
    </Section>
  );
}

function describe(run: Run): string {
  if (run.status === 'running') return `${run.percent}% done`;
  if (run.status === 'done') return `Last import: ${run.entries.toLocaleString()} words, ${run.conflicts.toLocaleString()} conflicts`;
  if (run.status === 'cancelled') return `Stopped at ${run.filesDone} of ${run.filesTotal} files`;
  return `Failed at ${run.filesDone} of ${run.filesTotal} files`;
}
