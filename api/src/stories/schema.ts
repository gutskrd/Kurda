/**
 * The shape of a story on the wire: what the admin routes accept and what an
 * import file holds (api/content/stories/*.json).
 *
 * Deliberately loose about content. Zod checks types and keeps a request to a
 * sane size; whether a title is too long, an option empty or a gloss missing
 * from the text is `validateStory`'s to say, because it says it with a path
 * and a reason the editor can show beside the field — and because a draft is
 * allowed to be unfinished in ways a schema cannot express.
 *
 * The library fields (category, tradition, attribution, translations, cover,
 * reading time) are all optional on the wire: a content file written before
 * the library existed still imports, as a story with the defaults an editor
 * has yet to fill in.
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
});

export const storySlugSchema = z.string().regex(STORY_SLUG_PATTERN, 'lower-case letters, digits and dashes, 3 to 80 of them');
export const categorySlugSchema = z.string().regex(STORY_CATEGORY_SLUG_PATTERN, 'lower-case letters, digits and dashes, 2 to 40 of them');

/** Everything about a story an editor writes, apart from its slug. */
export const storyContentSchema = z.object({
  dialect: z.enum(STORY_DIALECTS),
  language: text(10).optional(),
  level: z.number().int(),
  title: text(1200),
  summary: text(3000).nullish(),
  body: text(20_000).default(''),
  glossary: z.array(glossEntrySchema).max(100).default([]),
  questions: z.array(storyQuestionSchema).max(100).default([]),
  category: text(200).nullish(),
  tradition: text(40).default('original'),
  author: text(1200).nullish(),
  source: text(3000).nullish(),
  sourceUrl: text(5000).nullish(),
  attributionNote: text(6000).nullish(),
  translations: z.record(text(20), text(30_000)).default({}),
  cover: text(800).nullish(),
  readingMinutes: z.number().int().nullish(),
});

/** An import file: `{ stories: [...] }`, each with its slug. */
export const storyFileSchema = z.object({
  stories: z.array(storyContentSchema.extend({ slug: storySlugSchema })).min(1),
});

export type StoryContent = z.infer<typeof storyContentSchema>;

/** The parsed form, with every optional field present: the shape `validateStory` checks (the defaults repeat zod's, for a caller that skipped it). */
export function storyInputFrom(content: StoryContent): StoryInput {
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
  };
}

/** A category's name: English, and any other interface language. */
export const categoryNameSchema = z.object({ en: text(600) }).catchall(text(600));
