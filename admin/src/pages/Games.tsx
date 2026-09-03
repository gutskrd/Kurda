import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';

interface Word {
  id: string;
  headword: string;
  normalized: string;
  dialect: string;
  length: number;
}
interface Stats {
  total: number;
  byLength: { length: number; words: number }[];
  difficulties: { difficulty: string; lengths: number[]; words: number }[];
}
interface RhymeReport {
  word: string;
  dialect: string;
  perfect: string[];
  near: string[];
  inDictionary: boolean;
}

const PAGE = 50;

/**
 * Game content management (the word pool). One dictionary feeds every word game:
 * Wordle picks its targets from it and validates guesses against it, and Rhyme
 * draws prompts from it and only accepts submissions that are in it.
 *
 * Rhymes are computed from each word's ending, never stored — so an admin curates
 * WORDS and the rhyme sets follow. The rhyme checker surfaces that computation so
 * a prompt with no partners can be spotted before players hit it.
 */
export function Games(): React.JSX.Element {
  const [words, setWords] = useState<Word[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [q, setQ] = useState('');
  const [length, setLength] = useState<number | ''>('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(page * PAGE) });
      if (q.trim()) params.set('q', q.trim());
      if (length !== '') params.set('length', String(length));
      const res = await api<{ total: number; words: Word[] }>(`/admin/dictionary?${params}`);
      setWords(res.words);
      setTotal(res.total);
      setStats(await api<Stats>('/admin/dictionary/stats'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load the word pool');
    } finally {
      setLoading(false);
    }
  }, [q, length, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(w: Word): Promise<void> {
    const ok = confirm(
      `Remove "${w.headword}" from the word pool?\n\nIt stops appearing in Wordle and Rhyme, and guesses of it are no longer accepted.`,
    );
    if (!ok) return;
    setBusy(w.id);
    try {
      await api(`/admin/dictionary/${w.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed');
    } finally {
      setBusy(null);
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div>
      <div className="toolbar">
        <div>
          <h1>Games</h1>
          <div className="subtle">The shared word pool behind Wordle and Rhyme</div>
        </div>
        <div className="spacer" />
        <button onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </div>

      {error && <div className="card empty">{error}</div>}
      {stats && <Coverage stats={stats} />}
      <AddWords onAdded={load} />
      <RhymeChecker />

      <div className="card" style={{ padding: 0 }}>
        <div className="toolbar" style={{ margin: '14px 16px 8px' }}>
          <div className="section-title">Word pool ({total})</div>
          <div className="spacer" />
          <input
            placeholder="Search words…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
          />
          <select
            value={length}
            onChange={(e) => {
              setLength(e.target.value === '' ? '' : Number(e.target.value));
              setPage(0);
            }}
          >
            <option value="">Any length</option>
            {[3, 4, 5, 6, 7, 8, 9].map((n) => (
              <option key={n} value={n}>
                {n} letters
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="empty">Loading…</div>
        ) : words.length === 0 ? (
          <div className="empty">No words match.</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Word</th>
                  <th>Letters</th>
                  <th>Dialect</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {words.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <strong>{w.headword}</strong>
                    </td>
                    <td>
                      <span className="badge">{w.length}</span>
                    </td>
                    <td className="subtle">{w.dialect}</td>
                    <td>
                      <button className="danger" onClick={() => void remove(w)} disabled={busy === w.id}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="toolbar" style={{ margin: '8px 16px 14px' }}>
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
              ← Previous
            </button>
            <div className="subtle">
              Page {page + 1} of {pages}
            </div>
            <button onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}>
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Wordle picks its target by letter length, so a thin band is worth surfacing. */
function Coverage({ stats }: { stats: Stats }): React.JSX.Element {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-title">Wordle coverage</div>
      <div className="subtle" style={{ marginBottom: 10 }}>
        Each difficulty uses a fixed word length. A band with no words falls back to an easier one; if
        every band is empty the game reports “no words available”.
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Difficulty</th>
              <th>Word length</th>
              <th>Words available</th>
            </tr>
          </thead>
          <tbody>
            {stats.difficulties.map((d) => (
              <tr key={d.difficulty}>
                <td style={{ textTransform: 'capitalize' }}>{d.difficulty}</td>
                <td className="subtle">{d.lengths.join(', ')}</td>
                <td>
                  <span className={`badge${d.words === 0 ? ' danger' : d.words < 10 ? ' mid' : ''}`}>{d.words}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="subtle" style={{ marginTop: 10 }}>{stats.total} words in the pool.</div>
    </div>
  );
}

/** Bulk word entry — one per line or comma separated. */
function AddWords({ onAdded }: { onAdded: () => Promise<void> }): React.JSX.Element {
  const [text, setText] = useState('');
  const [dialect, setDialect] = useState('kurmanji');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ added: string[]; skipped: string[]; invalid: string[] } | null>(null);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const words = text
      .split(/[\n,;]+/)
      .map((w) => w.trim())
      .filter(Boolean);
    if (words.length === 0) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await api<{ added: string[]; skipped: string[]; invalid: string[] }>('/admin/dictionary', {
        method: 'POST',
        body: { words, dialect },
      });
      setResult(res);
      setText('');
      await onAdded();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" style={{ marginBottom: 16 }} onSubmit={(e) => void submit(e)}>
      <div className="section-title">Add words</div>
      <div className="subtle" style={{ marginBottom: 10 }}>
        One per line (or comma separated). A word added here becomes a possible Wordle target, a valid
        Wordle guess, a Rhyme prompt and an accepted rhyme. Words already in the pool are skipped, so
        pasting the same list twice is safe.
      </div>
      <textarea
        rows={5}
        style={{ width: '100%' }}
        placeholder={'heval\nwelat\nziman'}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="toolbar" style={{ marginTop: 10 }}>
        <select value={dialect} onChange={(e) => setDialect(e.target.value)}>
          <option value="kurmanji">Kurmancî</option>
          <option value="sorani">Soranî</option>
        </select>
        <div className="spacer" />
        <button className="primary" type="submit" disabled={busy || text.trim() === ''}>
          {busy ? 'Adding…' : 'Add words'}
        </button>
      </div>
      {result && (
        <div className="subtle" style={{ marginTop: 10 }}>
          Added {result.added.length}.{' '}
          {result.skipped.length > 0 && `Already present: ${result.skipped.length}. `}
          {result.invalid.length > 0 && `Rejected (not words): ${result.invalid.join(', ')}.`}
        </div>
      )}
    </form>
  );
}

/** Shows which pool words rhyme with a given word (computed, not stored). */
function RhymeChecker(): React.JSX.Element {
  const [word, setWord] = useState('');
  const [dialect, setDialect] = useState('kurmanci');
  const [report, setReport] = useState<RhymeReport | null>(null);
  const [busy, setBusy] = useState(false);

  async function check(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!word.trim()) return;
    setBusy(true);
    try {
      const params = new URLSearchParams({ word: word.trim(), dialect });
      setReport(await api<RhymeReport>(`/admin/dictionary/rhymes?${params}`));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" style={{ marginBottom: 16 }} onSubmit={(e) => void check(e)}>
      <div className="section-title">Rhymes for a word</div>
      <div className="subtle" style={{ marginBottom: 10 }}>
        Rhymes aren’t stored — the game works them out from each word’s ending, so you don’t enter rhyme
        pairs. You add words, and anything with a matching ending rhymes automatically. Check a word here
        before using it as a prompt: with no partners in the pool, players can’t score on it.
      </div>
      <div className="toolbar">
        <input placeholder="e.g. gul" value={word} onChange={(e) => setWord(e.target.value)} />
        <select value={dialect} onChange={(e) => setDialect(e.target.value)}>
          <option value="kurmanci">Kurmancî</option>
          <option value="sorani">Soranî</option>
        </select>
        <button type="submit" disabled={busy || !word.trim()}>
          {busy ? 'Checking…' : 'Check'}
        </button>
      </div>
      {report && (
        <div style={{ marginTop: 12 }}>
          {!report.inDictionary && (
            <div className="subtle" style={{ marginBottom: 8 }}>
              Note: “{report.word}” isn’t in the pool yet, so it can’t be used as a prompt until you add it.
            </div>
          )}
          <div style={{ marginBottom: 8 }}>
            <strong>Perfect rhymes ({report.perfect.length}):</strong>{' '}
            {report.perfect.length ? report.perfect.join(', ') : <span className="subtle">none in the pool</span>}
          </div>
          <div>
            <strong>Near rhymes ({report.near.length}):</strong>{' '}
            {report.near.length ? report.near.join(', ') : <span className="subtle">none in the pool</span>}
          </div>
        </div>
      )}
    </form>
  );
}
