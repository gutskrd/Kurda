import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';

type Verdict = 'perfect' | 'near' | 'none' | 'auto';
type Quality = 'perfect' | 'near' | 'none';

/** A word a round can open with, and how much it has to rhyme against. */
interface PromptWord {
  id: string;
  headword: string;
  dialect: string;
  isRhymePrompt: boolean;
  perfect: number;
  near: number;
  /** words you ruled out that the endings would have accepted */
  ruledOut: number;
  /** how many pairs you have decided by hand */
  decided: number;
}

interface PromptList {
  total: number;
  poolSize: number;
  /** nothing is curated, so rounds are drawing from the whole pool */
  usingFallback: boolean;
  words: PromptWord[];
}

interface RhymeRow {
  word: string;
  quality: Quality;
  /** what the word endings say, before any decision */
  derived: Quality;
  source: 'derived' | 'decided';
}

interface RhymeView {
  word: string;
  dialect: string;
  inDictionary: boolean;
  rhymes: RhymeRow[];
  ruledOut: RhymeRow[];
  candidates: string[];
}

const PAGE = 25;

const STRENGTH: Record<Quality, string> = {
  perfect: 'Perfect',
  near: 'Near',
  none: 'Not a rhyme',
};

/**
 * The rhyme game's content, end to end.
 *
 * Left: every word a round can open with — the base words. Right: for the one
 * you pick, everything that rhymes with it and how strongly, where each verdict
 * came from, and the words you ruled out.
 *
 * The game derives rhymes from word endings; a decision here overrides that in
 * either direction. "Auto" is not the same as "not a rhyme" — it means no
 * opinion, use whatever the endings say.
 */
export function RhymeEditor(): React.JSX.Element {
  const [dialect, setDialect] = useState('kurmanci');
  const [list, setList] = useState<PromptList | null>(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams({
        dialect,
        limit: String(PAGE),
        offset: String(page * PAGE),
      });
      if (q.trim()) params.set('q', q.trim());
      setList(await api<PromptList>(`/admin/rhyme/prompts?${params}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load base words');
    }
  }, [dialect, page, q]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  async function addBaseWord(word: string): Promise<void> {
    setBusy('add');
    try {
      await api('/admin/dictionary', { method: 'POST', body: { words: [word], isRhymePrompt: true } });
      await loadList();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed');
    } finally {
      setBusy(null);
    }
  }

  async function rename(w: PromptWord): Promise<void> {
    const next = prompt(`Rename “${w.headword}” to:`, w.headword);
    if (!next || next.trim() === w.headword) return;
    setBusy(w.id);
    try {
      await api(`/admin/dictionary/${w.id}`, { method: 'PATCH', body: { headword: next.trim() } });
      if (open === w.headword) setOpen(next.trim());
      await loadList();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed');
    } finally {
      setBusy(null);
    }
  }

  async function stopUsing(w: PromptWord): Promise<void> {
    setBusy(w.id);
    try {
      await api(`/admin/dictionary/${w.id}`, { method: 'PATCH', body: { isRhymePrompt: false } });
      if (open === w.headword) setOpen(null);
      await loadList();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed');
    } finally {
      setBusy(null);
    }
  }

  async function removeFromPool(w: PromptWord): Promise<void> {
    const ok = confirm(
      `Delete “${w.headword}” from the word pool?\n\n` +
        'It stops appearing in Wordle and Rhyme, guesses of it are no longer accepted, ' +
        'and every rhyme decision involving it is discarded.\n\n' +
        'To stop it opening rounds while keeping the word, use “Stop using” instead.',
    );
    if (!ok) return;
    setBusy(w.id);
    try {
      await api(`/admin/dictionary/${w.id}`, { method: 'DELETE' });
      if (open === w.headword) setOpen(null);
      await loadList();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed');
    } finally {
      setBusy(null);
    }
  }

  const pages = Math.max(1, Math.ceil((list?.total ?? 0) / PAGE));

  return (
    <div>
      <AddBaseWord onAdd={addBaseWord} busy={busy === 'add'} />

      {error && <div className="card empty">{error}</div>}

      {list?.usingFallback && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-title" style={{ marginTop: 0 }}>
            No base words chosen yet
          </div>
          <div className="subtle">
            While nothing is marked, a round can open with <strong>any</strong> of the {list.poolSize} words in
            the pool — including ones with nothing to rhyme against, which makes the round unplayable. The list
            below is therefore the whole pool. Add or mark a few words to take control of it.
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, marginBottom: 16 }}>
        <div className="toolbar" style={{ margin: '14px 16px 8px' }}>
          <div className="section-title" style={{ margin: 0 }}>
            Base words{' '}
            {list && <span className="subtle">({list.total} of {list.poolSize} pool words)</span>}
          </div>
          <div className="spacer" />
          <input
            placeholder="Search base words…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
          />
          <select
            value={dialect}
            onChange={(e) => {
              setDialect(e.target.value);
              setOpen(null);
            }}
            style={{ width: 'auto' }}
          >
            <option value="kurmanci">Kurmancî</option>
            <option value="sorani">Soranî</option>
          </select>
        </div>

        {list === null ? (
          <div className="empty">Loading…</div>
        ) : list.words.length === 0 ? (
          <div className="empty">No base words match.</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Word</th>
                  <th>Rhymes available</th>
                  <th>Your decisions</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.words.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <button
                        type="button"
                        className="ghost"
                        style={{ padding: 0, fontWeight: 600 }}
                        onClick={() => setOpen(open === w.headword ? null : w.headword)}
                      >
                        {w.headword}
                      </button>
                      {!w.isRhymePrompt && (
                        <span className="badge mid" style={{ marginLeft: 8 }}>
                          not marked
                        </span>
                      )}
                    </td>
                    <td>
                      {w.perfect + w.near === 0 ? (
                        <span className="badge danger" title="a round on this word would be unplayable">
                          none
                        </span>
                      ) : (
                        <>
                          <span className="badge ok">{w.perfect} perfect</span>{' '}
                          <span className="badge">{w.near} near</span>
                        </>
                      )}
                    </td>
                    <td className="subtle">
                      {w.decided === 0 ? '—' : `${w.decided} decided`}
                      {w.ruledOut > 0 && `, ${w.ruledOut} ruled out`}
                    </td>
                    <td>
                      <button onClick={() => setOpen(open === w.headword ? null : w.headword)}>
                        {open === w.headword ? 'Close' : 'Rhymes'}
                      </button>
                      <button disabled={busy === w.id} onClick={() => void rename(w)}>
                        Rename
                      </button>
                      {w.isRhymePrompt && (
                        <button disabled={busy === w.id} onClick={() => void stopUsing(w)} title="keep the word, stop opening rounds with it">
                          Stop using
                        </button>
                      )}
                      <button className="danger" disabled={busy === w.id} onClick={() => void removeFromPool(w)}>
                        Delete
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

      {open && <RhymePanel word={open} dialect={dialect} onChanged={loadList} />}
    </div>
  );
}

/** Add a word and start using it as a base word, in one step. */
function AddBaseWord({ onAdd, busy }: { onAdd: (word: string) => Promise<void>; busy: boolean }): React.JSX.Element {
  const [word, setWord] = useState('');
  return (
    <form
      className="card"
      style={{ marginBottom: 16 }}
      onSubmit={(e) => {
        e.preventDefault();
        const w = word.trim();
        if (!w) return;
        setWord('');
        void onAdd(w);
      }}
    >
      <div className="section-title" style={{ marginTop: 0 }}>
        Add a base word
      </div>
      <div className="subtle" style={{ marginBottom: 10 }}>
        The word joins the shared pool and starts opening rhyme rounds. A word already in the pool is promoted
        rather than duplicated.
      </div>
      <div className="row" style={{ gap: 10 }}>
        <input placeholder="e.g. berxwedan" value={word} onChange={(e) => setWord(e.target.value)} />
        <button className="primary" type="submit" disabled={busy || !word.trim()}>
          {busy ? 'Adding…' : 'Add'}
        </button>
      </div>
    </form>
  );
}

/** Everything that rhymes with one base word, and how strongly. */
function RhymePanel({
  word,
  dialect,
  onChanged,
}: {
  word: string;
  dialect: string;
  onChanged: () => Promise<void>;
}): React.JSX.Element {
  const [view, setView] = useState<RhymeView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams({ word, dialect });
      setView(await api<RhymeView>(`/admin/dictionary/rhymes?${params}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load rhymes');
    }
  }, [word, dialect]);

  useEffect(() => {
    setView(null);
    void load();
  }, [load]);

  async function decide(rhyme: string, quality: Verdict, addToPool = false): Promise<void> {
    setBusy(rhyme);
    try {
      await api('/admin/dictionary/rhymes', {
        method: 'PUT',
        body: { word, rhyme, quality, addToPool, dialect: dialect === 'sorani' ? 'sorani' : 'kurmanji' },
      });
      await load();
      await onChanged(); // the base-word list shows counts, so it moves too
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="toolbar" style={{ margin: '14px 16px 8px' }}>
        <div className="section-title" style={{ margin: 0 }}>
          Rhymes for “{word}”
          {view && !view.inDictionary && (
            <span className="badge mid" style={{ marginLeft: 8 }}>
              not in the pool
            </span>
          )}
        </div>
        <div className="spacer" />
        {view && (
          <span className="subtle">
            {view.rhymes.length} accepted
            {view.ruledOut.length > 0 && ` · ${view.ruledOut.length} ruled out`}
          </span>
        )}
      </div>

      {error && <div className="empty">{error}</div>}

      <div style={{ padding: '0 16px 14px' }}>
        <AddRhyme
          onAdd={(w, quality) => decide(w, quality, true)}
          known={new Set((view?.rhymes ?? []).map((r) => r.word.toLowerCase()))}
        />
      </div>

      {view === null ? (
        <div className="empty">Loading…</div>
      ) : view.rhymes.length === 0 ? (
        <div className="empty">
          Nothing rhymes with this word yet — a round on it would be unplayable. Add a rhyme above.
        </div>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Rhyme</th>
                <th>Strength</th>
                <th>Where it came from</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {view.rhymes.map((r) => (
                <tr key={r.word}>
                  <td>
                    <strong>{r.word}</strong>
                  </td>
                  <td>
                    <span className={`badge${r.quality === 'perfect' ? ' ok' : ''}`}>{STRENGTH[r.quality]}</span>
                  </td>
                  <td className="subtle">
                    {r.source === 'decided'
                      ? `Your decision (endings say ${STRENGTH[r.derived].toLowerCase()})`
                      : 'Word endings'}
                  </td>
                  <td>
                    <QualitySelect
                      value={r.source === 'decided' ? r.quality : 'auto'}
                      derived={r.derived}
                      disabled={busy === r.word}
                      onChange={(v) => void decide(r.word, v)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view && view.ruledOut.length > 0 && (
        <>
          <div className="section-title" style={{ margin: '18px 16px 8px' }}>
            Ruled out
          </div>
          <div className="subtle" style={{ margin: '0 16px 8px' }}>
            The endings accept these; you decided they do not rhyme. The game rejects them.
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Word</th>
                  <th>Endings say</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {view.ruledOut.map((r) => (
                  <tr key={r.word}>
                    <td>
                      <strong>{r.word}</strong>
                    </td>
                    <td className="subtle">{STRENGTH[r.derived]}</td>
                    <td>
                      <QualitySelect
                        value="none"
                        derived={r.derived}
                        disabled={busy === r.word}
                        onChange={(v) => void decide(r.word, v)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/** Auto / perfect / near / not a rhyme, with what "auto" currently resolves to. */
function QualitySelect({
  value,
  derived,
  disabled,
  onChange,
}: {
  value: Verdict;
  derived: Quality;
  disabled: boolean;
  onChange: (next: Verdict) => void;
}): React.JSX.Element {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Verdict)}
      style={{ width: 'auto' }}
    >
      <option value="auto">Auto — {STRENGTH[derived].toLowerCase()}</option>
      <option value="perfect">Perfect</option>
      <option value="near">Near</option>
      <option value="none">Not a rhyme</option>
    </select>
  );
}

/** Type any word to accept it as a rhyme; it joins the pool if it is new. */
function AddRhyme({
  onAdd,
  known,
}: {
  onAdd: (word: string, quality: Verdict) => Promise<void>;
  known: Set<string>;
}): React.JSX.Element {
  const [word, setWord] = useState('');
  const [quality, setQuality] = useState<Verdict>('perfect');
  const [busy, setBusy] = useState(false);
  const already = known.has(word.trim().toLowerCase());

  return (
    <form
      className="row"
      style={{ gap: 10, flexWrap: 'wrap' }}
      onSubmit={(e) => {
        e.preventDefault();
        const w = word.trim();
        if (!w || already) return;
        setBusy(true);
        void onAdd(w, quality).finally(() => {
          setBusy(false);
          setWord('');
        });
      }}
    >
      <input placeholder="Add a rhyme…" value={word} onChange={(e) => setWord(e.target.value)} />
      <select value={quality} onChange={(e) => setQuality(e.target.value as Verdict)} style={{ width: 'auto' }}>
        <option value="perfect">Perfect</option>
        <option value="near">Near</option>
      </select>
      <button className="primary" type="submit" disabled={busy || !word.trim() || already}>
        {busy ? 'Adding…' : 'Add rhyme'}
      </button>
      {already && <span className="subtle">Already a rhyme for this word.</span>}
    </form>
  );
}
