import { describe, expect, it } from 'vitest';
import { lessonAudioKey } from '@kurda/shared';
import { lessonAudioFor, modelAudioAfterAnswer } from './delivery.js';

/** A database that has recordings of `have`, and counts what it is asked. */
function fakeDb(have: Record<string, string>) {
  const calls: unknown[][] = [];
  return {
    calls,
    query: async (_sql: string, params: unknown[]) => {
      calls.push(params);
      // a batch asks for ANY($1::text[]), a single answer for one key
      const keys = typeof params[0] === 'string' ? [params[0]] : (params[0] as string[]);
      return { rows: keys.filter((k) => have[k]).map((k) => ({ key: k, url: have[k]! })) };
    },
  };
}

const URL = (n: string) => `https://cdn.test/lesson-audio/${n}.wav`;

describe('lessonAudioFor', () => {
  const lesson = [
    { type: 'translate' as const, payload: { prompt: 'Thank you', accepted: ['Spas', 'Spas dikim'] } },
    { type: 'listening' as const, payload: { accepted: ['Ez baş im.'], audioUrl: 'https://cdn.test/own.mp3' } },
    { type: 'match_pairs' as const, payload: { pairs: [{ left: 'Av', right: 'water' }, { left: 'Nan', right: 'bread' }] } },
    { type: 'multiple_choice' as const, payload: { prompt: '"Hello"?', options: ['Silav', 'Spas'], correctIndex: 0, say: 'Silav' } },
    { type: 'speaking' as const, payload: { prompt: 'Say it', reference: 'Roj baş' } },
    { type: 'writing' as const, payload: { prompt: 'Write it', accepted: ['bavê min'] } },
  ];

  it('looks every recording up in one query, and only those it may send', async () => {
    const db = fakeDb({});
    await lessonAudioFor(db as never, lesson);
    expect(db.calls).toHaveLength(1);
    // the translation's, the writing item's and the right option's models are the answers: not before answering
    expect(new Set(db.calls[0]![0] as string[])).toEqual(new Set(['ez baş im', 'av', 'nan', 'roj baş'].map(lessonAudioKey)));
  });

  it('asks nothing when nothing could have a recording', async () => {
    const db = fakeDb({});
    const out = await lessonAudioFor(db as never, [
      { type: 'multiple_choice', payload: { prompt: 'x', options: ['a', 'b'], correctIndex: 0 } },
    ]);
    expect(out).toEqual([{}]);
    expect(db.calls).toHaveLength(0);
  });

  it('attaches the listening clip, the model to imitate and the cards, and nothing that is not recorded', async () => {
    const db = fakeDb({ spas: URL('spas'), 'ez baş im': URL('ezbasim'), av: URL('av'), silav: URL('silav'), 'roj baş': URL('roj') });
    const [translate, listening, pairs, mc, speaking, writing] = await lessonAudioFor(db as never, lesson);
    // the studio's recording comes before the clip the payload names
    expect(listening).toEqual({ audioUrl: URL('ezbasim'), modelAudioUrl: URL('ezbasim') });
    expect(speaking).toEqual({ modelAudioUrl: URL('roj') });
    // by the exact text on the card; the card without a recording is left out
    expect(pairs).toEqual({ audio: { Av: URL('av') } });
    // recorded, but each would say the answer: they come with the grading
    expect(translate).toEqual({});
    expect(mc).toEqual({});
    expect(writing).toEqual({});
  });

  describe('a model before the answer', () => {
    const have = { sê: URL('se'), silav: URL('silav'), agir: URL('agir'), îro: URL('iro'), av: URL('av'), spas: URL('spas') };
    const one = async (type: Parameters<typeof lessonAudioFor>[1][number]['type'], payload: unknown) =>
      (await lessonAudioFor(fakeDb(have) as never, [{ type, payload }]))[0];

    it('is sent when the prompt already shows its Kurdish and it is no option', async () => {
      expect(await one('multiple_choice', { prompt: '"Sê" çend e?', options: ['3', '2', '5'], correctIndex: 0, say: 'Sê' })).toEqual({
        modelAudioUrl: URL('se'),
      });
      // Kurdish to English: the Kurdish is the question
      expect(await one('translate', { prompt: 'Spas', accepted: ['Thank you'], say: 'Spas' })).toEqual({ modelAudioUrl: URL('spas') });
      expect(await one('writing', { prompt: 'Îro çi roj e? Write it in English', accepted: ['what day is today'], say: 'îro' })).toEqual({
        modelAudioUrl: URL('iro'),
      });
    });

    it('is held back when it is the answer', async () => {
      expect(await one('multiple_choice', { prompt: '"Hello" bi kurdî?', options: ['Silav', 'Spas'], correctIndex: 0, say: 'Silav' })).toEqual({});
      expect(await one('translate', { prompt: 'today', accepted: ['îro'] })).toEqual({});
      expect(await one('writing', { prompt: 'Write: water', accepted: ['av'] })).toEqual({});
      // shown in the prompt, and an option as well: still the answer
      expect(await one('multiple_choice', { prompt: 'Which is "Silav"?', options: ['Silav!', 'Spas'], correctIndex: 0, say: 'Silav' })).toEqual({});
      expect(await one('translate', { prompt: 'water (av)', accepted: ['av'] })).toEqual({});
    });

    it('is held back when the prompt does not show it, even if no option is word for word the same', async () => {
      expect(
        await one('multiple_choice', {
          prompt: 'What did Kawa light to announce freedom?',
          options: ['Agir (fire)', 'Av (water)', 'Berf (snow)'],
          correctIndex: 0,
          say: 'Agir',
        }),
      ).toEqual({});
    });

    it('counts only whole words as shown', async () => {
      // "av" inside "avahî" is not the word av
      expect(await one('translate', { prompt: 'Avahî', accepted: ['building'], say: 'av' })).toEqual({});
      expect(await one('translate', { prompt: 'Av û nan', accepted: ['water and bread'], say: 'av' })).toEqual({ modelAudioUrl: URL('av') });
    });
  });

  it('never lets a card name what a listening item in the same response plays', async () => {
    const db = fakeDb({ silav: URL('silav'), av: URL('av') });
    const [listening, pairs] = await lessonAudioFor(db as never, [
      { type: 'listening', payload: { accepted: ['Silav!'] } },
      { type: 'match_pairs', payload: { pairs: [{ left: 'Silav', right: 'hello' }, { left: 'Av', right: 'water' }] } },
    ]);
    expect(listening).toEqual({ audioUrl: URL('silav'), modelAudioUrl: URL('silav') });
    // the Silav card would put the transcription beside the clip's URL
    expect(pairs).toEqual({ audio: { Av: URL('av') } });
  });

  it('never lets a model shown beside its text name what a listening item in the same response plays', async () => {
    const db = fakeDb({ silav: URL('silav'), 'roj baş': URL('roj') });
    const [listening, quoted, speaking, otherSpeaking] = await lessonAudioFor(db as never, [
      { type: 'listening', payload: { accepted: ['Silav!'] } },
      { type: 'multiple_choice', payload: { prompt: '"Silav" çi ye?', options: ['hello', 'thanks'], correctIndex: 0, say: 'Silav' } },
      { type: 'speaking', payload: { prompt: 'Bêje: Silav', reference: 'Silav' } },
      { type: 'speaking', payload: { prompt: 'Bêje: Roj baş', reference: 'Roj baş' } },
    ]);
    // the listening item's own model is its clip, and names nothing
    expect(listening).toEqual({ audioUrl: URL('silav'), modelAudioUrl: URL('silav') });
    // each would put "Silav" beside the clip's URL: they come with the grading instead
    expect(quoted).toEqual({});
    expect(speaking).toEqual({});
    expect(otherSpeaking).toEqual({ modelAudioUrl: URL('roj') });
  });

  it('never sends a URL that a card in the same response pairs with an answer', async () => {
    // practice mixes lessons: the Silav card can sit beside the item whose right option is Silav
    const db = fakeDb({ silav: URL('silav'), îro: URL('iro') });
    const out = await lessonAudioFor(db as never, [
      { type: 'multiple_choice', payload: { prompt: 'Hello bi kurdî?', options: ['Silav', 'Spas'], correctIndex: 0, say: 'Silav' } },
      { type: 'translate', payload: { prompt: 'today', accepted: ['îro'] } },
      { type: 'match_pairs', payload: { pairs: [{ left: 'Silav', right: 'hello' }, { left: 'îro', right: 'today' }] } },
    ]);
    const cards = new Set(Object.values(out[2]!.audio ?? {}));
    expect(cards).toEqual(new Set([URL('silav'), URL('iro')]));
    for (const fields of out.slice(0, 2)) for (const url of Object.values(fields)) expect(cards.has(url as string)).toBe(false);
  });

  it('never keys the map by a text the learner is not shown', async () => {
    const db = fakeDb({ spas: URL('spas'), silav: URL('silav'), 'ez baş im': URL('ezbasim'), 'roj baş': URL('roj') });
    const out = await lessonAudioFor(db as never, lesson);
    for (const fields of out) {
      for (const text of Object.keys(fields.audio ?? {})) expect(['Av', 'Nan']).toContain(text);
    }
    expect(out[3]).not.toHaveProperty('audio');
  });

  it('keeps the payload’s spelling of each card, even when two spell one word differently', async () => {
    const db = fakeDb({ av: URL('av') });
    const [pairs] = await lessonAudioFor(db as never, [
      { type: 'match_pairs', payload: { pairs: [{ left: 'Av', right: 'water' }, { left: 'av!', right: 'water!' }] } },
    ]);
    expect(pairs).toEqual({ audio: { Av: URL('av'), 'av!': URL('av') } });
  });

  it('shrugs off malformed payloads', async () => {
    const db = fakeDb({});
    const out = await lessonAudioFor(db as never, [
      { type: 'match_pairs', payload: { pairs: [null, { left: 4 }] } },
      { type: 'listening', payload: null },
      { type: 'translate', payload: { accepted: 'Spas' } },
    ]);
    expect(out).toEqual([{}, {}, {}]);
  });
});

describe('modelAudioAfterAnswer', () => {
  it('is the recording of the item’s primary text, whatever was sent before', async () => {
    const db = fakeDb({ silav: URL('silav'), îro: URL('iro') });
    expect(await modelAudioAfterAnswer(db as never, 'multiple_choice', { prompt: '"Hello"?', options: ['Silav', 'Na'], correctIndex: 0, say: 'Silav' })).toBe(
      URL('silav'),
    );
    expect(await modelAudioAfterAnswer(db as never, 'translate', { prompt: 'today', accepted: ['Îro.'] })).toBe(URL('iro'));
  });

  it('is undefined when there is nothing recorded, or nothing to record', async () => {
    const db = fakeDb({});
    expect(await modelAudioAfterAnswer(db as never, 'translate', { prompt: 'today', accepted: ['îro'] })).toBeUndefined();
    expect(await modelAudioAfterAnswer(db as never, 'match_pairs', { pairs: [{ left: 'av', right: 'water' }] })).toBeUndefined();
    expect(await modelAudioAfterAnswer(db as never, 'multiple_choice', { prompt: 'x', options: ['a', 'b'], correctIndex: 0 })).toBeUndefined();
    // nothing to look up: no query at all
    expect(db.calls).toHaveLength(1);
  });
});
