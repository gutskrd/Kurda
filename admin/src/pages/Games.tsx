import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { RhymeEditor } from './RhymeEditor';
import { QuizQuestions } from './QuizQuestions';

interface Word {
  id: string;
  headword: string;
  normalized: string;
  dialect: string;
  length: number;
  /** used as a rhyme-round prompt */
  isRhymePrompt: boolean;
}
interface Stats {
  total: number;
  /** how many words are curated as rhyme prompts */
  rhymePrompts: number;
  byLength: { length: number; words: number }[];
  difficulties: { difficulty: string; lengths: number[]; words: number }[];
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
  // categories: the pool is shared, but Wordle and Rhyme care about different
  // things, so each gets its own view rather than one long undifferentiated page
  const [section, setSection] = useState<'pool' | 'wordle' | 'rhyme' | 'quiz'>('pool');
  const [promptsOnly, setPromptsOnly] = useState(false);
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
      if (promptsOnly) params.set('prompts', 'true');
      const res = await api<{ total: number; words: Word[] }>(`/admin/dictionary?${params}`);
      setWords(res.words);
      setTotal(res.total);
      setStats(await api<Stats>('/admin/dictionary/stats'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load the word pool');
    } finally {
      setLoading(false);
    }
  }, [q, length, page, promptsOnly]);

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

  async function setPrompt(w: Word, isRhymePrompt: boolean): Promise<void> {
    setBusy(w.id);
    try {
      await api(`/admin/dictionary/${w.id}`, { method: 'PATCH', body: { isRhymePrompt } });
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

      <div className="tabs">
        {([
          ['pool', 'Word pool'],
          ['wordle', 'Wordle'],
          ['rhyme', 'Rhyme'],
          ['quiz', 'Quiz'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            className={`tab${section === key ? ' active' : ''}`}
            onClick={() => setSection(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className="card empty">{error}</div>}

      {section === 'wordle' && stats && <Coverage stats={stats} />}
      {section === 'rhyme' && stats && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-title">Rhyme prompts</div>
          <div className="subtle">
            Rounds draw their prompt only from words marked as prompts. While none are marked they fall back
            to the whole pool — which can pick a word with no rhyming partner, making the round unplayable.
            Use the checker below, then mark the good ones in the Word pool tab.
          </div>
          <div style={{ marginTop: 10 }}>
            <span className={`badge${stats.rhymePrompts === 0 ? ' mid' : ''}`}>{stats.rhymePrompts} curated</span>
          </div>
        </div>
      )}
      {section === 'rhyme' && <RhymeEditor />}
      {section === 'quiz' && <QuizQuestions />}
      {section === 'pool' && <AddWords onAdded={load} />}

      {section === 'pool' && (
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
          <label className="row" style={{ gap: 6, width: 'auto' }}>
            <input
              type="checkbox"
              checked={promptsOnly}
              onChange={(e) => {
                setPromptsOnly(e.target.checked);
                setPage(0);
              }}
            />
            <span className="subtle">Prompts only</span>
          </label>
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
                  <th>Rhyme prompt</th>
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
                      <label className="row" style={{ gap: 6, width: 'auto' }}>
                        <input
                          type="checkbox"
                          checked={w.isRhymePrompt}
                          disabled={busy === w.id}
                          onChange={(e) => void setPrompt(w, e.target.checked)}
                        />
                        <span className="subtle">use</span>
                      </label>
                    </td>
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
      )}
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
