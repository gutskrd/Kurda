import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';

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
 * Nothing it imports becomes a Wordle answer or a rhyme prompt — those come from
 * the curated pool, and this only makes the games accept more of what players
 * type. The note under the button says so, because that is the thing most likely
 * to be misread as "it did not work".
 */
export function DictionaryImport(): React.JSX.Element | null {
  const { me } = useAuth();
  const [state, setState] = useState<Response | null>(null);
  const [lang, setLang] = useState('ku');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  /*
   * Cosmetic, like the rest of the admin's role handling — the API refuses this
   * to a content editor whatever the page shows. Hidden rather than disabled
   * because a button somebody can never press is worse than no button: it
   * invites them to keep trying.
   */
  const mayImport = (me?.roles ?? []).some((r) => r === 'admin' || r === 'superadmin');

  const load = useCallback(async () => {
    try {
      setState(await api<Response>('/admin/dictionary/import'));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not read the import status');
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
    setError(null);
    try {
      setState({ ...(state as Response), run: (await api<{ run: Run }>('/admin/dictionary/import', {
        method: 'POST',
        body: { lang },
      })).run });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the import');
    } finally {
      setBusy(false);
    }
  }

  async function cancel(): Promise<void> {
    if (
      !confirm(
        'Stop watching this import?\n\nThe words it has already added stay. This only frees the button, for when a run has died and the page is still waiting on it.',
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await api('/admin/dictionary/import', { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not stop the import');
    } finally {
      setBusy(false);
    }
  }

  if (!mayImport) return null;

  const run = state?.run ?? null;
  const running = run?.status === 'running';
  const resumable = run?.status === 'failed' && run.filesDone < run.filesTotal;

  return (
    <div className="card">
      <div className="toolbar" style={{ marginBottom: 10 }}>
        <div className="section-title" style={{ margin: 0 }}>
          Import a dictionary
        </div>
        <div className="spacer" />
        {run && <span className="subtle">{describe(run)}</span>}
      </div>

      {error && <div className="empty">{error}</div>}

      {running ? (
        <>
          <div className="progress" aria-label="Import progress">
            <div className="progress-bar" style={{ width: `${run.percent}%` }} />
          </div>
          <div className="subtle" style={{ marginTop: 8 }}>
            {run.filesDone} of {run.filesTotal} files · {run.entries.toLocaleString()} words added
            {run.etaMinutes !== null && ` · about ${run.etaMinutes} min left`}
          </div>
          <div className="subtle" style={{ marginTop: 6 }}>
            You can close this page. It keeps going.
          </div>
          <div style={{ marginTop: 12 }}>
            <button onClick={() => void cancel()} disabled={busy}>
              Stop watching
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <select value={lang} onChange={(e) => setLang(e.target.value)} disabled={busy}>
              {Object.keys(state?.languages ?? { ku: 'kurmanji' }).map((code) => (
                <option key={code} value={code}>
                  {LANG_LABEL[code] ?? code}
                </option>
              ))}
            </select>
            <button onClick={() => void start()} disabled={busy}>
              {resumable ? 'Continue the import' : 'Start the import'}
            </button>
          </div>

          {run?.error && (
            <div className="empty" style={{ marginTop: 10 }}>
              It stopped after {run.filesDone} of {run.filesTotal} files: {run.error}
              {resumable && ' — everything it had written is kept, and continuing picks up from there.'}
            </div>
          )}

          <div className="subtle" style={{ marginTop: 10 }}>
            About an hour and a half. Words arrive in the dictionary, which is what a guess is checked
            against — none of them becomes a Wordle answer or a rhyme prompt, so promote the ones you
            want asked in the Word pool above.
          </div>
        </>
      )}
    </div>
  );
}

function describe(run: Run): string {
  if (run.status === 'running') return `${run.percent}%`;
  if (run.status === 'done') {
    return `Done — ${run.entries.toLocaleString()} words, ${run.conflicts.toLocaleString()} conflicts`;
  }
  if (run.status === 'cancelled') return `Stopped at ${run.filesDone} of ${run.filesTotal} files`;
  return `Failed at ${run.filesDone} of ${run.filesTotal} files`;
}
