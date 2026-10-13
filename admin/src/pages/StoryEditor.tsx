import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  GLOSSARY_MAX,
  MAX_OPTIONS,
  MAX_QUESTION_BANK,
  MIN_OPTIONS,
  QUESTION_EXPLANATION_MAX,
  QUESTION_KINDS,
  STORY_DIALECTS,
  STORY_LENGTHS,
  STORY_LEVELS,
  STORY_SUMMARY_MAX,
  STORY_TITLE_MAX,
  localeDir,
  storyTextDirection,
  type AppLocale,
  type QuestionKind,
  type StoryDialect,
  type StoryProblem,
  type StoryValidation,
} from '@kurda/shared';
import {
  DIALECT_NAME,
  KIND_HINT,
  LENGTH_NAME,
  STATUS_NAME,
  availableActions,
  bandLabel,
  bankNeeds,
  blankForm,
  blankGloss,
  blankQuestion,
  describePath,
  editorReducer,
  fieldId,
  fieldIdsFor,
  formFromStory,
  glossLocalesLeft,
  glossPlaces,
  isDirty,
  isEditable,
  kindTally,
  liveChecks,
  localeName,
  looksRandomSlug,
  needsNativeReview,
  opening,
  problemsAt,
  textFacts,
  type AdminStory,
  type EditorAction,
  type GlossRow,
  type LiveChecks,
  type ParagraphFacts,
  type QuestionForm,
  type StoryAction,
  type StoryForm,
} from '../stories';
import { setLeaveGuard } from '../nav';
import { getStory, runStoryAction, storyFailure, type StoryFailure } from '../storiesApi';
import { STATUS_TONE } from './StoryList';

const LEVEL_NAME: Record<number, string> = { 1: '1 · first steps (A1)', 2: '2 · elementary (A2)', 3: '3 · intermediate (B1)' };

const DONE: Record<Exclude<StoryAction, 'delete'>, string> = {
  save: 'Saved.',
  submit: 'Submitted for review.',
  publish: 'Published: learners can read it now.',
  unpublish: 'Unpublished: it is a draft again, and learners no longer see it.',
  archive: 'Archived.',
};

const NOT_DONE: Record<StoryAction, string> = {
  save: 'Not saved',
  submit: 'Not submitted',
  publish: 'Not published',
  unpublish: 'Not unpublished',
  archive: 'Not archived',
  delete: 'Not deleted',
};

type Tone = 'error' | 'publish' | 'warning';
interface FieldProblems {
  error: StoryProblem[];
  publish: StoryProblem[];
  warning: StoryProblem[];
}

const TAG: Record<Tone, string> = { error: 'Must fix', publish: 'Before publishing', warning: 'Check' };

const LEAVE = 'Leave without saving? Your changes here will be lost.';

/**
 * Whether the story's fields can be changed: not while it is published or
 * archived, nor while a request is out. Text fields go read-only rather than
 * disabled, so a published story's text can still be selected and copied.
 */
const ReadOnly = createContext(false);

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Questions open at first: all of a short bank, else the ones a save would be refused for. */
function initiallyOpen(form: StoryForm): Set<string> {
  if (form.questions.length <= 3) return new Set(form.questions.map((q) => q.key));
  const blocking = liveChecks(form).blocking;
  return new Set(form.questions.filter((_, i) => problemsAt(blocking, `questions[${i}]`).length > 0).map((q) => q.key));
}

function dedupe(list: readonly StoryProblem[]): StoryProblem[] {
  const seen = new Set<string>();
  return list.filter((p) => {
    const k = `${p.code}|${p.path}|${p.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * One story: its text, glossary and questions, checked as they are typed,
 * and the steps from draft to published.
 *
 * What it checks is what the API checks (`liveChecks` runs the shared
 * `validateStory`), so the buttons say ahead of time what the server would
 * refuse; when the server refuses anyway, its list is shown too. Every change
 * carries the version of the story the editor loaded, and if someone else
 * changed it since, nothing is overwritten: the editor is asked to reload.
 */
export function StoryEditor({
  id,
  initial,
  onBack,
  onCreated,
  onDeleted,
}: {
  /** null for a new story */
  id: string | null;
  /** the story as just saved, when the page was opened by creating it */
  initial: AdminStory | null;
  onBack: () => void;
  onCreated: (story: AdminStory) => void;
  onDeleted: (title: string) => void;
}): React.JSX.Element {
  const [start] = useState(() => (initial ? formFromStory(initial) : blankForm()));
  const [story, setStory] = useState<AdminStory | null>(initial);
  const [loaded, setLoaded] = useState<StoryForm>(start);
  const [form, dispatchForm] = useReducer(editorReducer, start);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'failed'>(id && !initial ? 'loading' : 'ready');
  const [loadProblem, setLoadProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<StoryAction | 'reload' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(
    initial ? { tone: 'ok', text: 'Saved.' } : null,
  );
  const [conflict, setConflict] = useState<{ kind: 'stale' | 'state'; message: string } | null>(null);
  const [server, setServer] = useState<StoryValidation | null>(null);
  const [open, setOpen] = useState<Set<string>>(() => initiallyOpen(start));
  const [previewOpen, setPreviewOpen] = useState(true);

  const dispatch = (action: EditorAction): void => {
    dispatchForm(action);
    // what the server said was about the story as it was sent, not as it is now
    setServer(null);
  };

  /** Show a story as stored: the form, what counts as unsaved, and the version to send back. */
  const show = (next: AdminStory, previous?: StoryForm): StoryForm => {
    const f = formFromStory(next, { previous });
    setStory(next);
    setLoaded(f);
    dispatchForm({ type: 'load', form: f });
    return f;
  };

  useEffect(() => {
    if (!id || initial) return;
    let live = true;
    getStory(id)
      .then((s) => {
        if (!live) return;
        setOpen(initiallyOpen(show(s)));
        setPhase('ready');
      })
      .catch((err: unknown) => {
        if (!live) return;
        const failure = storyFailure(err);
        setLoadProblem(
          // an address that is not a story's id at all is refused as a bad request
          failure.kind === 'not_found' || failure.kind === 'invalid'
            ? 'There is no such story. It may have been deleted.'
            : failure.kind === 'forbidden'
              ? 'Writing stories needs the content_editor, admin or superadmin role.'
              : `Could not load the story: ${failure.message}`,
        );
        setPhase('failed');
      });
    return () => {
      live = false;
    };
  }, [id, initial]);

  const status = story?.status ?? null;
  const editable = isEditable(status);
  const ro = !editable || busy !== null;
  const dirty = isDirty(form, loaded);
  const checks = useMemo(
    () => liveChecks(form, { publishedBefore: Boolean(story?.publishedAt), savedSlug: story?.slug }),
    [form, story],
  );
  const facts = useMemo(() => textFacts(form.dialect, form.body), [form.dialect, form.body]);
  const places = useMemo(() => glossPlaces(form), [form]);
  const script = storyTextDirection(form.dialect);

  const errors = useMemo(() => dedupe([...checks.blocking, ...(server?.errors ?? [])]), [checks, server]);
  const warnings = useMemo(() => dedupe([...checks.warnings, ...(server?.warnings ?? [])]), [checks, server]);
  const at = (path: string, exact = true): FieldProblems => ({
    error: problemsAt(errors, path, exact),
    publish: problemsAt(checks.beforePublish, path, exact),
    warning: problemsAt(warnings, path, exact),
  });

  // leaving with unsaved work asks first: closing or reloading the tab, and
  // any change of address — the back button, the nav, a typed #/… address
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    setLeaveGuard(() => confirm(LEAVE));
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      setLeaveGuard(null);
    };
  }, [dirty]);

  /** The editor moves on by its own doing: it has asked already, or nothing is lost, so the guard must not ask. */
  const leaving = (): void => setLeaveGuard(null);

  const canSave = editable && !busy && !conflict && checks.blocking.length === 0 && (dirty || story === null);
  const canPublish = editable && !busy && !conflict && checks.blocking.length === 0 && checks.beforePublish.length === 0;

  // Ctrl/⌘+S saves, as in any editor
  const saveRef = useRef<() => void>(() => undefined);
  saveRef.current = () => {
    if (canSave) void act('save');
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** Take the editor to the field a problem is about, opening what hides it. */
  const go = (path: string): void => {
    const q = /^questions\[(\d+)\]/.exec(path);
    const question = q ? form.questions[Number(q[1])] : undefined;
    if (question) setOpen((o) => new Set(o).add(question.key));
    if (path.startsWith('body.paragraphs')) setPreviewOpen(true);
    requestAnimationFrame(() => {
      for (const target of fieldIdsFor(path)) {
        const el = document.getElementById(target);
        if (!el) continue;
        el.scrollIntoView?.({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
        el.focus({ preventScroll: true });
        break;
      }
    });
  };

  const focusSoon = (target: string): void => {
    requestAnimationFrame(() => document.getElementById(target)?.focus());
  };

  async function reload(): Promise<void> {
    if (!story) return;
    if (dirty && !confirm('Reload the story as it is saved now? Your changes here will be lost.')) return;
    setBusy('reload');
    try {
      const fresh = await getStory(story.id);
      // someone else's version may have other questions: open what a first load would
      setOpen(initiallyOpen(show(fresh)));
      setConflict(null);
      setServer(null);
      setNotice({ tone: 'ok', text: 'Reloaded: this is the story as it is saved now.' });
    } catch (err) {
      setNotice({ tone: 'error', text: `Could not reload: ${storyFailure(err).message}` });
    } finally {
      setBusy(null);
    }
  }

  function confirmed(action: StoryAction, title: string): boolean {
    const lost = dirty ? '\n\nYour unsaved changes here are not kept.' : '';
    switch (action) {
      case 'unpublish':
        return confirm(
          `Unpublish “${title}”?\n\nLearners stop seeing it at once; games already under way keep their own copy. It becomes a draft you can edit, and comes back when it is published again.`,
        );
      case 'archive':
        return confirm(
          `Archive “${title}”?\n\nIt leaves the app${status === 'published' ? ' at once' : ''} and can no longer be edited or published; games already under way keep their own copy. The panel cannot bring it back.${lost}`,
        );
      case 'delete':
        return confirm(
          `Delete “${title}”?\n\nThis cannot be undone here. A story a game has used cannot be deleted: archive it instead.${lost}`,
        );
      case 'publish': {
        const slug = form.slug.trim();
        const reasons = [
          story && needsNativeReview(story)
            ? 'This is a starter story that no native speaker has published yet. Publish it only once a native speaker has read the text and every question.'
            : null,
          // the address is the story's for good once learners have it: changing it later breaks their links
          looksRandomSlug(slug)
            ? `Its address ends in random letters (${slug}). Once it is published, changing it breaks the links learners have to it.`
            : null,
        ].filter((r) => r !== null);
        return reasons.length === 0 || confirm(`Publish “${title}”?\n\n${reasons.join('\n\n')}`);
      }
      default:
        return true;
    }
  }

  async function act(action: StoryAction): Promise<void> {
    const title = form.title.trim() || story?.title || 'this story';
    if (!confirmed(action, title)) return;
    setBusy(action);
    setNotice(null);
    setServer(null);
    const outcome = await runStoryAction(action, { story, form, dirty });
    setBusy(null);
    if (outcome.ok) {
      if (!outcome.story) {
        leaving();
        onDeleted(title);
        return;
      }
      if (!story) {
        // what was typed is saved: going to the new story's own address loses nothing
        leaving();
        onCreated(outcome.story);
        return;
      }
      show(outcome.story, form);
      setNotice({ tone: 'ok', text: DONE[action as Exclude<StoryAction, 'delete'>] });
      return;
    }
    // "save and publish" may have saved before it was refused
    if (outcome.story) {
      if (!story) {
        leaving();
        onCreated(outcome.story);
        return;
      }
      show(outcome.story, form);
    }
    report(action, outcome.failure, Boolean(outcome.story));
  }

  function report(action: StoryAction, failure: StoryFailure, savedFirst: boolean): void {
    const prefix = savedFirst ? `Saved, but ${NOT_DONE[action].toLowerCase()}` : NOT_DONE[action];
    switch (failure.kind) {
      case 'stale':
      case 'state':
        setConflict({ kind: failure.kind, message: failure.message });
        return;
      case 'invalid':
        if (failure.validation) setServer(failure.validation);
        setNotice({
          tone: 'error',
          text: `${prefix}: ${failure.message}.${failure.validation ? ' The problems are listed under Checks.' : ''}`,
        });
        return;
      case 'slug_taken':
        setServer({ errors: [{ code: 'SLUG_TAKEN', path: 'slug', message: failure.message }], warnings: [] });
        setNotice({ tone: 'error', text: `${prefix}: ${failure.message}.` });
        return;
      case 'not_found':
        setNotice({ tone: 'error', text: `${prefix}: this story no longer exists. It may have been deleted.` });
        return;
      default:
        setNotice({ tone: 'error', text: `${prefix}: ${failure.message}.` });
    }
  }

  const back = (): void => {
    if (dirty && !confirm(LEAVE)) return;
    leaving();
    onBack();
  };

  if (phase === 'loading') {
    return (
      <div>
        <BackLink onBack={onBack} />
        <div className="card empty">Loading…</div>
      </div>
    );
  }
  if (phase === 'failed') {
    return (
      <div>
        <BackLink onBack={onBack} />
        <div className="card empty">{loadProblem}</div>
      </div>
    );
  }

  const title = form.title.trim();
  const needs = bankNeeds(facts.length);

  return (
    <div>
      <BackLink onBack={back} />
      <div className="toolbar st-head">
        <div style={{ minWidth: 0 }}>
          <h1 lang={title ? script.lang : undefined} dir={title ? script.dir : undefined}>
            {title || (story ? 'Untitled story' : 'New story')}
          </h1>
          <div className="row st-badges">
            {status && <span className={`badge ${STATUS_TONE[status]}`}>{STATUS_NAME[status]}</span>}
            {story && needsNativeReview(story) && <span className="badge mid">Starter (needs native review)</span>}
            {dirty && <span className="badge">Unsaved changes</span>}
            {story && (
              <span className="subtle">
                Saved {new Date(story.updatedAt).toLocaleString()}
                {story.publishedAt && ` · first published ${new Date(story.publishedAt).toLocaleDateString()}`}
              </span>
            )}
          </div>
        </div>
      </div>

      {conflict && (
        <div className="card st-conflict" role="alert">
          <strong>This story changed since you opened it.</strong>
          <div className="subtle">
            {conflict.kind === 'stale'
              ? 'Someone else saved a change to it.'
              : `${conflict.message.charAt(0).toUpperCase()}${conflict.message.slice(1)}.`}{' '}
            Nothing of yours was saved over it. Reload to see it as it is now: your changes here are lost then, so copy
            anything you want to keep first.
          </div>
          <div>
            <button type="button" className="primary" onClick={() => void reload()} disabled={busy !== null}>
              Reload the story
            </button>
          </div>
        </div>
      )}
      {notice && (
        <div className={`card st-notice${notice.tone === 'error' ? ' is-error' : ''}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
          {notice.text}
        </div>
      )}
      {status === 'published' && (
        <div className="card st-banner">
          Published: learners can read it, so it cannot be edited. To change it, unpublish it first. It then leaves the app until
          it is published again; games already under way keep their own copy.
        </div>
      )}
      {status === 'archived' && (
        <div className="card st-banner">
          Archived: it is not shown anywhere and can no longer be edited or published. It can be deleted if no game has used it.
        </div>
      )}
      {status === 'in_review' && (
        <div className="card st-banner">In review: waiting for someone to read it and publish it. It can still be edited.</div>
      )}

      <div className="st-layout">
        <ReadOnly.Provider value={ro}>
        <div className="st-main">
          <section className="card st-section" aria-labelledby="st-about">
            <h2 className="st-h2" id="st-about">
              About
            </h2>
            <div className="st-grid2">
              <Field path="dialect" label="Variety" problems={at('dialect')}>
                <select
                  {...described('dialect', at('dialect'))}
                  disabled={ro}
                  value={form.dialect}
                  onChange={(e) => dispatch({ type: 'dialect', value: e.target.value as StoryDialect })}
                >
                  {STORY_DIALECTS.map((d) => (
                    <option key={d} value={d}>
                      {DIALECT_NAME[d]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field path="level" label="Level" problems={at('level')}>
                <select
                  {...described('level', at('level'))}
                  disabled={ro}
                  value={form.level}
                  onChange={(e) => dispatch({ type: 'level', value: Number(e.target.value) })}
                >
                  {STORY_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {LEVEL_NAME[l]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field
              path="title"
              label="Title"
              problems={at('title')}
              counter={{ n: form.title.trim().length, max: STORY_TITLE_MAX }}
            >
              <input
                {...described('title', at('title'))}
                readOnly={ro}
                lang={script.lang}
                dir={script.dir}
                value={form.title}
                onChange={(e) => dispatch({ type: 'text', field: 'title', value: e.target.value })}
              />
            </Field>
            <Field
              path="slug"
              label="Address"
              problems={at('slug')}
              hint={
                form.dialect === 'sorani'
                  ? 'Where the story lives: /app/games/stories/' +
                    (form.slug || '…') +
                    '. A Soranî title cannot be spelled in an address, so it starts with random letters: replace them with a word or two in Latin letters.'
                  : 'Where the story lives: /app/games/stories/' +
                    (form.slug || '…') +
                    (form.slugEdited ? '.' : '. Made from the title until you change it.')
              }
            >
              <input
                {...described('slug', at('slug'))}
                readOnly={ro}
                lang="en"
                dir="ltr"
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                value={form.slug}
                onChange={(e) => dispatch({ type: 'slug', value: e.target.value })}
              />
            </Field>
            <Field
              path="summary"
              label="Summary"
              optional
              problems={at('summary')}
              hint="One line under the title in the list of stories."
              counter={{ n: form.summary.trim().length, max: STORY_SUMMARY_MAX }}
            >
              <textarea
                {...described('summary', at('summary'))}
                readOnly={ro}
                rows={2}
                lang={script.lang}
                dir={script.dir}
                value={form.summary}
                onChange={(e) => dispatch({ type: 'text', field: 'summary', value: e.target.value })}
              />
            </Field>
          </section>

          <section className="card st-section" aria-labelledby="st-text">
            <h2 className="st-h2" id="st-text">
              Text
            </h2>
            <Field
              path="body"
              label="The story"
              problems={at('body')}
              hint="Paragraphs are separated by an empty line. Write numbers and abbreviations out: the reader and the audio studio cut sentences at every full stop."
            >
              <textarea
                {...described('body', at('body'))}
                readOnly={ro}
                className="st-body"
                rows={14}
                lang={script.lang}
                dir={script.dir}
                value={form.body}
                onChange={(e) => dispatch({ type: 'text', field: 'body', value: e.target.value })}
              />
            </Field>
            <div className="st-facts" aria-live="polite">
              <strong>{facts.words} words</strong>
              {' · '}
              {facts.length ? <span>{LENGTH_NAME[facts.length]}</span> : <span className="st-nolength">no length yet</span>}
              {' · '}about {facts.minutes} min to read
            </div>
            <div className="row st-bands" aria-label={`${DIALECT_NAME[form.dialect]} lengths`}>
              {STORY_LENGTHS.map((l) => (
                <span key={l} className={`badge${facts.length === l ? ' ok' : ''}`}>
                  {bandLabel(form.dialect, l)}
                </span>
              ))}
            </div>
            {facts.paragraphs.length > 0 && (
              <details
                className="st-preview"
                open={previewOpen}
                onToggle={(e) => setPreviewOpen((e.currentTarget as HTMLDetailsElement).open)}
              >
                <summary>
                  Paragraphs and sentences ({facts.paragraphs.length} paragraph{facts.paragraphs.length === 1 ? '' : 's'})
                </summary>
                <p className="subtle st-hint">
                  How the reader and the audio studio cut the text: each sentence is played, and recorded, on its own.
                </p>
                {facts.paragraphs.map((p, i) => (
                  <ParagraphPreview key={i} index={i} paragraph={p} dialect={form.dialect} problems={at(`body.paragraphs[${i}]`)} />
                ))}
              </details>
            )}
          </section>

          <section className="card st-section" aria-labelledby="st-gloss" id={fieldId('glossary')} tabIndex={-1}>
            <div className="row st-section-head">
              <h2 className="st-h2" id="st-gloss">
                Glossary <span className="subtle">({form.glossary.length} of {GLOSSARY_MAX})</span>
              </h2>
              <div className="spacer" style={{ flex: 1 }} />
              <button
                type="button"
                disabled={ro || form.glossary.length >= GLOSSARY_MAX}
                onClick={() => {
                  const row = blankGloss();
                  dispatch({ type: 'gloss/add', row });
                  focusSoon(fieldId(`glossary[${form.glossary.length}].term`));
                }}
              >
                Add a word
              </button>
            </div>
            <p className="subtle st-hint">
              Words a learner at this level may not know. The reader marks the first place each one appears in a paragraph, as a
              whole word; a word the text does not have is never shown, so it has to be written as the text writes it.
            </p>
            <ProblemList id={`${fieldId('glossary')}-problems`} problems={at('glossary')} />
            {form.glossary.map((row, g) => (
              <GlossaryRow
                key={row.key}
                index={g}
                row={row}
                found={places[g] ?? []}
                dialect={form.dialect}
                at={at}
                dispatch={dispatch}
              />
            ))}
          </section>

          <section className="card st-section" aria-labelledby="st-questions" id={fieldId('questions')} tabIndex={-1}>
            <div className="row st-section-head">
              <h2 className="st-h2" id="st-questions">
                Questions <span className="subtle">({form.questions.length})</span>
              </h2>
              <div className="spacer" style={{ flex: 1 }} />
              <button type="button" className="ghost" onClick={() => setOpen(new Set(form.questions.map((q) => q.key)))}>
                Open all
              </button>
              <button type="button" className="ghost" onClick={() => setOpen(new Set())}>
                Close all
              </button>
            </div>
            <p className="subtle st-hint">
              {needs
                ? `A ${LENGTH_NAME[facts.length!].toLowerCase()} story needs at least ${needs.min} questions; a game on it asks ${needs.counts.join(', ')}, chosen from all of them.`
                : 'How many questions a story needs depends on its length.'}{' '}
              A game asks them in the order of the text, with the gist question last.
            </p>
            {form.questions.length > 0 && (
              <div className="row st-tally">
                {kindTally(form.questions).map(({ kind, count }) => (
                  <span key={kind} className="badge">
                    {kind} {count}
                  </span>
                ))}
              </div>
            )}
            <ProblemList id={`${fieldId('questions')}-problems`} problems={at('questions')} />
            {form.questions.map((q, i) => (
              <QuestionCard
                key={q.key}
                index={i}
                total={form.questions.length}
                q={q}
                paragraphs={facts.paragraphs}
                dialect={form.dialect}
                open={open.has(q.key)}
                onToggle={(next) =>
                  setOpen((o) => {
                    const s = new Set(o);
                    if (next) s.add(q.key);
                    else s.delete(q.key);
                    return s;
                  })
                }
                at={at}
                dispatch={dispatch}
              />
            ))}
            <button
              type="button"
              disabled={ro || form.questions.length >= MAX_QUESTION_BANK}
              onClick={() => {
                const question = blankQuestion();
                dispatch({ type: 'q/add', question });
                setOpen((o) => new Set(o).add(question.key));
                focusSoon(fieldId(`questions[${form.questions.length}].kind`));
              }}
            >
              Add a question
            </button>
          </section>
        </div>
        </ReadOnly.Provider>

        <aside className="st-aside">
          <Actions
            status={status}
            dirty={dirty}
            busy={busy}
            conflict={conflict !== null}
            checks={checks}
            canSave={canSave}
            canPublish={canPublish}
            onAct={(a) => void act(a)}
          />
          <Checks checks={checks} server={server} onGo={go} />
        </aside>
      </div>
    </div>
  );
}

function BackLink({ onBack }: { onBack: () => void }): React.JSX.Element {
  return (
    <a
      href="#/stories"
      className="st-back"
      onClick={(e) => {
        e.preventDefault();
        onBack();
      }}
    >
      ← All stories
    </a>
  );
}

/** Props that tie a control to its path: its id, and its problems for assistive tech. */
function described(path: string, problems: FieldProblems): { id: string; 'aria-invalid'?: true; 'aria-describedby'?: string } {
  const any = problems.error.length + problems.publish.length + problems.warning.length > 0;
  return {
    id: fieldId(path),
    ...(problems.error.length > 0 ? { 'aria-invalid': true as const } : {}),
    ...(any ? { 'aria-describedby': `${fieldId(path)}-problems` } : {}),
  };
}

function Field({
  path,
  label,
  optional,
  hint,
  counter,
  problems,
  children,
}: {
  path: string;
  label: string;
  optional?: boolean;
  hint?: string;
  counter?: { n: number; max: number; soft?: number };
  problems: FieldProblems;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="st-field">
      <div className="st-label-row">
        <label htmlFor={fieldId(path)}>
          {label}
          {optional && <span className="subtle"> (optional)</span>}
        </label>
        {counter && <Counter {...counter} />}
      </div>
      {children}
      {hint && <div className="subtle st-hint">{hint}</div>}
      <ProblemList id={`${fieldId(path)}-problems`} problems={problems} />
    </div>
  );
}

function Counter({ n, max, soft }: { n: number; max: number; soft?: number }): React.JSX.Element {
  const tone = n > max ? ' is-over' : soft !== undefined && n > soft ? ' is-near' : '';
  return (
    <span className={`st-counter${tone}`}>
      {n} / {max}
    </span>
  );
}

function ProblemList({ id, problems }: { id: string; problems: FieldProblems }): React.JSX.Element | null {
  const items: Array<[Tone, StoryProblem]> = [
    ...problems.error.map((p) => ['error', p] as [Tone, StoryProblem]),
    ...problems.publish.map((p) => ['publish', p] as [Tone, StoryProblem]),
    ...problems.warning.map((p) => ['warning', p] as [Tone, StoryProblem]),
  ];
  if (items.length === 0) return null;
  return (
    <ul className="st-problems" id={id}>
      {items.map(([tone, p], i) => (
        <li key={i} className={`st-problem is-${tone}`}>
          <span className="st-problem-tag">{TAG[tone]}:</span> {p.message}
        </li>
      ))}
    </ul>
  );
}

function ParagraphPreview({
  index,
  paragraph,
  dialect,
  problems,
}: {
  index: number;
  paragraph: ParagraphFacts;
  dialect: StoryDialect;
  problems: FieldProblems;
}): React.JSX.Element {
  const script = storyTextDirection(dialect);
  const path = `body.paragraphs[${index}]`;
  const n = paragraph.sentences.length;
  return (
    <div className="st-para" id={fieldId(path)} tabIndex={-1}>
      <div className="st-para-head subtle">
        Paragraph {index + 1} · {n} sentence{n === 1 ? '' : 's'} · {paragraph.words} words
      </div>
      <ol className="st-sentences" dir={script.dir}>
        {paragraph.sentences.map((s, i) => (
          <li key={i}>
            <span lang={script.lang} dir={script.dir}>
              {s.text}
            </span>
            {s.tooLong ? (
              <span className="badge danger">{s.chars} characters: too long to record</span>
            ) : s.long ? (
              <span className="badge mid">{s.chars} characters: may not fit 15 seconds</span>
            ) : null}
            {!s.recordable && <span className="badge">not read aloud</span>}
          </li>
        ))}
      </ol>
      <ProblemList id={`${fieldId(path)}-problems`} problems={problems} />
    </div>
  );
}

function GlossaryRow({
  index,
  row,
  found,
  dialect,
  at,
  dispatch,
}: {
  index: number;
  row: GlossRow;
  found: number[];
  dialect: StoryDialect;
  at: (path: string, exact?: boolean) => FieldProblems;
  dispatch: (a: EditorAction) => void;
}): React.JSX.Element {
  const ro = useContext(ReadOnly);
  const script = storyTextDirection(dialect);
  const base = `glossary[${index}]`;
  const left = glossLocalesLeft(row);
  const termProblems = at(`${base}.term`);
  return (
    <div className="st-gloss" id={fieldId(base)} tabIndex={-1}>
      <div className="st-gloss-line">
        <div className="st-field">
          <label htmlFor={fieldId(`${base}.term`)}>Word {index + 1}</label>
          <input
            {...described(`${base}.term`, termProblems)}
            readOnly={ro}
            lang={script.lang}
            dir={script.dir}
            value={row.term}
            onChange={(e) => dispatch({ type: 'gloss/set', index, field: 'term', value: e.target.value })}
          />
          {row.term.trim() && found.length > 0 && (
            <div className="subtle st-hint">Marked in paragraph {found.map((p) => p + 1).join(', ')}</div>
          )}
          <ProblemList id={`${fieldId(`${base}.term`)}-problems`} problems={termProblems} />
        </div>
        <div className="st-field">
          <label htmlFor={fieldId(`${base}.meanings.en`)}>Meaning in English</label>
          <input
            {...described(`${base}.meanings.en`, at(`${base}.meanings.en`))}
            readOnly={ro}
            lang="en"
            dir="ltr"
            value={row.en}
            onChange={(e) => dispatch({ type: 'gloss/set', index, field: 'en', value: e.target.value })}
          />
          <ProblemList id={`${fieldId(`${base}.meanings.en`)}-problems`} problems={at(`${base}.meanings.en`)} />
        </div>
        <button
          type="button"
          className="danger st-remove"
          disabled={ro}
          aria-label={`Remove word ${index + 1}`}
          onClick={() => dispatch({ type: 'gloss/remove', index })}
        >
          Remove
        </button>
      </div>
      {row.extra.map(({ locale, text }) => {
        const path = `${base}.meanings.${locale}`;
        return (
          <div key={locale} className="st-gloss-extra">
            <div className="st-field">
              <label htmlFor={fieldId(path)}>Meaning in {localeName(locale)}</label>
              <input
                {...described(path, at(path))}
                readOnly={ro}
                lang={locale}
                dir={localeDir(locale as AppLocale)}
                value={text}
                onChange={(e) => dispatch({ type: 'gloss/extra-set', index, locale, value: e.target.value })}
              />
              <ProblemList id={`${fieldId(path)}-problems`} problems={at(path)} />
            </div>
            <button
              type="button"
              className="ghost"
              disabled={ro}
              aria-label={`Remove the ${localeName(locale)} meaning`}
              onClick={() => dispatch({ type: 'gloss/extra-remove', index, locale })}
            >
              Remove
            </button>
          </div>
        );
      })}
      {left.length > 0 && !ro && (
        <select
          className="st-add-locale"
          aria-label={`Add a meaning of word ${index + 1} in another language`}
          value=""
          onChange={(e) => {
            if (e.target.value) dispatch({ type: 'gloss/extra-add', index, locale: e.target.value });
          }}
        >
          <option value="">Add a meaning in another language (optional)…</option>
          {left.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function QuestionCard({
  index,
  total,
  q,
  paragraphs,
  dialect,
  open,
  onToggle,
  at,
  dispatch,
}: {
  index: number;
  total: number;
  q: QuestionForm;
  paragraphs: ParagraphFacts[];
  dialect: StoryDialect;
  open: boolean;
  onToggle: (open: boolean) => void;
  at: (path: string, exact?: boolean) => FieldProblems;
  dispatch: (a: EditorAction) => void;
}): React.JSX.Element {
  const ro = useContext(ReadOnly);
  const script = storyTextDirection(dialect);
  const base = `questions[${index}]`;
  const inside = at(base, false);
  const right = q.options[q.correctIndex];
  const ep = q.evidenceParagraph;
  const para = ep !== null ? paragraphs[ep] : undefined;
  const sentences = para?.sentences ?? [];
  const es = q.evidenceSentence;
  const hasContent = q.prompt.trim() !== '' || q.options.some((o) => o.trim() !== '');

  return (
    <details
      className="st-q"
      id={fieldId(base)}
      tabIndex={-1}
      open={open}
      onToggle={(e) => {
        const now = (e.currentTarget as HTMLDetailsElement).open;
        if (now !== open) onToggle(now);
      }}
    >
      <summary>
        <span className="st-q-n">{index + 1}</span>
        <span className="badge">{q.kind}</span>
        <span className="st-q-prompt" lang={script.lang} dir={script.dir}>
          {q.prompt.trim() ? opening(q.prompt, 90) : <span className="subtle">No question yet</span>}
        </span>
        {right?.trim() && (
          <span className="subtle st-q-right" lang={script.lang} dir={script.dir}>
            ✓ {opening(right, 40)}
          </span>
        )}
        {inside.error.length > 0 && <span className="badge danger">{inside.error.length} to fix</span>}
        {inside.error.length === 0 && inside.publish.length > 0 && (
          <span className="badge mid">{inside.publish.length} before publishing</span>
        )}
        {inside.warning.length > 0 && <span className="badge">{inside.warning.length} to check</span>}
      </summary>

      <div className="st-q-body">
        <div className="row st-q-tools">
          <Field path={`${base}.kind`} label="Asks about" problems={at(`${base}.kind`)}>
            <select
              {...described(`${base}.kind`, at(`${base}.kind`))}
              disabled={ro}
              value={q.kind}
              onChange={(e) => dispatch({ type: 'q/kind', index, value: e.target.value as QuestionKind })}
            >
              {QUESTION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}: {KIND_HINT[k]}
                </option>
              ))}
            </select>
          </Field>
          <div className="spacer" style={{ flex: 1 }} />
          <button
            type="button"
            className="ghost"
            disabled={ro || index === 0}
            aria-label={`Move question ${index + 1} up`}
            onClick={() => dispatch({ type: 'q/move', index, step: -1 })}
          >
            ↑ Up
          </button>
          <button
            type="button"
            className="ghost"
            disabled={ro || index === total - 1}
            aria-label={`Move question ${index + 1} down`}
            onClick={() => dispatch({ type: 'q/move', index, step: 1 })}
          >
            ↓ Down
          </button>
          <button
            type="button"
            className="danger"
            disabled={ro}
            onClick={() => {
              if (hasContent && !confirm(`Remove question ${index + 1}?`)) return;
              dispatch({ type: 'q/remove', index });
            }}
          >
            Remove
          </button>
        </div>

        <Field path={`${base}.prompt`} label="Question" problems={at(`${base}.prompt`)}>
          <textarea
            {...described(`${base}.prompt`, at(`${base}.prompt`))}
            readOnly={ro}
            rows={2}
            lang={script.lang}
            dir={script.dir}
            value={q.prompt}
            onChange={(e) => dispatch({ type: 'q/text', index, field: 'prompt', value: e.target.value })}
          />
        </Field>
        <Field
          path={`${base}.promptEn`}
          label="In English"
          hint="Shown under the question to beginners, and to anyone who asks for it."
          problems={at(`${base}.promptEn`)}
        >
          <input
            {...described(`${base}.promptEn`, at(`${base}.promptEn`))}
            readOnly={ro}
            lang="en"
            dir="ltr"
            value={q.promptEn}
            onChange={(e) => dispatch({ type: 'q/text', index, field: 'promptEn', value: e.target.value })}
          />
        </Field>

        <fieldset className="st-options" id={fieldId(`${base}.options`)} tabIndex={-1}>
          <legend>Options: choose the right one</legend>
          {q.options.map((option, o) => {
            const path = `${base}.options[${o}]`;
            return (
              <div key={o} className="st-option">
                <div className="row">
                  <input
                    type="radio"
                    id={o === 0 ? fieldId(`${base}.correctIndex`) : undefined}
                    name={`correct-${q.key}`}
                    disabled={ro}
                    checked={q.correctIndex === o}
                    onChange={() => dispatch({ type: 'q/correct', index, option: o })}
                    aria-label={`Option ${o + 1} is the right answer`}
                  />
                  <input
                    {...described(path, at(path))}
                    aria-label={`Option ${o + 1}`}
                    readOnly={ro}
                    lang={script.lang}
                    dir={script.dir}
                    value={option}
                    onChange={(e) => dispatch({ type: 'q/option', index, option: o, value: e.target.value })}
                  />
                  <button
                    type="button"
                    className="ghost"
                    disabled={ro || q.options.length <= MIN_OPTIONS}
                    aria-label={`Remove option ${o + 1}`}
                    onClick={() => dispatch({ type: 'q/option-remove', index, option: o })}
                  >
                    ✕
                  </button>
                </div>
                <ProblemList id={`${fieldId(path)}-problems`} problems={at(path)} />
              </div>
            );
          })}
          {q.options.length < MAX_OPTIONS && !ro && (
            <button type="button" className="ghost" onClick={() => dispatch({ type: 'q/option-add', index })}>
              Add an option
            </button>
          )}
          <ProblemList id={`${fieldId(`${base}.options`)}-problems`} problems={at(`${base}.options`)} />
          <ProblemList id={`${fieldId(`${base}.correctIndex`)}-problems`} problems={at(`${base}.correctIndex`)} />
        </fieldset>

        <div className="st-grid2">
          <Field
            path={`${base}.explanation`}
            label="Explanation"
            optional
            hint="One line, shown with the answer."
            counter={{ n: q.explanation.trim().length, max: QUESTION_EXPLANATION_MAX, soft: 120 }}
            problems={at(`${base}.explanation`)}
          >
            <textarea
              {...described(`${base}.explanation`, at(`${base}.explanation`))}
              readOnly={ro}
              rows={2}
              lang={script.lang}
              dir={script.dir}
              value={q.explanation}
              onChange={(e) => dispatch({ type: 'q/text', index, field: 'explanation', value: e.target.value })}
            />
          </Field>
          <Field
            path={`${base}.explanationEn`}
            label="Explanation in English"
            optional
            counter={{ n: q.explanationEn.trim().length, max: QUESTION_EXPLANATION_MAX, soft: 120 }}
            problems={at(`${base}.explanationEn`)}
          >
            <textarea
              {...described(`${base}.explanationEn`, at(`${base}.explanationEn`))}
              readOnly={ro}
              rows={2}
              lang="en"
              dir="ltr"
              value={q.explanationEn}
              onChange={(e) => dispatch({ type: 'q/text', index, field: 'explanationEn', value: e.target.value })}
            />
          </Field>
        </div>

        <div className="st-evidence-pick">
          <div className="st-grid2">
            <Field
              path={`${base}.evidenceParagraph`}
              label="Where the answer is"
              hint={
                q.kind === 'gist'
                  ? 'A gist question is about the whole story and needs none.'
                  : 'Quoted with the answer, and in the review at the end.'
              }
              problems={at(`${base}.evidenceParagraph`)}
            >
              <select
                {...described(`${base}.evidenceParagraph`, at(`${base}.evidenceParagraph`))}
                disabled={ro}
                value={ep ?? ''}
                onChange={(e) =>
                  dispatch({ type: 'q/evidence', index, paragraph: e.target.value === '' ? null : Number(e.target.value) })
                }
              >
                <option value="">Not set</option>
                {paragraphs.map((p, i) => (
                  <option key={i} value={i}>
                    Paragraph {i + 1}: {opening(p.text, 50)}
                  </option>
                ))}
                {ep !== null && !para && <option value={ep}>Paragraph {ep + 1}: not in the text any more</option>}
              </select>
            </Field>
            <Field path={`${base}.evidenceSentence`} label="Sentence" optional problems={at(`${base}.evidenceSentence`)}>
              <select
                {...described(`${base}.evidenceSentence`, at(`${base}.evidenceSentence`))}
                value={es ?? ''}
                disabled={ro || !para}
                onChange={(e) =>
                  dispatch({ type: 'q/evidence-sentence', index, sentence: e.target.value === '' ? null : Number(e.target.value) })
                }
              >
                <option value="">The whole paragraph</option>
                {sentences.map((s, i) => (
                  <option key={i} value={i}>
                    Sentence {i + 1}: {opening(s.text, 50)}
                  </option>
                ))}
                {es !== null && para && es >= sentences.length && (
                  <option value={es}>Sentence {es + 1}: not in this paragraph any more</option>
                )}
              </select>
            </Field>
          </div>
          {para && (
            <blockquote className="st-evidence" lang={script.lang} dir={script.dir}>
              {sentences.map((s, i) => (
                <span key={i}>
                  {i > 0 && ' '}
                  {i === es ? <mark>{s.text}</mark> : s.text}
                </span>
              ))}
            </blockquote>
          )}
        </div>
      </div>
    </details>
  );
}

function Actions({
  status,
  dirty,
  busy,
  conflict,
  checks,
  canSave,
  canPublish,
  onAct,
}: {
  status: AdminStory['status'] | null;
  dirty: boolean;
  busy: StoryAction | 'reload' | null;
  conflict: boolean;
  checks: LiveChecks;
  canSave: boolean;
  canPublish: boolean;
  onAct: (a: StoryAction) => void;
}): React.JSX.Element {
  const actions = availableActions(status);
  const blocking = checks.blocking.length;
  const before = checks.beforePublish.length;
  const label: Record<StoryAction, string> = {
    save: busy === 'save' ? 'Saving…' : status === 'in_review' ? 'Save' : 'Save draft',
    submit: busy === 'submit' ? 'Submitting…' : dirty ? 'Save and submit for review' : 'Submit for review',
    publish: busy === 'publish' ? 'Publishing…' : dirty ? 'Save and publish' : 'Publish',
    unpublish: busy === 'unpublish' ? 'Unpublishing…' : 'Unpublish',
    archive: busy === 'archive' ? 'Archiving…' : 'Archive',
    delete: busy === 'delete' ? 'Deleting…' : 'Delete',
  };
  const enabled: Record<StoryAction, boolean> = {
    save: canSave,
    submit: canPublish,
    publish: canPublish,
    unpublish: !busy && !conflict,
    archive: !busy && !conflict,
    delete: !busy && !conflict,
  };
  const reasons: string[] = [];
  if (conflict) reasons.push('Reload the story first.');
  else if (actions.includes('save')) {
    if (blocking > 0) reasons.push(`Fix the ${blocking === 1 ? 'problem' : `${blocking} problems`} marked “Must fix” to save.`);
    else if (before > 0) {
      reasons.push(
        `${before === 1 ? 'One problem' : `${before} problems`} to fix before it can be ${actions.includes('submit') ? 'submitted or ' : ''}published.`,
      );
    } else if (!dirty && status !== null) reasons.push('No unsaved changes.');
  }
  return (
    <div className="card st-actions">
      <div className="st-actions-main">
        {actions
          .filter((a) => a === 'save' || a === 'submit' || a === 'publish' || a === 'unpublish')
          .map((a) => (
            <button
              key={a}
              type="button"
              className={a === 'publish' || (a === 'save' && !actions.includes('publish')) ? 'primary' : undefined}
              disabled={!enabled[a]}
              onClick={() => onAct(a)}
            >
              {label[a]}
            </button>
          ))}
      </div>
      {reasons.map((r) => (
        <div key={r} className="subtle st-reason">
          {r}
        </div>
      ))}
      {(actions.includes('archive') || actions.includes('delete')) && (
        <div className="row st-actions-rest">
          {actions.includes('archive') && (
            <button type="button" disabled={!enabled.archive} onClick={() => onAct('archive')}>
              {label.archive}
            </button>
          )}
          {actions.includes('delete') && (
            <button type="button" className="danger" disabled={!enabled.delete} onClick={() => onAct('delete')}>
              {label.delete}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Checks({
  checks,
  server,
  onGo,
}: {
  checks: LiveChecks;
  server: StoryValidation | null;
  onGo: (path: string) => void;
}): React.JSX.Element {
  // what the server refused is not cleared by the live checks agreeing: it is cleared by the next edit
  const clear = checks.blocking.length === 0 && checks.beforePublish.length === 0 && !server?.errors.length;
  return (
    <section className="card st-checks" aria-labelledby="st-checks-title">
      <h2 className="st-h2" id="st-checks-title">
        Checks
      </h2>
      {server && server.errors.length > 0 && (
        <CheckGroup title="The server refused it" tone="error" list={server.errors} onGo={onGo} />
      )}
      {checks.blocking.length > 0 && <CheckGroup title="Must fix to save" tone="error" list={checks.blocking} onGo={onGo} />}
      {checks.beforePublish.length > 0 && (
        <CheckGroup title="Before it can be published" tone="publish" list={checks.beforePublish} onGo={onGo} />
      )}
      {checks.warnings.length > 0 && <CheckGroup title="Worth a look" tone="warning" list={checks.warnings} onGo={onGo} />}
      {clear && (
        <div className="st-clear">
          ✓ {checks.warnings.length > 0 ? 'Nothing stops it being published.' : 'Nothing to fix.'}
        </div>
      )}
    </section>
  );
}

function CheckGroup({
  title,
  tone,
  list,
  onGo,
}: {
  title: string;
  tone: Tone;
  list: readonly StoryProblem[];
  onGo: (path: string) => void;
}): React.JSX.Element {
  return (
    <details className={`st-check-group is-${tone}`} open>
      <summary>
        {title} ({list.length})
      </summary>
      <ul>
        {list.map((p, i) => (
          <li key={i}>
            <button type="button" className="ghost st-go" onClick={() => onGo(p.path)}>
              <span className="st-where">{describePath(p.path)}</span>
              <span>{p.message}</span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
