/**
 * Guards the starter Stories (api/content/stories/*.json) so a story the native
 * reviewer edits, or one added later, is caught in CI rather than when a game
 * quotes it. Everything is checked with the shared helpers the reader, the
 * audio studio and the API use: a sentence counted here is the sentence the
 * reader highlights, the studio records and a reveal quotes.
 *
 * The starters are seeded as drafts, and a draft may be unfinished — but these
 * are the files a native speaker publishes as they stand, so they are held to
 * what a published story must be: a question bank big enough for its length,
 * and evidence for every reveal down to the sentence.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  LESSON_AUDIO_TEXT_MAX,
  MIN_QUESTION_BANK,
  QUESTION_EXPLANATION_MAX,
  countStoryWords,
  glossSpans,
  normalizeKurdish,
  storyAudioSentences,
  storyLengthFor,
  storyParagraphs,
  storySentences,
  type StoryDialect,
  type StoryGlossEntry,
} from '@kurda/shared';

interface StarterQuestion {
  kind: string;
  explanation: string;
  explanationEn: string;
  evidenceParagraph: number | null;
  evidenceSentence?: number | null;
}

interface StarterStory {
  slug: string;
  dialect: StoryDialect;
  body: string;
  glossary: StoryGlossEntry[];
  questions: StarterQuestion[];
}

const read = (name: string): StarterStory[] =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../content/stories/${name}`, import.meta.url)), 'utf8')).stories;

const stories = [...read('kurmanci.json'), ...read('sorani.json')];

/**
 * The reader and the studio cut a sentence after any full stop, so a sentence
 * ending in one of these is cut short; stories write the word out (the
 * contract's list, and the Soranî "etc.").
 */
const ABBREVIATIONS = ['dr.', 'prof.', 'hwd.', 'b.z.', 'p.z.', 'هتد.'];

/**
 * Speech opened by a dash (at the start, or after a colon or a sentence end)
 * and closed by another, the narration going on after it.
 */
const DASH_SPEECH = /(?:^|[:.!?؟…])\s*[—–―]\s*([^—–―]+)[—–―]/g;

describe('the starter stories', () => {
  it('hold both varieties, at least the eight starters of each', () => {
    expect(stories.filter((s) => s.dialect === 'kurmanci').length).toBeGreaterThanOrEqual(8);
    expect(stories.filter((s) => s.dialect === 'sorani').length).toBeGreaterThanOrEqual(8);
  });

  describe.each(stories.map((s) => [s.slug, s] as const))('%s', (_slug, story) => {
    const paragraphs = storyParagraphs(story.body);

    it('is one length, with enough questions to publish it at that length', () => {
      const length = storyLengthFor(story.dialect, countStoryWords(story.body));
      expect(length).not.toBeNull();
      // more questions than the largest count a game asks, so a replay is not the same quiz
      expect(story.questions.length).toBeGreaterThanOrEqual(MIN_QUESTION_BANK[length!]);
    });

    it('points every question but the gist at the sentence that answers it', () => {
      const problems: string[] = [];
      story.questions.forEach((q, i) => {
        const p = q.evidenceParagraph;
        const s = q.evidenceSentence;
        if (q.kind === 'gist') {
          // the gist is about the whole story; there is no one place to quote
          if (p !== null || (s ?? null) !== null) problems.push(`q${i}: a gist item cites ${p}.${s}`);
          return;
        }
        if (p === null || p < 0 || p >= paragraphs.length) {
          problems.push(`q${i}: evidenceParagraph ${p} of ${paragraphs.length}`);
          return;
        }
        const sentences = storySentences(paragraphs[p]!);
        if (typeof s !== 'number' || !Number.isInteger(s) || s < 0 || s >= sentences.length) {
          problems.push(`q${i}: evidenceSentence ${s} of ${sentences.length} in paragraph ${p}`);
          return;
        }
        // the reveal quotes it, so it is something a reader can read (and the studio record)
        if (!storyAudioSentences(paragraphs[p]!).includes(sentences[s]!)) problems.push(`q${i}: cites “${sentences[s]}”`);
      });
      expect(problems).toEqual([]);
    });

    it('keeps every explanation to the one line the reveal has room for', () => {
      const long = story.questions.flatMap((q, i) =>
        [q.explanation, q.explanationEn].filter((e) => e.trim().length > QUESTION_EXPLANATION_MAX).map((e) => `q${i}: ${e}`),
      );
      expect(long).toEqual([]);
    });

    it('glosses only words the reader marks', () => {
      const marked = new Set(paragraphs.flatMap((p) => glossSpans(p, story.glossary).map((span) => span.entry)));
      expect(story.glossary.filter((entry) => !marked.has(entry)).map((entry) => entry.term)).toEqual([]);
    });

    it('cuts into sentences only where its sentences end, each short enough to record', () => {
      const problems: string[] = [];
      paragraphs.forEach((paragraph, p) => {
        // a "1. …" list is cut at every number
        if (/(^|\s)\(?\p{Nd}{1,3}[.)]\s/u.test(paragraph)) problems.push(`paragraph ${p}: a numbered list`);
        // and dash dialogue after every ! or ?, even where the narration goes on: "Wî got: — Were! — û çû."
        for (const m of paragraph.matchAll(DASH_SPEECH)) {
          if (/[!?؟]["”»]?$/.test(m[1]!.trimEnd())) problems.push(`paragraph ${p}: dash dialogue “${m[0]}”`);
        }
        for (const sentence of storySentences(paragraph)) {
          if (normalizeKurdish(sentence).length > LESSON_AUDIO_TEXT_MAX) problems.push(`too long to record: ${sentence}`);
          const lower = sentence.toLowerCase();
          if (ABBREVIATIONS.some((a) => lower === a || lower.endsWith(` ${a}`))) problems.push(`ends in an abbreviation: ${sentence}`);
          // a sentence that opens with a dash, or in Kurmancî (which has capitals) lower-case, was cut mid-sentence
          if (/^[—–―]/.test(sentence) || (story.dialect === 'kurmanci' && /^["“]?[a-zçêîşû]/.test(sentence))) {
            problems.push(`cut mid-sentence: ${sentence}`);
          }
        }
      });
      expect(problems).toEqual([]);
    });
  });
});
