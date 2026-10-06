import { describe, expect, it } from 'vitest';
import { lessonAudioKey } from '@kurda/shared';
import { lessonAudioFor } from './delivery.js';

/** A database that has recordings of `have`, and counts what it is asked. */
function fakeDb(have: Record<string, string>) {
  const calls: unknown[][] = [];
  return {
    calls,
    query: async (_sql: string, params: unknown[]) => {
      calls.push(params);
      const keys = params[0] as string[];
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

  it('looks every recording up in one query', async () => {
    const db = fakeDb({});
    await lessonAudioFor(db as never, lesson);
    expect(db.calls).toHaveLength(1);
    expect(new Set(db.calls[0]![0] as string[])).toEqual(
      new Set(['spas', 'ez baş im', 'av', 'nan', 'silav', 'roj baş', 'bavê min'].map(lessonAudioKey)),
    );
  });

  it('asks nothing when nothing could have a recording', async () => {
    const db = fakeDb({});
    const out = await lessonAudioFor(db as never, [
      { type: 'multiple_choice', payload: { prompt: 'x', options: ['a', 'b'], correctIndex: 0 } },
    ]);
    expect(out).toEqual([{}]);
    expect(db.calls).toHaveLength(0);
  });

  it('attaches the model, the listening clip and the cards, and nothing that is not recorded', async () => {
    const db = fakeDb({ spas: URL('spas'), 'ez baş im': URL('ezbasim'), av: URL('av'), silav: URL('silav') });
    const [translate, listening, pairs, mc, speaking, writing] = await lessonAudioFor(db as never, lesson);
    expect(translate).toEqual({ modelAudioUrl: URL('spas') });
    // the studio's recording comes before the clip the payload names
    expect(listening).toEqual({ audioUrl: URL('ezbasim'), modelAudioUrl: URL('ezbasim') });
    // by the exact text on the card; the card without a recording is left out
    expect(pairs).toEqual({ audio: { Av: URL('av') } });
    expect(mc).toEqual({ modelAudioUrl: URL('silav') });
    expect(speaking).toEqual({});
    expect(writing).toEqual({});
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
