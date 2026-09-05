import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';

interface RaceText {
  id: string;
  title: string;
  body: string;
  language: string;
  difficulty: number;
  active: boolean;
}

const BLANK = { title: '', body: '', language: 'kmr', difficulty: 1, active: true };

const LENGTH_LABEL: Record<number, string> = { 1: 'Short', 2: 'Medium', 3: 'Long' };

/** Roughly what a racer will see, before they see it. */
function stats(body: string): { chars: number; words: number } {
  const trimmed = body.trim();
  return {
    chars: [...trimmed].length,
    words: trimmed ? trimmed.split(/\s+/).length : 0,
  };
}

/**
 * The texts a typing race draws from.
 *
 * A race picks one at random from the active texts of the chosen length, so an
 * edit here changes the next race. Retiring with the Active switch takes a text
 * out of play while keeping it — preferable to deleting one you may want back.
 */
export function RaceTexts(): React.JSX.Element {
  const [texts, setTexts] = useState<RaceText[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RaceText | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ texts: RaceText[] }>('/admin/race/texts');
      setTexts(res.texts);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load race texts');
      setTexts([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(t: RaceText): Promise<void> {
    if (!confirm(`Delete “${t.title}”?\n\nRetiring it with Active instead keeps it for later.`)) return;
    try {
      await api(`/admin/race/texts/${t.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed');
    }
  }

  const active = (texts ?? []).filter((t) => t.active).length;
  // a length with nothing active cannot be raced, and that is worth seeing
  const byLength = [1, 2, 3].map((d) => ({
    difficulty: d,
    count: (texts ?? []).filter((t) => t.active && t.difficulty === d).length,
  }));

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div className="section-title" style={{ margin: 0 }}>
          Race texts {texts && <span className="subtle">({active} active of {texts.length})</span>}
        </div>
        <div className="spacer" />
        <button onClick={() => { setEditing(null); setCreating(true); }}>New text</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="subtle" style={{ marginBottom: 10 }}>
          A race picks one active text at random from the length the player chose. A length with none active
          cannot be played — the game reports that no texts are available.
        </div>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          {byLength.map((b) => (
            <span key={b.difficulty} className={`badge${b.count === 0 ? ' danger' : ' ok'}`}>
              {LENGTH_LABEL[b.difficulty]}: {b.count}
            </span>
          ))}
        </div>
      </div>

      {error && <div className="card empty">{error}</div>}

      {(creating || editing) && (
        <TextForm
          text={editing}
          onDone={async () => {
            setEditing(null);
            setCreating(false);
            await load();
          }}
          onCancel={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}

      {texts === null ? (
        <div className="card empty">Loading…</div>
      ) : texts.length === 0 ? (
        <div className="card empty">No race texts yet. Add one to make the game playable.</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Length</th>
                  <th>Size</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {texts.map((t) => {
                  const s = stats(t.body);
                  return (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.title}</strong>
                        {!t.active && <span className="badge mid" style={{ marginLeft: 8 }}>retired</span>}
                        <div className="subtle">{t.body.slice(0, 90)}{t.body.length > 90 ? '…' : ''}</div>
                      </td>
                      <td>
                        <span className="badge">{LENGTH_LABEL[t.difficulty]}</span>
                      </td>
                      <td className="subtle">
                        {s.words} words · {s.chars} chars
                      </td>
                      <td>
                        <button onClick={() => { setCreating(false); setEditing(t); }}>Edit</button>
                        <button className="danger" onClick={() => void remove(t)}>Delete</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function TextForm({
  text,
  onDone,
  onCancel,
}: {
  text: RaceText | null;
  onDone: () => Promise<void>;
  onCancel: () => void;
}): React.JSX.Element {
  const [form, setForm] = useState(text ?? BLANK);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const s = stats(form.body);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    // the same bounds the database enforces, said before the request is sent
    if (s.chars < 20 || s.chars > 2000) {
      setMsg('A race text has to be between 20 and 2000 characters.');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const body = {
        title: form.title.trim(),
        body: form.body.trim(),
        language: form.language,
        difficulty: form.difficulty,
        active: form.active,
      };
      if (text) await api(`/admin/race/texts/${text.id}`, { method: 'PUT', body });
      else await api('/admin/race/texts', { method: 'POST', body });
      await onDone();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" style={{ marginBottom: 16 }} onSubmit={(e) => void submit(e)}>
      <div className="section-title" style={{ marginTop: 0 }}>{text ? 'Edit text' : 'New race text'}</div>
      <div className="subtle" style={{ marginBottom: 10 }}>
        This is exactly what a player types, character for character — punctuation and accents included.
      </div>

      <label style={{ display: 'block', marginBottom: 10 }}>
        Title <span className="subtle">(for you, not shown mid-race)</span>
        <input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Helbesta welat"
          required
        />
      </label>

      <label style={{ display: 'block' }}>
        Text
        <textarea
          rows={6}
          className="code-area"
          style={{ whiteSpace: 'pre-wrap' }}
          value={form.body}
          onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          placeholder="Ez ji welatê xwe hez dikim…"
          required
        />
      </label>
      <div className="subtle" style={{ marginTop: 4 }}>
        {s.words} words · {s.chars} characters {s.chars > 0 && (s.chars < 20 || s.chars > 2000) && '— must be 20–2000'}
      </div>

      <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
        <label style={{ width: 'auto' }}>
          Length
          <select
            value={form.difficulty}
            onChange={(e) => setForm((f) => ({ ...f, difficulty: Number(e.target.value) }))}
          >
            {[1, 2, 3].map((d) => (
              <option key={d} value={d}>
                {LENGTH_LABEL[d]}
              </option>
            ))}
          </select>
        </label>
        <label style={{ width: 'auto' }}>
          Language
          <select value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}>
            <option value="kmr">Kurmancî</option>
            <option value="ckb">Soranî</option>
          </select>
        </label>
        <label className="row" style={{ gap: 6, width: 'auto', alignSelf: 'flex-end' }}>
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
          />
          <span className="subtle">Active (in play)</span>
        </label>
      </div>

      {msg && <div className="error" style={{ marginTop: 10 }}>{msg}</div>}

      <div className="toolbar" style={{ marginTop: 12 }}>
        <div className="spacer" />
        <button type="button" onClick={onCancel}>Cancel</button>
        <button className="primary" type="submit" disabled={busy || !form.title.trim()}>
          {busy ? 'Saving…' : 'Save text'}
        </button>
      </div>
    </form>
  );
}
