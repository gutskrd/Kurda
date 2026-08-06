import { useState } from 'react';
import { api, ApiError } from '../api';

type ContentStatus = 'draft' | 'in_review' | 'published' | 'archived';
const EXERCISE_TYPES = ['multiple_choice', 'translate', 'match_pairs', 'listening', 'speaking', 'writing'] as const;
type ExerciseType = (typeof EXERCISE_TYPES)[number];

interface ExerciseRow {
  position: number;
  type: ExerciseType;
  payload: unknown;
}
interface LessonDetail {
  id: string;
  skillId: string;
  position: number;
  version: number;
  status: ContentStatus;
  titleKu: string;
  titleEn: string;
  lockVersion: number;
  exercises: ExerciseRow[];
}

const STATUS_CLS: Record<ContentStatus, string> = {
  draft: 'mid',
  in_review: '',
  published: 'ok',
  archived: 'hi',
};

/** Content management: draft → review → publish, optimistic-locked (KUR-100). 2FA-gated. */
export function Content(): React.JSX.Element {
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [needs2fa, setNeeds2fa] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleErr(err: unknown): void {
    if (err instanceof ApiError && err.status === 403) {
      if (err.code === 'TOTP_REQUIRED') setNeeds2fa(true);
      else setForbidden(true);
      return;
    }
    setError(err instanceof ApiError ? err.message : 'Something went wrong');
  }

  async function openLesson(id: string): Promise<void> {
    setError(null);
    try {
      setLesson(await api<LessonDetail>(`/admin/content/lessons/${id}`));
    } catch (err) {
      handleErr(err);
    }
  }

  if (needs2fa) {
    return (
      <Frame>
        <div className="card" style={{ maxWidth: 520 }}>
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            <span className="badge mid">2FA required</span>
          </div>
          <div className="subtle">
            Content management needs a confirmed authenticator. Open <a href="#/security">Security</a> to set up 2FA.
          </div>
        </div>
      </Frame>
    );
  }
  if (forbidden) {
    return (
      <Frame>
        <div className="card" style={{ maxWidth: 520 }}>
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            <span className="badge hi">No content access</span>
          </div>
          <div className="subtle">You need the content_editor or superadmin role to manage lessons.</div>
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="row" style={{ gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 16 }}>
        <OpenForm onOpen={openLesson} />
        <CreateForm onCreated={(l) => setLesson(l)} onError={handleErr} />
      </div>
      {lesson && <Editor lesson={lesson} onReload={() => openLesson(lesson.id)} onLoad={setLesson} onError={handleErr} />}
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div>
      <div className="toolbar">
        <div>
          <h1>Content</h1>
          <div className="subtle">Lessons &amp; exercises — draft, review, publish</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function OpenForm({ onOpen }: { onOpen: (id: string) => void }): React.JSX.Element {
  const [id, setId] = useState('');
  return (
    <form
      className="card"
      style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 280 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (id.trim()) onOpen(id.trim());
      }}
    >
      <div className="section-title" style={{ marginTop: 0 }}>
        Open a lesson
      </div>
      <input value={id} onChange={(e) => setId(e.target.value)} placeholder="lesson id (uuid)" required />
      <button className="primary" type="submit" style={{ alignSelf: 'flex-start' }}>
        Open
      </button>
    </form>
  );
}

function CreateForm({
  onCreated,
  onError,
}: {
  onCreated: (lesson: LessonDetail) => void;
  onError: (err: unknown) => void;
}): React.JSX.Element {
  const [skillId, setSkillId] = useState('');
  const [position, setPosition] = useState('1');
  const [titleKu, setTitleKu] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    try {
      const { lessonId } = await api<{ lessonId: string }>('/admin/content/lessons', {
        method: 'POST',
        body: { skillId: skillId.trim(), position: Number(position), titleKu: titleKu.trim(), titleEn: titleEn.trim() },
      });
      onCreated(await api<LessonDetail>(`/admin/content/lessons/${lessonId}`));
      setTitleKu('');
      setTitleEn('');
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 320, flex: 1 }} onSubmit={submit}>
      <div className="section-title" style={{ marginTop: 0 }}>
        Create a draft lesson
      </div>
      <input value={skillId} onChange={(e) => setSkillId(e.target.value)} placeholder="skill id (uuid)" required />
      <div className="row" style={{ gap: 8 }}>
        <input value={position} onChange={(e) => setPosition(e.target.value)} inputMode="numeric" placeholder="position" style={{ width: 110 }} required />
        <input value={titleKu} onChange={(e) => setTitleKu(e.target.value)} placeholder="Title (Kurdî)" required />
      </div>
      <input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} placeholder="Title (English)" required />
      <button className="primary" type="submit" disabled={busy} style={{ alignSelf: 'flex-start' }}>
        {busy ? 'Creating…' : 'Create draft'}
      </button>
    </form>
  );
}

function Editor({
  lesson,
  onReload,
  onLoad,
  onError,
}: {
  lesson: LessonDetail;
  onReload: () => void;
  onLoad: (l: LessonDetail) => void;
  onError: (err: unknown) => void;
}): React.JSX.Element {
  const editable = lesson.status === 'draft';
  const [titleKu, setTitleKu] = useState(lesson.titleKu);
  const [titleEn, setTitleEn] = useState(lesson.titleEn);
  // exercises edited as raw JSON text so any payload shape is authorable
  const [exText, setExText] = useState(() => JSON.stringify(lesson.exercises, null, 2));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // re-sync the editor only when a different lesson loads (not on our own
  // save, which bumps lockVersion but must keep the success message + edits)
  const [seenId, setSeenId] = useState(lesson.id);
  if (seenId !== lesson.id) {
    setSeenId(lesson.id);
    setTitleKu(lesson.titleKu);
    setTitleEn(lesson.titleEn);
    setExText(JSON.stringify(lesson.exercises, null, 2));
    setMsg(null);
  }

  async function save(): Promise<void> {
    let exercises: unknown;
    try {
      exercises = JSON.parse(exText);
    } catch {
      setMsg('❌ Exercises must be valid JSON.');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await api<{ ok: true; lockVersion: number }>(`/admin/content/lessons/${lesson.id}`, {
        method: 'PUT',
        body: { titleKu: titleKu.trim(), titleEn: titleEn.trim(), lockVersion: lesson.lockVersion, exercises },
      });
      setMsg(`✅ Saved (lock version ${res.lockVersion}).`);
      onReload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setMsg('❌ This lesson changed since you loaded it — reload and retry.');
      } else if (err instanceof ApiError && err.status === 422) {
        setMsg(`❌ Invalid exercises: ${err.message}`);
      } else if (err instanceof ApiError && err.status !== 403) {
        setMsg(`❌ ${err.message}`);
      } else {
        onError(err);
      }
    } finally {
      setBusy(false);
    }
  }

  async function transition(verb: 'submit' | 'approve' | 'reject'): Promise<void> {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/admin/content/lessons/${lesson.id}/${verb}`, { method: 'POST' });
      setMsg(`✅ ${verb} done.`);
      onReload();
    } catch (err) {
      if (err instanceof ApiError && err.status !== 403) setMsg(`❌ ${err.message}`);
      else onError(err);
    } finally {
      setBusy(false);
    }
  }

  async function newVersion(): Promise<void> {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api<{ lessonId: string }>(`/admin/content/lessons/${lesson.id}/new-version`, { method: 'POST' });
      const draft = await api<LessonDetail>(`/admin/content/lessons/${res.lessonId}`);
      onLoad(draft);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 403) setMsg(`❌ ${err.message}`);
      else onError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 16 }}>Lesson editor</h1>
        <span className={`badge ${STATUS_CLS[lesson.status]}`}>{lesson.status}</span>
        <span className="badge">v{lesson.version}</span>
        <span className="subtle">pos {lesson.position}</span>
        <span className="spacer" />
        <code className="subtle" title={lesson.id}>{lesson.id.slice(0, 8)}</code>
      </div>

      {!editable && (
        <div className="subtle">
          This lesson is <strong>{lesson.status}</strong> and read-only.{' '}
          {lesson.status === 'published' && 'Use “New version” to start an editable draft clone.'}
        </div>
      )}

      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <label style={{ flex: 1, minWidth: 200 }}>
          Title (Kurdî)
          <input value={titleKu} onChange={(e) => setTitleKu(e.target.value)} disabled={!editable} />
        </label>
        <label style={{ flex: 1, minWidth: 200 }}>
          Title (English)
          <input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} disabled={!editable} />
        </label>
      </div>

      <label>
        Exercises (JSON array of {'{ position, type, payload }'})
        <textarea
          value={exText}
          onChange={(e) => setExText(e.target.value)}
          disabled={!editable}
          spellCheck={false}
          className="code-area"
          rows={14}
        />
      </label>
      <div className="subtle" style={{ fontSize: 12 }}>
        Allowed types: {EXERCISE_TYPES.join(', ')}
      </div>

      {msg && <div className={msg.startsWith('❌') ? 'error' : 'subtle'}>{msg}</div>}

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {editable && (
          <>
            <button className="primary" onClick={() => void save()} disabled={busy}>
              {busy ? 'Saving…' : 'Save draft'}
            </button>
            <button onClick={() => void transition('submit')} disabled={busy}>
              Submit for review
            </button>
          </>
        )}
        {lesson.status === 'in_review' && (
          <>
            <button className="primary" onClick={() => void transition('approve')} disabled={busy}>
              Approve &amp; publish
            </button>
            <button className="danger" onClick={() => void transition('reject')} disabled={busy}>
              Reject to draft
            </button>
          </>
        )}
        {lesson.status === 'published' && (
          <button className="primary" onClick={() => void newVersion()} disabled={busy}>
            New version
          </button>
        )}
        <span className="spacer" />
        <button onClick={onReload} disabled={busy}>
          Reload
        </button>
      </div>
    </div>
  );
}
