/**
 * The admin stories API, as the list and the editor use it: the calls, what a
 * refusal means, and the two-step actions ("save and publish").
 *
 *   GET    /admin/stories?q&status&dialect&level&category&review&featured&limit&offset
 *                                            a page of stories with their problem counts: { stories, total }
 *   GET    /admin/stories/:id                one story with its questions, dictionary links, recordings and versions
 *   POST   /admin/stories                    a new draft
 *   PUT    /admin/stories/:id                replace a draft or a story in review: { …story, lockVersion, sameStoryAs? }
 *   POST   /admin/stories/:id/{submit|publish|unpublish|archive}   { lockVersion }
 *   POST   /admin/stories/:id/review         { approved, note?, lockVersion }: approve, or withdraw approval
 *   POST   /admin/stories/:id/feature        { featured, lockVersion }: the library's Featured row
 *   DELETE /admin/stories/:id?lockVersion=   only a story no game has used (else 409 IN_USE)
 *
 *   GET    /admin/story-categories           every category, in position order
 *   POST   /admin/story-categories           { slug, name, position? }
 *   PUT    /admin/story-categories/:slug     { name, position? }
 *   DELETE /admin/story-categories/:slug     409 IN_USE with the count, unless ?force=1 (its stories are left unfiled)
 *
 * Every change to a story carries the `lockVersion` the editor loaded, so two
 * people editing one story cannot silently overwrite each other: the second
 * gets 409 STALE and is asked to reload. Publishing needs a reviewer's
 * approval first (409 NOT_REVIEWED).
 */
import type { StoryCategory, StoryDialect, StoryProblem, StoryValidation } from '@kurda/shared';
import { api, ApiError } from './api';
import {
  STATUS_TABS,
  draftFromForm,
  listParams,
  type AdminStory,
  type AdminStorySummary,
  type ListFilter,
  type StoryAction,
  type StoryForm,
  type StoryStatus,
} from './stories';

const BASE = '/admin/stories';
const CATEGORIES = '/admin/story-categories';

function at(id: string): string {
  return `${BASE}/${encodeURIComponent(id)}`;
}

export interface StoryPage {
  stories: AdminStorySummary[];
  total: number;
}

/** One page of the list, filtered and paged by the server. */
export function listStories(filter: ListFilter, page = 0): Promise<StoryPage> {
  return api<StoryPage>(`${BASE}?${listParams(filter, page)}`);
}

/**
 * How many stories each status tab would show under the other filters: one
 * request per status, asking for a single row and reading the total. The
 * server pages the list, so the counts cannot be read off the page on screen.
 */
export async function statusCounts(filter: ListFilter): Promise<Record<StoryStatus | 'all', number>> {
  const statuses = STATUS_TABS.filter((s): s is StoryStatus => s !== 'all');
  const totals = await Promise.all(statuses.map((status) => listStories({ ...filter, status }, 0).then((p) => p.total)));
  const counts = { all: 0 } as Record<StoryStatus | 'all', number>;
  statuses.forEach((status, i) => {
    counts[status] = totals[i]!;
    counts.all += totals[i]!;
  });
  return counts;
}

/** The published stories (up to the server's largest page), for what learners can play today. */
export async function publishedStories(): Promise<StoryPage> {
  return api<StoryPage>(`${BASE}?status=published&limit=100`);
}

/** Stories whose title or address contains `q`, in one variety, for the Versions picker. */
export async function searchStories(q: string, dialect: StoryDialect | 'all'): Promise<AdminStorySummary[]> {
  const p = new URLSearchParams({ q: q.trim().slice(0, 80), limit: '10' });
  if (dialect !== 'all') p.set('dialect', dialect);
  return (await api<StoryPage>(`${BASE}?${p}`)).stories;
}

export function getStory(id: string): Promise<AdminStory> {
  return api<AdminStory>(at(id));
}

/** Approve a story, or withdraw its approval, with an optional note for the record. */
export function reviewStory(story: Pick<AdminStory, 'id' | 'lockVersion'>, approved: boolean, note: string | null): Promise<AdminStory> {
  return api<AdminStory>(`${at(story.id)}/review`, { method: 'POST', body: { approved, note, lockVersion: story.lockVersion } });
}

/** Put a story in the library's Featured row, or take it out. */
export function featureStory(story: Pick<AdminStory, 'id' | 'lockVersion'>, featured: boolean): Promise<AdminStory> {
  return api<AdminStory>(`${at(story.id)}/feature`, { method: 'POST', body: { featured, lockVersion: story.lockVersion } });
}

// ── categories ──────────────────────────────────────────────────────────────

export interface CategoryInput {
  name: StoryCategory['name'];
  position?: number | null;
}

export async function listCategories(): Promise<StoryCategory[]> {
  return (await api<{ categories: StoryCategory[] }>(CATEGORIES)).categories;
}

export function createCategory(slug: string, input: CategoryInput): Promise<StoryCategory> {
  return api<StoryCategory>(CATEGORIES, { method: 'POST', body: { slug, ...input } });
}

export function updateCategory(slug: string, input: CategoryInput): Promise<StoryCategory> {
  return api<StoryCategory>(`${CATEGORIES}/${encodeURIComponent(slug)}`, { method: 'PUT', body: input });
}

/** Delete a category; `force` takes it off the stories filed under it (they are left unfiled). */
export function deleteCategory(slug: string, force = false): Promise<{ slug: string; deleted: true; unfiled: number }> {
  return api(`${CATEGORIES}/${encodeURIComponent(slug)}${force ? '?force=1' : ''}`, { method: 'DELETE' });
}

/** How many stories are filed under each category: one single-row page per category, reading its total. */
export async function categoryCounts(slugs: readonly string[]): Promise<Record<string, number>> {
  const totals = await Promise.all(slugs.map((slug) => api<StoryPage>(`${BASE}?category=${encodeURIComponent(slug)}&limit=1`).then((p) => p.total)));
  return Object.fromEntries(slugs.map((slug, i) => [slug, totals[i]!]));
}

/** The stories a category delete was refused for (409 IN_USE), or null when that is not what went wrong. */
export function categoryInUse(err: unknown): number | null {
  if (!(err instanceof ApiError) || err.code !== 'IN_USE') return null;
  const count = (err.details as { count?: unknown } | undefined)?.count;
  return typeof count === 'number' ? count : 0;
}

// ── refusals ────────────────────────────────────────────────────────────────

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
  /** no reviewer has approved it, so it cannot be published yet */
  | { kind: 'not_reviewed'; message: string }
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
    case 'NOT_REVIEWED':
      return { kind: 'not_reviewed', message };
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
