import { describe, expect, it } from 'vitest';
import { lessonAudioKey, validateStory, type StoryDialect, type StoryLength } from '@kurda/shared';
import { Cache, type CacheClient } from '../cache/cache.js';
import { testStory } from '../test/stories.js';
import { tidyStory } from './admin-service.js';
import { storyInputFrom } from './schema.js';
import { bustStoryLists, storyTextFacts } from './service.js';

describe('storyTextFacts', () => {
  it('counts the words, names the length and keys every sentence the reader can play, once', () => {
    const body = 'Silav. Ez Rojîn im.\n\n* * *\n\nSilav! Ez li malê me.';
    const facts = storyTextFacts('kurmanci', body);
    expect(facts.wordCount).toBe(9);
    // nine words is not a short story yet
    expect(facts.length).toBeNull();
    // "Silav." and "Silav!" are one recording; the scene break is nothing to say
    expect(facts.sentenceKeys).toEqual(['silav', 'ez rojîn im', 'ez li malê me']);
    expect(storyTextFacts('kurmanci', '').sentenceKeys).toEqual([]);
  });

  it('names the length by the variety’s own bands', () => {
    const story = testStory('x-facts', { dialect: 'sorani', length: 'medium' });
    expect(storyTextFacts('sorani', story.body).length).toBe('medium');
    expect(storyTextFacts('sorani', story.body).sentenceKeys).toEqual([lessonAudioKey('ژیان لە گوندێکی بچووک دەژی.')]);
  });
});

describe('bustStoryLists', () => {
  it('forgets the list for every filter, the unfiltered one included', async () => {
    const deleted: string[] = [];
    const client: CacheClient = {
      get: async () => null,
      set: async () => 'OK',
      del: async (key) => {
        deleted.push(key);
        return 1;
      },
    };
    await bustStoryLists(new Cache(client));
    // 3 dialect choices (either, or none) × 4 lengths × 4 levels
    expect(deleted).toHaveLength(48);
    expect(new Set(deleted).size).toBe(48);
    expect(deleted).toContain('kurda:stories:list:*:*:*');
    expect(deleted).toContain('kurda:stories:list:sorani:long:3');
    expect(deleted).toContain('kurda:stories:list:kurmanci:*:1');
  });

  it('does nothing without a cache, and survives one that fails', async () => {
    await expect(bustStoryLists(null)).resolves.toBeUndefined();
    const broken: CacheClient = {
      get: async () => null,
      set: async () => 'OK',
      del: async () => {
        throw new Error('redis is down');
      },
    };
    await expect(bustStoryLists(new Cache(broken))).resolves.toBeUndefined();
  });
});

describe('tidyStory', () => {
  it('stores what was meant: trimmed, one line ending, empty optional fields as null', () => {
    const tidy = tidyStory({
      dialect: 'kurmanci',
      level: 1,
      title: '  Qelema Şîn ',
      summary: '   ',
      body: '\r\nYek.\r\n\r\nDu.\r\n',
      glossary: [{ term: ' qelem ', meanings: { en: ' pen ', de: '  ' } }],
      questions: [
        {
          kind: 'detail',
          prompt: ' Çi? ',
          promptEn: '',
          options: [' a ', 'b'],
          correctIndex: 0,
          explanation: ' ',
          explanationEn: null,
          evidenceParagraph: null,
          evidenceSentence: null,
        },
      ],
    });
    expect(tidy).toMatchObject({
      title: 'Qelema Şîn',
      summary: null,
      body: 'Yek.\n\nDu.',
      glossary: [{ term: 'qelem', meanings: { en: 'pen' } }],
      questions: [{ prompt: 'Çi?', promptEn: null, options: ['a', 'b'], explanation: null }],
    });
    // a gloss without English keeps an empty one, for validateStory to ask for
    expect(tidyStory({ ...tidy, glossary: [{ term: 'x', meanings: { de: 'y' } as never }] }).glossary[0]!.meanings).toEqual({
      de: 'y',
      en: '',
    });
  });
});

describe('the test stories', () => {
  it('are whole stories, in both varieties and every length', () => {
    for (const dialect of ['kurmanci', 'sorani'] as StoryDialect[]) {
      for (const length of ['short', 'medium', 'long'] as StoryLength[]) {
        const story = testStory(`x-${dialect}-${length}`, { dialect, length });
        expect(storyTextFacts(dialect, story.body).length).toBe(length);
        expect(validateStory(storyInputFrom(story as never), 'publish')).toEqual({ errors: [], warnings: [] });
      }
    }
  });
});
