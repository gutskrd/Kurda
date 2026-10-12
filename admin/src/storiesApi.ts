/**
 * The admin stories API, as the editor uses it: the calls, what a refusal
 * means, and the two-step actions ("save and publish").
 *
 *   GET    /admin/stories                    every story, with its problem counts
 *   GET    /admin/stories/:id                one story with its questions
 *   POST   /admin/stories                    a new draft
 *   PUT    /admin/stories/:id                replace a draft or a story in review: { …story, lockVersion }
 *   POST   /admin/stories/:id/{submit|publish|unpublish|archive}   { lockVersion }
 *   DELETE /admin/stories/:id?lockVersion=   only a story no game has used (else 409 IN_USE)
 *
 * Every change carries the `lockVersion` the editor loaded, so two people
 * editing one story cannot silently overwrite each other: the second gets
 * 409 STALE and is asked to reload.
 */
import type { StoryProblem, StoryValidation } from '@kurda/shared';
import { api, ApiError } from './api';
import { draftFromForm, type AdminStory, type AdminStorySummary, type StoryAction, type StoryForm } from './stories';

const BASE = '/admin/stories';

function at(id: string): string {
  return `${BASE}/${encodeURIComponent(id)}`;
}

export async function listStories(): Promise<AdminStorySummary[]> {
  return (await api<{ stories: AdminStorySummary[] }>(BASE)).stories;
}

export function getStory(id: string): Promise<AdminStory> {
  return api<AdminStory>(at(id));
}

export type StoryFailure =
  /** someone changed the story since it was loaded: reload before going on */
  | { kind: 'stale'; message: string }
  /** the server found problems; `validation` has them by field when it said which */
  | { kind: 'invalid'; message: string; validation: StoryValidation | null }
  | { kind: 'slug_taken'; message: string }
  /** a game has used the story, so it cannot be deleted (archive it instead) */
  | { kind: 'in_use'; message: string }
  /** its status changed under the editor (published, archived) */
  | { kind: 'state'; message: string }
  | { kind: 'not_found'; message: string }
  | { kind: 'forbidden'; message: string }
  | { kind: 'other'; message: string };

function isProblemList(v: unknown): v is StoryProblem[] {
  return (
    Array.isArray(v) &&
    v.every((p) => typeof p === 'object' && p !== null && typeof (p as StoryProblem).path === 'string' && typeof (p as StoryProblem).message === 'string')
  );
}

/**
 * A request-schema refusal (400 VALIDATION_ERROR) names fields the zod way,
 * 'questions.0.options.1'; the editor files problems the validateStory way,
 * 'questions[0].options[1]', so the same field shows it.
 */
function requestIssues(details: unknown): StoryProblem[] {
  if (!Array.isArray(details)) return [];
  return details.flatMap((issue) => {
    if (typeof issue !== 'object' || issue === null) return [];
    const { path, message } = issue as { path?: unknown; message?: unknown };
    if (typeof path !== 'string' || typeof message !== 'string') return [];
    return [{ code: 'REQUEST', path: path.replace(/\.(\d+)(?=\.|$)/g, '[$1]'), message }];
  });
}

/** What a failed call means for the editor. */
export function storyFailure(err: unknown): StoryFailure {
  if (!(err instanceof ApiError)) {
    return { kind: 'other', message: err instanceof Error ? err.message : 'Something went wrong' };
  }
  const { message } = err;
  switch (err.code) {
    case 'STALE':
      return { kind: 'stale', message };
    case 'INVALID': {
      const d = err.details as { errors?: unknown; warnings?: unknown } | undefined;
      const validation =
        d && isProblemList(d.errors) ? { errors: d.errors, warnings: isProblemList(d.warnings) ? d.warnings : [] } : null;
      return { kind: 'invalid', message, validation };
    }
    case 'VALIDATION_ERROR': {
      const errors = requestIssues(err.details);
      return { kind: 'invalid', message, validation: errors.length > 0 ? { errors, warnings: [] } : null };
    }
    case 'SLUG_TAKEN':
      return { kind: 'slug_taken', message };
    case 'IN_USE':
      return { kind: 'in_use', message };
    case 'NOT_EDITABLE':
    case 'BAD_STATE':
      return { kind: 'state', message };
    case 'NOT_FOUND':
      return { kind: 'not_found', message };
  }
  if (err.status === 403) return { kind: 'forbidden', message };
  return { kind: 'other', message };
}

export type ActionOutcome =
  /** `story` is the story as it now is, or null once deleted */
  | { ok: true; story: AdminStory | null }
  /**
   * `story` is set when an earlier step went through — "save and publish"
   * that saved, then could not publish — so the editor keeps what was saved
   * (and its new lockVersion) rather than the copy it started with.
   */
  | { ok: false; failure: StoryFailure; story: AdminStory | null };

/**
 * Do one thing to a story.
 *
 * Submit and publish check the story as it is stored, so unsaved edits are
 * saved first ("Save and publish"): what a reviewer publishes is what they are
 * looking at. A new story is created by its first save. Unpublish, archive and
 * delete act on what is stored; the page asks before it discards edits.
 */
export async function runStoryAction(
  action: StoryAction,
  ctx: { story: AdminStory | null; form: StoryForm; dirty: boolean },
): Promise<ActionOutcome> {
  let current = ctx.story;
  try {
    if (action === 'delete') {
      if (!current) return { ok: true, story: null };
      await api(`${at(current.id)}?lockVersion=${current.lockVersion}`, { method: 'DELETE' });
      return { ok: true, story: null };
    }
    const saves = action === 'save' || ((action === 'submit' || action === 'publish') && (ctx.dirty || !current));
    if (saves) {
      const draft = draftFromForm(ctx.form);
      current = current
        ? await api<AdminStory>(at(current.id), { method: 'PUT', body: { ...draft, lockVersion: current.lockVersion } })
        : await api<AdminStory>(BASE, { method: 'POST', body: draft });
    }
    if (action === 'save') return { ok: true, story: current };
    if (!current) return { ok: false, failure: { kind: 'not_found', message: 'save the story first' }, story: null };
    const saved = current;
    current = await api<AdminStory>(`${at(saved.id)}/${action}`, {
      method: 'POST',
      body: { lockVersion: saved.lockVersion },
    });
    return { ok: true, story: current };
  } catch (err) {
    // `current` is still what the last successful step returned (or the story as loaded)
    return { ok: false, failure: storyFailure(err), story: current !== ctx.story ? current : null };
  }
}
