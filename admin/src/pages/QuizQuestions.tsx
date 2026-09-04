import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';

type Category = 'vocabulary' | 'phrases';

interface Question {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  category: Category;
  level: number;
  active: boolean;
}

const BLANK = {
  prompt: '',
  options: ['', '', '', ''],
  correctIndex: 0,
  category: 'vocabulary' as Category,
  level: 1,
  active: true,
};

/**
 * The questions the 1v1 quiz asks.
 *
 * Every match draws from this set, so an edit changes the next game. Retiring a
 * question with the Active switch takes it out of play while keeping it here —
 * preferable to deleting one you might want back.
 */
export function QuizQuestions(): React.JSX.Element {
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Question | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ questions: Question[] }>('/admin/quiz/questions');
      setQuestions(res.questions);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load questions');
      setQuestions([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(q: Question): Promise<void> {
    if (!confirm(`Delete "${q.prompt}"?\n\nRetiring it with Active instead keeps it for later.`)) return;
    try {
      await api(`/admin/quiz/questions/${q.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed');
    }
  }

  const active = (questions ?? []).filter((q) => q.active).length;

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div className="section-title" style={{ margin: 0 }}>
          Quiz questions {questions && <span className="subtle">({active} active of {questions.length})</span>}
        </div>
        <div className="spacer" />
        <button onClick={() => { setEditing(null); setCreating(true); }}>New question</button>
      </div>

      {error && <div className="card empty">{error}</div>}

      {(creating || editing) && (
        <QuestionForm
          question={editing}
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

      {questions === null ? (
        <div className="card empty">Loading…</div>
      ) : questions.length === 0 ? (
        <div className="card empty">No questions yet. Add one to get the quiz going.</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Question</th>
                  <th>Answer</th>
                  <th>Category</th>
                  <th>Level</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {questions.map((q) => (
                  <tr key={q.id}>
                    <td>
                      <strong>{q.prompt}</strong>
                      {!q.active && <span className="badge mid" style={{ marginLeft: 8 }}>retired</span>}
                      <div className="subtle">{q.options.join(' · ')}</div>
                    </td>
                    <td>{q.options[q.correctIndex]}</td>
                    <td className="subtle">{q.category}</td>
                    <td>
                      <span className="badge">{q.level}</span>
                    </td>
                    <td>
                      <button onClick={() => { setCreating(false); setEditing(q); }}>Edit</button>
                      <button className="danger" onClick={() => void remove(q)}>
                        Delete
                      </button>
                    </td>
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

function QuestionForm({
  question,
  onDone,
  onCancel,
}: {
  question: Question | null;
  onDone: () => Promise<void>;
  onCancel: () => void;
}): React.JSX.Element {
  const [form, setForm] = useState(question ?? BLANK);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function setOption(i: number, value: string): void {
    setForm((f) => ({ ...f, options: f.options.map((o, j) => (j === i ? value : o)) }));
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (form.options.some((o) => !o.trim())) {
      setMsg('All four answers are required — a game always shows four.');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const body = {
        prompt: form.prompt.trim(),
        options: form.options.map((o) => o.trim()),
        correctIndex: form.correctIndex,
        category: form.category,
        level: form.level,
        active: form.active,
      };
      if (question) await api(`/admin/quiz/questions/${question.id}`, { method: 'PUT', body });
      else await api('/admin/quiz/questions', { method: 'POST', body });
      await onDone();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" style={{ marginBottom: 16 }} onSubmit={(e) => void submit(e)}>
      <div className="section-title">{question ? 'Edit question' : 'New question'}</div>
      <div className="subtle" style={{ marginBottom: 10 }}>
        Pick which answer is correct with the radio button beside it.
      </div>

      <label style={{ display: 'block', marginBottom: 10 }}>
        Question
        <input
          value={form.prompt}
          onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
          placeholder={'"Av" bi îngilîzî çi ye?'}
          required
        />
      </label>

      {form.options.map((o, i) => (
        <label key={i} className="row" style={{ gap: 8, marginBottom: 8 }}>
          <input
            type="radio"
            name="correct"
            checked={form.correctIndex === i}
            onChange={() => setForm((f) => ({ ...f, correctIndex: i }))}
            style={{ width: 'auto' }}
            aria-label={`Answer ${i + 1} is correct`}
          />
          <input value={o} onChange={(e) => setOption(i, e.target.value)} placeholder={`Answer ${i + 1}`} required />
        </label>
      ))}

      <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
        <label style={{ width: 'auto' }}>
          Category
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as Category }))}
          >
            <option value="vocabulary">vocabulary</option>
            <option value="phrases">phrases</option>
          </select>
        </label>
        <label style={{ width: 'auto' }}>
          Level
          <select value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: Number(e.target.value) }))}>
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
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

      {msg && <div className="subtle" style={{ marginTop: 10 }}>{msg}</div>}

      <div className="toolbar" style={{ marginTop: 12 }}>
        <div className="spacer" />
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary" type="submit" disabled={busy || !form.prompt.trim()}>
          {busy ? 'Saving…' : 'Save question'}
        </button>
      </div>
    </form>
  );
}
