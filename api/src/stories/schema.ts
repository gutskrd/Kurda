/**
 * The shape of a story on the wire: what the admin routes accept and what an
 * import file holds (api/content/stories/*.json).
 *
 * Deliberately loose about content. Zod checks types and keeps a request to a
 * sane size; whether a title is too long, an option empty or a gloss missing
 * from the text is `validateStory`'s to say, because it says it with a path
 * and a reason the editor can show beside the field — and because a draft is
 * allowed to be unfinished in ways a schema cannot express.
 */
import { z } from 'zod';
import { STORY_DIALECTS, STORY_SLUG_PATTERN, type StoryGlossEntry, type StoryInput } from '@kurda/shared';

/** Far past every content limit; only here so a request cannot be megabytes. */
const text = (max: number) => z.string().max(max);

export const glossEntrySchema = z.object({
  term: text(600),
  meanings: z.object({ en: text(1200) }).catchall(text(1200)),
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

/** Everything about a story an editor writes, apart from its slug. */
export const storyContentSchema = z.object({
  dialect: z.enum(STORY_DIALECTS),
  level: z.number().int(),
  title: text(1200),
  summary: text(3000).nullish(),
  body: text(20_000).default(''),
  glossary: z.array(glossEntrySchema).max(100).default([]),
  questions: z.array(storyQuestionSchema).max(100).default([]),
});

/** An import file: `{ stories: [...] }`, each with its slug. */
export const storyFileSchema = z.object({
  stories: z.array(storyContentSchema.extend({ slug: storySlugSchema })).min(1),
});

export type StoryContent = z.infer<typeof storyContentSchema>;

/** The parsed form, with every optional field present: the shape `validateStory` checks. */
export function storyInputFrom(content: StoryContent): StoryInput {
  return {
    dialect: content.dialect,
    level: content.level,
    title: content.title,
    summary: content.summary ?? null,
    body: content.body,
    glossary: content.glossary as StoryGlossEntry[],
    questions: content.questions.map((q) => ({
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
  };
}
