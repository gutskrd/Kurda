/**
 * A story's wire shape: what the admin routes accept and what an import file holds (api/content/stories/*.json).
 *
 * Deliberately loose about content: Zod checks types and size, while length limits, empty options or missing glosses
 * are `validateStory`'s to report, with a field path the editor can show, and because drafts may be unfinished in ways
 * a schema cannot express.
 *
 * The library fields (category, tradition, attribution, translations, cover, reading time) and the legend extras
 * (per-language title and summary, reflections, notes, sources, translation review, question translations) are
 * optional, so older content files still import.
 */
import { z } from 'zod';
import { STORY_CATEGORY_SLUG_PATTERN, STORY_DIALECTS, STORY_SLUG_PATTERN, type StoryGlossEntry, type StoryInput } from '@kurda/shared';

/** Far past every content limit; only here so a request cannot be megabytes. */
const text = (max: number) => z.string().max(max);

export const glossEntrySchema = z.object({
  term: text(600),
  meanings: z.object({ en: text(1200) }).catchall(text(1200)),
  // the server fills these in; a client that echoes them back is not believed
  entryId: z.string().nullish(),
  pos: z.string().nullish(),
  audioUrl: z.string().nullish(),
});

/** A question in one interface language; its options in the order of the Kurdish ones. */
export const questionTranslationSchema = z.object({
  prompt: text(3000),
  options: z.array(text(1600)).max(10),
  explanation: text(1600).nullish(),
});

/** A map keyed by interface language (which `validateStory` checks), kept to a sane number of keys. */
const byLocale = <T extends z.ZodType>(value: T) => z.record(text(20), value).refine((m) => Object.keys(m).length <= 20, 'too many languages');

export const storyQuestionSchema = z.object({
  kind: text(40),
  prompt: text(3000),
  promptEn: text(3000).nullish(),
  options: z.array(text(1600)).max(10),
  correctIndex: z.number().int(),
  explanation: text(1600).nullish(),
  explanationEn: text(1600).nullish(),
  evidenceParagraph: z.number().int().min(0).max(1000).nullish(),
  evidenceSentence: z.number().int().min(0).max(1000).nullish(),
  translations: byLocale(questionTranslationSchema).optional(),
});

export const metaTranslationSchema = z.object({ title: text(1200).nullish(), summary: text(3000).nullish() });
export const noteTranslationSchema = z.object({ title: text(1200), body: text(24_000) });

export const reflectionSchema = z.object({ text: text(4000), translations: byLocale(text(4000)).default({}) });
export const noteSchema = z.object({ kind: text(40), title: text(1200), body: text(24_000), translations: byLocale(noteTranslationSchema).default({}) });
export const sourceSchema = z.object({
  title: text(3000),
  author: text(1200).nullish(),
  url: text(5000).nullish(),
  type: text(40),
  note: text(3000).nullish(),
});
export const translationReviewSchema = byLocale(
  z.object({ status: text(20), by: text(80).optional(), at: text(80).optional(), note: text(6000).nullish() }),
);

export const storySlugSchema = z.string().regex(STORY_SLUG_PATTERN, 'lower-case letters, digits and dashes, 3 to 80 of them');
export const categorySlugSchema = z.string().regex(STORY_CATEGORY_SLUG_PATTERN, 'lower-case letters, digits and dashes, 2 to 40 of them');

/** Everything about a story an editor writes, apart from its slug. */
export const storyContentSchema = z.object({
  dialect: z.enum(STORY_DIALECTS),
  language: text(10).optional(),
  level: z.number().int(),
  title: text(1200),
  summary: text(3000).nullish(),
  body: text(40_000).default(''),
  glossary: z.array(glossEntrySchema).max(100).default([]),
  questions: z.array(storyQuestionSchema).max(100).default([]),
  category: text(200).nullish(),
  tradition: text(40).default('original'),
  author: text(1200).nullish(),
  source: text(3000).nullish(),
  sourceUrl: text(5000).nullish(),
  attributionNote: text(6000).nullish(),
  translations: z.record(text(20), text(60_000)).default({}),
  cover: text(800).nullish(),
  readingMinutes: z.number().int().nullish(),
  metaTranslations: byLocale(metaTranslationSchema).default({}),
  reflections: z.array(reflectionSchema).max(20).default([]),
  notes: z.array(noteSchema).max(20).default([]),
  sources: z.array(sourceSchema).max(20).default([]),
  /** files only: the admin routes leave it out of what they take (see admin-routes.ts) */
  translationReview: translationReviewSchema.optional(),
});

/**
 * An import file: `{ stories: [...] }`, each with its slug. A starter file may hold none yet; it seeds nothing and the
 * import reports nothing to import.
 */
export const storyFileSchema = z.object({
  stories: z.array(storyContentSchema.extend({ slug: storySlugSchema })),
});

export type StoryContent = z.infer<typeof storyContentSchema>;

/** The parsed form, with every optional field present: the shape `validateStory` checks (the defaults repeat zod's, for a caller that skipped it). */
type Companions = 'metaTranslations' | 'reflections' | 'notes' | 'sources';

export function storyInputFrom(content: Omit<StoryContent, Companions> & Partial<Pick<StoryContent, Companions>>): StoryInput {
  return {
    dialect: content.dialect,
    language: content.language ?? 'ku',
    level: content.level,
    title: content.title,
    summary: content.summary ?? null,
    body: content.body,
    // whatever a client sent for the dictionary link is dropped: the server resolves it on save
    glossary: (content.glossary ?? []).map((g) => ({ term: g.term, meanings: g.meanings })) as StoryGlossEntry[],
    questions: (content.questions ?? []).map((q) => ({
      kind: q.kind,
      prompt: q.prompt,
      promptEn: q.promptEn ?? null,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.explanation ?? null,
      explanationEn: q.explanationEn ?? null,
      evidenceParagraph: q.evidenceParagraph ?? null,
      evidenceSentence: q.evidenceSentence ?? null,
      ...(q.translations
        ? {
            translations: Object.fromEntries(
              Object.entries(q.translations).map(([locale, t]) => [
                locale,
                { prompt: t.prompt, options: t.options, ...(t.explanation ? { explanation: t.explanation } : {}) },
              ]),
            ),
          }
        : {}),
    })),
    category: content.category ?? null,
    tradition: content.tradition ?? 'original',
    author: content.author ?? null,
    source: content.source ?? null,
    sourceUrl: content.sourceUrl ?? null,
    attributionNote: content.attributionNote ?? null,
    translations: content.translations ?? {},
    cover: content.cover ?? null,
    readingMinutes: content.readingMinutes ?? null,
    // each left out when the request left it out, so a save from an editor that does not know it keeps what is stored
    ...(content.metaTranslations !== undefined
      ? {
          metaTranslations: Object.fromEntries(
            Object.entries(content.metaTranslations).map(([locale, m]) => [
              locale,
              { ...(m.title ? { title: m.title } : {}), ...(m.summary ? { summary: m.summary } : {}) },
            ]),
          ),
        }
      : {}),
    ...(content.reflections !== undefined ? { reflections: content.reflections.map((r) => ({ text: r.text, translations: r.translations ?? {} })) } : {}),
    ...(content.notes !== undefined
      ? { notes: content.notes.map((n) => ({ kind: n.kind, title: n.title, body: n.body, translations: n.translations ?? {} })) }
      : {}),
    ...(content.sources !== undefined
      ? {
          sources: content.sources.map((src) => ({
            title: src.title,
            type: src.type,
            ...(src.author ? { author: src.author } : {}),
            ...(src.url ? { url: src.url } : {}),
            ...(src.note ? { note: src.note } : {}),
          })),
        }
      : {}),
    ...(content.translationReview
      ? {
          translationReview: Object.fromEntries(
            Object.entries(content.translationReview).map(([locale, r]) => [
              locale,
              {
                status: r.status as 'unreviewed' | 'reviewed',
                ...(r.by ? { by: r.by } : {}),
                ...(r.at ? { at: r.at } : {}),
                ...(r.note ? { note: r.note } : {}),
              },
            ]),
          ),
        }
      : {}),
  };
}

/** A category's name: English, and any other interface language. */
export const categoryNameSchema = z.object({ en: text(600) }).catchall(text(600));
