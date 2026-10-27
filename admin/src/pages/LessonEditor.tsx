import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { go, setLeaveGuard } from '../nav';
import {
  EXERCISE_TYPES,
  STATUS_NAME,
  TYPE_NAME,
  blankPayload,
  exerciseIssues,
  forSave,
  issuesFor,
  parseExercisesJson,
  recordHref,
  sameDraft,
  type Exercise,
  type ExerciseType,
  type Issue,
  type LessonDetail,
} from '../lessons';
import {
  Badge,
  Banner,
  Button,
  EmptyState,
  ErrorState,
  FieldRow,
  Icon,
  Loading,
  PageHeader,
  Section,
  Tabs,
  TextInput,
  errorLine,
  useDialogs,
  useToast,
} from '../ui';
import { conversationHref } from '../conversations';
import { ExerciseCard } from './ExerciseEditor';
import { STATUS_TONE } from './Lessons';
import { LessonReadiness, QuickBuild } from './LessonTools';

interface Draft {
  titleKu: string;
  titleEn: string;
  exercises: Exercise[];
}

const draftOf = (l: LessonDetail): Draft => ({
  titleKu: l.titleKu,
  titleEn: l.titleEn,
  exercises: l.exercises.map((e) => ({ ...e, payload: { ...(e.payload as Record<string, unknown>) } })),
});

/**
 * One lesson: its titles and exercises, edited as forms (with the JSON behind
 * them one tab away, for what the forms do not cover), checked as the server
 * checks them, and moved draft → in review → published. A published lesson
 * cannot change; "Start a new version" makes an editable draft of it, and
 * learners keep the published one until that is approved.
 */
export function LessonEditor({ id }: { id: string }): React.JSX.Element {
  const toast = useToast();
  const dialogs = useDialogs();
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [json, setJson] = useState('');
  const [jsonProblem, setJsonProblem] = useState<string | null>(null);
  const [serverIssues, setServerIssues] = useState<Issue[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [showChecks, setShowChecks] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [newType, setNewType] = useState<ExerciseType>('translate');
  const [building, setBuilding] = useState(false);

  const load = async (): Promise<void> => {
    setLoadError(null);
    try {
      const l = await api<LessonDetail>(`/admin/content/lessons/${encodeURIComponent(id)}`);
      setLesson(l);
      setDraft(draftOf(l));
      setServerIssues([]);
      setShowChecks(false);
    } catch (err) {
      setLoadError(err);
    }
  };

  useEffect(() => {
    void load();
    // a new address is a new editor (Lessons keys it by id)
  }, []);

  const editable = lesson?.status === 'draft';
  const dirty = !!lesson && !!draft && editable && !sameDraft(draftOf(lesson), draft);

  // leaving with unsaved work asks first, in the admin's own dialog
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    setLeaveGuard(() =>
      dialogs.confirm({ title: 'Leave without saving?', body: 'Your changes to this lesson will be lost.', confirmLabel: 'Leave', cancelLabel: 'Stay', tone: 'danger' }),
    );
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      setLeaveGuard(null);
    };
  }, [dirty, dialogs]);

  const local = useMemo(() => (draft ? draft.exercises.map((e) => exerciseIssues(e)) : []), [draft]);
  const localCount = local.reduce((n, l) => n + l.length, 0) + (draft && !draft.titleKu.trim() ? 1 : 0) + (draft && !draft.titleEn.trim() ? 1 : 0);

  if (loadError) {
    return (
      <div>
        <PageHeader title="Lesson" back={{ href: '#/lessons', label: 'All lessons' }} />
        <ErrorState error={loadError} onRetry={() => void load()} what="lessons" />
      </div>
    );
  }
  if (!lesson || !draft) {
    return (
      <div>
        <PageHeader title="Lesson" back={{ href: '#/lessons', label: 'All lessons' }} />
        <Loading rows={5} />
      </div>
    );
  }

  const update = (patch: Partial<Draft>): void => {
    setDraft({ ...draft, ...patch });
    setServerIssues([]);
  };
  const setExercise = (i: number, next: Exercise): void => update({ exercises: draft.exercises.map((e, j) => (j === i ? next : e)) });
  const move = (i: number, by: -1 | 1): void => {
    const list = [...draft.exercises];
    const [it] = list.splice(i, 1);
    list.splice(i + by, 0, it!);
    update({ exercises: list });
  };
  const remove = async (i: number): Promise<void> => {
    const yes = await dialogs.confirm({
      title: `Remove exercise ${i + 1}?`,
      body: `${TYPE_NAME[draft.exercises[i]!.type]}. It goes when you save the draft; until then, Reload brings it back.`,
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (yes) update({ exercises: draft.exercises.filter((_, j) => j !== i) });
  };

  const switchMode = (next: 'form' | 'json'): void => {
    if (next === mode) return;
    if (next === 'json') {
      setJson(JSON.stringify(forSave(draft.exercises).map(({ type, payload }) => ({ type, payload })), null, 2));
      setJsonProblem(null);
      setMode('json');
      return;
    }
    const parsed = parseExercisesJson(json);
    if (!parsed.ok) {
      setJsonProblem(parsed.problem);
      return;
    }
    update({ exercises: parsed.exercises });
    setMode('form');
  };

  /** The draft as it would be sent, from the form or from the JSON. */
  const current = (): Exercise[] | null => {
    if (mode === 'form') return draft.exercises;
    const parsed = parseExercisesJson(json);
    if (!parsed.ok) {
      setJsonProblem(parsed.problem);
      return null;
    }
    return parsed.exercises;
  };

  async function save(): Promise<boolean> {
    const exercises = current();
    if (!exercises) return false;
    setShowChecks(true);
    if (mode === 'form' && localCount > 0) {
      toast.error('Not saved: some fields need fixing first. They are marked below.');
      return false;
    }
    setBusy('save');
    try {
      const res = await api<{ ok: true; lockVersion: number }>(`/admin/content/lessons/${lesson!.id}`, {
        method: 'PUT',
        body: { titleKu: draft!.titleKu.trim(), titleEn: draft!.titleEn.trim(), lockVersion: lesson!.lockVersion, exercises: forSave(exercises) },
      });
      const saved = { ...lesson!, titleKu: draft!.titleKu.trim(), titleEn: draft!.titleEn.trim(), lockVersion: res.lockVersion, exercises: forSave(exercises) };
      setLesson(saved);
      setDraft(draftOf(saved));
      setServerIssues([]);
      setShowChecks(false);
      toast.success('Draft saved.');
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && Array.isArray(err.body.issues)) {
        setServerIssues(err.body.issues as Issue[]);
        toast.error('Not saved: the server found problems. They are marked below.');
      } else if (err instanceof ApiError && err.status === 409 && err.code === 'CONFLICT') {
        toast.error('Not saved: someone changed this lesson since you opened it. Reload to see their version (your changes here will be lost), or copy your work first.');
      } else {
        toast.error(`Not saved: ${errorLine(err, 'lessons')}`);
      }
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function transition(verb: 'submit' | 'approve' | 'reject'): Promise<void> {
    if (verb === 'submit' && dirty && !(await save())) return;
    if (verb === 'reject') {
      const yes = await dialogs.confirm({
        title: 'Send it back to draft?',
        body: 'It leaves the review queue and can be edited again.',
        confirmLabel: 'Send back',
      });
      if (!yes) return;
    }
    if (verb === 'approve') {
      const yes = await dialogs.confirm({
        title: `Publish “${lesson!.titleEn}”?`,
        body: 'Learners get it straight away. A published lesson cannot be changed — later edits are a new version.',
        confirmLabel: 'Publish',
      });
      if (!yes) return;
    }
    setBusy(verb);
    setMissing([]);
    try {
      await api(`/admin/content/lessons/${lesson!.id}/${verb}`, { method: 'POST' });
      toast.success(verb === 'submit' ? 'Sent for review.' : verb === 'approve' ? 'Published: learners have it now.' : 'Sent back to draft.');
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'LISTENING_AUDIO_MISSING') {
        setMissing(Array.isArray(err.body.missing) ? (err.body.missing as string[]) : []);
        toast.error('Not published: a listening item has nothing to play yet.');
      } else {
        toast.error(errorLine(err, 'lessons'));
      }
    } finally {
      setBusy(null);
    }
  }

  async function newVersion(): Promise<void> {
    setBusy('version');
    try {
      const res = await api<{ lessonId: string }>(`/admin/content/lessons/${lesson!.id}/new-version`, { method: 'POST' });
      toast.success('A new draft version is open. Learners keep the published one until this is approved.');
      go(`lessons/${res.lessonId}`);
    } catch (err) {
      toast.error(errorLine(err, 'lessons'));
    } finally {
      setBusy(null);
    }
  }

  async function reload(): Promise<void> {
    if (dirty) {
      const yes = await dialogs.confirm({ title: 'Reload the saved lesson?', body: 'Your changes here will be lost.', confirmLabel: 'Reload', tone: 'danger' });
      if (!yes) return;
    }
    await load();
  }

  const issuesAt = (i: number): Issue[] => [...issuesFor(serverIssues, i), ...(showChecks ? local[i] ?? [] : [])];
  const room = 50 - draft.exercises.length;
  const append = (added: Exercise[]): void =>
    update({ exercises: [...draft.exercises, ...added].slice(0, 50).map((e, i) => ({ ...e, position: i + 1 })) });
  const addConversation = (): void => append([{ position: 0, type: 'conversation', payload: blankPayload('conversation') }]);
  // a conversation can be recorded once it is saved: its page reads the lesson from the server
  const saved = new Set(
    lesson.exercises.filter((e) => e.type === 'conversation').map((e) => String((e.payload as { id?: unknown }).id ?? '')),
  );
  const recordOf = (ex: Exercise): string | null | undefined => {
    if (ex.type !== 'conversation') return undefined;
    const id = String((ex.payload as { id?: unknown }).id ?? '');
    return saved.has(id) ? conversationHref(id, lesson.id) : null;
  };
  const quick = (
    <div className="ex-quick">
      <Button icon="list" onClick={() => setBuilding(true)} disabled={room <= 0}>
        Build from words
      </Button>
      <Button icon="chat" onClick={addConversation} disabled={room <= 0}>
        Add a conversation
      </Button>
    </div>
  );
  const status = lesson.status;
  const where = [lesson.courseTitle, lesson.unitTitle, lesson.skillTitle].filter(Boolean).join(' › ');

  return (
    <div className="lesson-editor">
      <PageHeader
        back={{ href: '#/lessons', label: 'All lessons' }}
        title={draft.titleEn || 'Untitled lesson'}
        meta={
          <>
            <Badge tone={STATUS_TONE[status]}>{STATUS_NAME[status]}</Badge>
            <Badge>Version {lesson.version}</Badge>
            {dirty && <Badge tone="warn">Unsaved changes</Badge>}
          </>
        }
        subtitle={`${where ? `${where} · ` : ''}lesson ${lesson.position}`}
        actions={
          <>
            <a className="button-link" href={recordHref(lesson)}>
              <Icon name="mic" />
              Record its sentences
            </a>
            <Button icon="refresh" onClick={() => void reload()} disabled={busy !== null}>
              Reload
            </Button>
          </>
        }
      />

      {status === 'published' && (
        <Banner
          tone="info"
          title="Published lessons can’t be changed"
          actions={
            <Button variant="primary" busy={busy === 'version'} onClick={() => void newVersion()}>
              Start a new version
            </Button>
          }
        >
          Learners are using this version. A new version is a draft copy you can edit; learners keep this one until it is approved.
        </Banner>
      )}
      {status === 'in_review' && (
        <Banner tone="warn" title="Waiting for review">
          Read it through, then publish it or send it back to draft for changes.
        </Banner>
      )}
      {status === 'archived' && <Banner title="Archived">An older version, kept for the record. It cannot be changed or published.</Banner>}

      {missing.length > 0 && (
        <Banner
          tone="bad"
          title="A listening item has nothing to play"
          actions={
            <a className="button-link primary" href={recordHref(lesson, true)}>
              <Icon name="mic" />
              Record them
            </a>
          }
        >
          Record {missing.length === 1 ? 'this sentence' : 'these sentences'} in the audio studio, then publish again: {missing.map((m) => `“${m}”`).join(', ')}.
        </Banner>
      )}

      {/* what the server said about something other than one exercise (each exercise shows its own) */}
      {serverIssues.some((i) => !/^exercises\[\d+\]/.test(i.path)) && (
        <Banner tone="bad" title="The server refused the draft">
          {serverIssues
            .filter((i) => !/^exercises\[\d+\]/.test(i.path))
            .map((i) => `${i.path}: ${i.message}`)
            .join(' · ')}
        </Banner>
      )}

      <Section title="Titles">
        <FieldRow>
          <TextInput
            label="In Kurdish"
            dir="auto"
            value={draft.titleKu}
            readOnly={!editable}
            maxLength={200}
            required
            error={showChecks && !draft.titleKu.trim() ? 'A Kurdish title is needed.' : undefined}
            onChange={(e) => update({ titleKu: e.target.value })}
          />
          <TextInput
            label="In English"
            value={draft.titleEn}
            readOnly={!editable}
            maxLength={200}
            required
            error={showChecks && !draft.titleEn.trim() ? 'An English title is needed.' : undefined}
            onChange={(e) => update({ titleEn: e.target.value })}
          />
        </FieldRow>
      </Section>

      <Section
        title={`Exercises (${mode === 'form' ? draft.exercises.length : 'JSON'})`}
        description="In the order learners meet them. Each is checked as you type; problems show once you save."
        actions={
          <Tabs
            label="Edit as"
            value={mode}
            onChange={switchMode}
            items={[
              { key: 'form', label: 'Form' },
              { key: 'json', label: 'JSON (advanced)' },
            ]}
          />
        }
      >
        {mode === 'json' ? (
          <div className="field">
            <label htmlFor="lesson-json">Exercises as JSON</label>
            <div className="field-hint" id="lesson-json-hint">
              An array of {'{ "type": …, "payload": { … } }'}, in order. For what the forms do not cover; switching back to the form checks it.
            </div>
            <textarea
              id="lesson-json"
              className="code-area"
              rows={18}
              spellCheck={false}
              value={json}
              readOnly={!editable}
              aria-describedby={jsonProblem ? 'lesson-json-hint lesson-json-problem' : 'lesson-json-hint'}
              aria-invalid={jsonProblem ? true : undefined}
              onChange={(e) => {
                setJson(e.target.value);
                setJsonProblem(null);
              }}
            />
            {jsonProblem && (
              <div id="lesson-json-problem" className="field-error" role="alert">
                {jsonProblem}
              </div>
            )}
            {serverIssues.length > 0 && (
              <ul className="ex-problems">
                {serverIssues.map((i) => (
                  <li key={`${i.path}:${i.message}`} className="field-error">
                    {i.path}: {i.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : draft.exercises.length === 0 ? (
          <EmptyState title="No exercises yet" icon="book" action={editable ? quick : undefined}>
            {editable
              ? 'The quickest start: build a set of exercises from the lesson’s words, or add a conversation for two or more people to record. Or add one at a time below.'
              : 'This version has none.'}
          </EmptyState>
        ) : (
          <div className="ex-list-cards">
            {draft.exercises.map((ex, i) => (
              <ExerciseCard
                key={i}
                index={i}
                count={draft.exercises.length}
                exercise={ex}
                issues={issuesAt(i)}
                readOnly={!editable}
                onChange={(next) => setExercise(i, next)}
                onMove={(by) => move(i, by)}
                onRemove={() => void remove(i)}
                recordHref={recordOf(ex)}
              />
            ))}
          </div>
        )}

        {editable && mode === 'form' && draft.exercises.length > 0 && quick}

        {editable && mode === 'form' && (
          <form
            className="ex-new"
            onSubmit={(e) => {
              e.preventDefault();
              update({ exercises: [...draft.exercises, { position: draft.exercises.length + 1, type: newType, payload: blankPayload(newType) }] });
            }}
          >
            <label htmlFor="ex-new-type">Add an exercise</label>
            <select id="ex-new-type" value={newType} onChange={(e) => setNewType(e.target.value as ExerciseType)}>
              {EXERCISE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_NAME[t]}
                </option>
              ))}
            </select>
            <Button type="submit" icon="plus" disabled={draft.exercises.length >= 50}>
              Add
            </Button>
          </form>
        )}
      </Section>

      {(editable || status === 'in_review') && mode === 'form' && (
        <LessonReadiness lesson={lesson} exercises={draft.exercises} titles={{ ku: draft.titleKu, en: draft.titleEn }} dirty={dirty} />
      )}

      {editable && <QuickBuild open={building} room={room} onClose={() => setBuilding(false)} onAdd={append} />}

      {(editable || status === 'in_review') && (
        <div className="editor-bar">
          {editable ? (
            <>
              <span className="editor-bar-state">{mode === 'json' ? 'Editing the JSON' : dirty ? 'Unsaved changes' : 'All changes saved'}</span>
              <Button onClick={() => void transition('submit')} disabled={busy !== null} busy={busy === 'submit'}>
                Send for review
              </Button>
              <Button variant="primary" icon="check" onClick={() => void save()} disabled={busy !== null || (mode === 'form' && !dirty)} busy={busy === 'save'}>
                {busy === 'save' ? 'Saving…' : 'Save draft'}
              </Button>
            </>
          ) : (
            <>
              <span className="editor-bar-state">In review</span>
              <Button onClick={() => void transition('reject')} disabled={busy !== null} busy={busy === 'reject'}>
                Send back to draft
              </Button>
              <Button variant="primary" onClick={() => void transition('approve')} disabled={busy !== null} busy={busy === 'approve'}>
                Approve and publish
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
