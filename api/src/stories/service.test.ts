import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { lessonAudioKey, validateStory, type StoryDialect, type StoryLength } from '@kurda/shared';
import { Cache, type CacheClient } from '../cache/cache.js';
import { testStory } from '../test/stories.js';
import { tidyStory } from './admin-service.js';
import { storyInputFrom } from './schema.js';
import { StoriesService, bustStoryLists, storyTextFacts } from './service.js';

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

/** Redis as the cache sees it, in memory; `down` makes every command fail. */
function memoryRedis(): CacheClient & { store: Map<string, string>; down: boolean } {
  const store = new Map<string, string>();
  const up = () => {
    if (redis.down) throw new Error('redis is down');
  };
  const redis = {
    store,
    down: false,
    get: async (key: string) => (up(), store.get(key) ?? null),
    set: async (key: string, value: string) => (up(), store.set(key, value), 'OK'),
    del: async (key: string) => (up(), store.delete(key), 1),
  };
  return redis;
}

/** A pool whose list queries wait until the test answers them, in order. */
function heldPool() {
  const pending: Array<(rows: unknown[]) => void> = [];
  return {
    pending,
    pool: { query: () => new Promise((resolve) => pending.push((rows) => resolve({ rows }))) } as unknown as pg.Pool,
  };
}

const listRow = (slug: string) => ({
  id: `00000000-0000-4000-8000-${slug.padStart(12, '0')}`,
  slug,
  title: slug,
  summary: null,
  dialect: 'kurmanci',
  level: 1,
  length: 'short',
  word_count: 82,
  fully_narrated: false,
});

/** Let the service's awaits run until `ready()` holds. */
async function until(ready: () => boolean): Promise<void> {
  for (let i = 0; i < 50 && !ready(); i++) await new Promise((r) => setImmediate(r));
  expect(ready()).toBe(true);
}

describe('the cached story list', () => {
  it('is cached per filter until a change starts a new generation', async () => {
    const redis = memoryRedis();
    const { pool, pending } = heldPool();
    const service = new StoriesService(pool, new Cache(redis));
    const answer = async (list: Promise<unknown>, rows: unknown[]) => {
      await until(() => pending.length > 0);
      pending.shift()!(rows);
      return list;
    };

    // the first request finds no generation: it starts one and answers from the database
    expect(await answer(service.list(), [listRow('a')])).toHaveLength(1);
    expect([...redis.store.keys()]).toEqual(['kurda:stories:list-generation']);
    // then each filter is loaded once and served from the cache
    expect(await answer(service.list(), [listRow('a')])).toHaveLength(1);
    expect(await service.list()).toHaveLength(1);
    expect(await answer(service.list({ dialect: 'sorani' }), [])).toEqual([]);
    expect(await service.list({ dialect: 'sorani' })).toEqual([]);
    expect(pending).toHaveLength(0);

    await bustStoryLists(new Cache(redis));
    expect(await answer(service.list(), [listRow('a'), listRow('b')])).toHaveLength(2);
    expect(await answer(service.list({ dialect: 'sorani' }), [])).toEqual([]);
  });

  it('never serves a list read before a change to a request made after it', async () => {
    const redis = memoryRedis();
    const cache = new Cache(redis);
    const { pool, pending } = heldPool();
    const service = new StoriesService(pool, cache);
    await bustStoryLists(cache);

    // a request misses, and its query reads the hub while the story is still published
    const before = service.list();
    await until(() => pending.length === 1);
    // the reviewer unpublishes it, and the change empties the list
    await bustStoryLists(cache);
    // a request made after that does not join the load in flight
    const after = service.list();
    await until(() => pending.length === 2);
    pending[0]!([listRow('pulled')]);
    pending[1]!([]);
    expect(await before).toHaveLength(1);
    expect(await after).toEqual([]);
    // and what the old load wrote back is never read: the next request is served the new list from the cache
    expect(await service.list()).toEqual([]);
    expect(pending).toHaveLength(2);
  });

  it('answers from the database while Redis is down, and a change then is simply lost with it', async () => {
    const redis = memoryRedis();
    const { pool, pending } = heldPool();
    const service = new StoriesService(pool, new Cache(redis));
    redis.down = true;
    for (const rows of [[listRow('a')], []]) {
      const list = service.list();
      await until(() => pending.length > 0);
      pending.shift()!(rows);
      expect(await list).toHaveLength(rows.length);
    }
    await expect(bustStoryLists(new Cache(redis))).resolves.toBeUndefined();
    await expect(bustStoryLists(null)).resolves.toBeUndefined();
    expect(redis.store.size).toBe(0);
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
