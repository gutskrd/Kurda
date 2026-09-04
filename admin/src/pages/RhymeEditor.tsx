import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';

type Verdict = 'perfect' | 'near' | 'none' | 'auto';

interface RhymeReport {
  word: string;
  dialect: string;
  perfect: string[];
  near: string[];
  inDictionary: boolean;
  overrides: Record<string, Verdict>;
  candidates: string[];
}

/**
 * Decide, word by word, what rhymes with a prompt.
 *
 * By default the game works rhymes out from word endings. That is right most of
 * the time but can't know about dialect quirks or borrowed words, so each pair can
 * be overridden here: force one in, or rule one out. "Auto" hands the pair back to
 * the derived answer — it is not the same as "doesn't rhyme".
 */
export function RhymeEditor(): React.JSX.Element {
  const [word, setWord] = useState('');
  const [dialect, setDialect] = useState('kurmanci');
  const [report, setReport] = useState<RhymeReport | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyDecided, setOnlyDecided] = useState(false);
  /** the word currently open, so a dialect change can reload it */
  const [openWord, setOpenWord] = useState<string | null>(null);

  const load = useCallback(
    async (target: string) => {
      if (!target.trim()) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ word: target.trim(), dialect });
        setReport(await api<RhymeReport>(`/admin/dictionary/rhymes?${params}`));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load rhymes');
      } finally {
        setLoading(false);
      }
    },
    [dialect],
  );

  // `load` changes with the dialect, so this also reloads when that changes —
  // which keeps the derived column honest.
  useEffect(() => {
    if (openWord) void load(openWord);
  }, [openWord, load]);

  async function decide(rhyme: string, quality: Verdict): Promise<void> {
    if (!report) return;
    setBusy(rhyme);
    try {
      await api('/admin/dictionary/rhymes', { method: 'PUT', body: { word: report.word, rhyme, quality } });
      await load(report.word);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed');
    } finally {
      setBusy(null);
    }
  }

  /** What the endings say, before any decision. */
  function derived(w: string): Verdict {
    if (report?.perfect.includes(w)) return 'perfect';
    if (report?.near.includes(w)) return 'near';
    return 'none';
  }

  const rows = (report?.candidates ?? []).filter((w) => {
    if (!onlyDecided) return true;
    return report?.overrides[normalize(w)] !== undefined;
  });

  return (
    <div>
      <form
        className="card"
        style={{ marginBottom: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          setOpenWord(word.trim());
        }}
      >
        <div className="section-title">Choose a prompt word</div>
        <div className="subtle" style={{ marginBottom: 10 }}>
          Pick the word players will be given, then decide what counts as a rhyme for it. The game works
          rhymes out from word endings on its own — your decisions override that, in both directions.
        </div>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <input placeholder="e.g. gul" value={word} onChange={(e) => setWord(e.target.value)} />
          <select value={dialect} onChange={(e) => setDialect(e.target.value)} style={{ width: 'auto' }}>
            <option value="kurmanci">Kurmancî</option>
            <option value="sorani">Soranî</option>
          </select>
          <button className="primary" type="submit" disabled={loading || !word.trim()}>
            {loading ? 'Loading…' : 'Open'}
          </button>
        </div>
        {error && <div className="subtle" style={{ marginTop: 10 }}>{error}</div>}
      </form>

      {report && (
        <div className="card" style={{ padding: 0 }}>
          <div className="toolbar" style={{ margin: '14px 16px 8px' }}>
            <div className="section-title">
              Rhymes for “{report.word}”
              {!report.inDictionary && <span className="badge mid" style={{ marginLeft: 8 }}>not in the pool</span>}
            </div>
            <div className="spacer" />
            <label className="row" style={{ gap: 6, width: 'auto' }}>
              <input type="checkbox" checked={onlyDecided} onChange={(e) => setOnlyDecided(e.target.checked)} />
              <span className="subtle">Decided only</span>
            </label>
          </div>

          {rows.length === 0 ? (
            <div className="empty">{onlyDecided ? 'Nothing decided yet.' : 'No other words in the pool.'}</div>
          ) : (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Word</th>
                    <th>By word ending</th>
                    <th>Your decision</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((w) => {
                    const key = normalize(w);
                    const chosen = report.overrides[key] ?? 'auto';
                    const auto = derived(w);
                    return (
                      <tr key={w}>
                        <td>
                          <strong>{w}</strong>
                        </td>
                        <td className="subtle">
                          {auto === 'none' ? 'no rhyme' : auto === 'perfect' ? 'perfect' : 'near'}
                        </td>
                        <td>
                          <select
                            value={chosen}
                            disabled={busy === w}
                            onChange={(e) => void decide(w, e.target.value as Verdict)}
                            style={{ width: 'auto' }}
                          >
                            <option value="auto">Auto ({auto === 'none' ? 'no rhyme' : auto})</option>
                            <option value="perfect">Rhymes — perfect</option>
                            <option value="near">Rhymes — near</option>
                            <option value="none">Does not rhyme</option>
                          </select>
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
    </div>
  );
}

/** Mirrors the server's normalizer closely enough to key the overrides map. */
function normalize(word: string): string {
  return word.toLowerCase().normalize('NFC').replace(/[^\p{L}]/gu, '');
}
