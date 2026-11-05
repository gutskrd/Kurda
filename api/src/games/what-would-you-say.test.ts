/**
 * What Would You Say? without a database: a round is eight published scenes
 * of the difficulty's levels, the reply is chosen among real lines (or built
 * from tiles at advanced level, never handed over in order), a choice is
 * graded by its place, a wrong first try rules one option out with what it
 * means, and the correction explains every option. The conversation reader
 * gives each line the key its recording is filed under.
 */
import { describe, expect, it } from 'vitest';
import { SOLO_ROUND_ITEMS, checkGameContent, conversationLineKey, gameWords, type ScenarioContent } from '@kurda/shared';
import { WhatWouldYouSayGame, type ScenarioItem } from './what-would-you-say.js';
import { conversationLinesOf, type PublishedContent, type TrustedSources } from './sources.js';

const en = (text: string) => ({ en: text });

// pairs and other lines from the course's own conversations; a test only, never shown to anyone
const PAIRS: Array<[string, string, string, string]> = [
  ['Tu çend salî yî?', 'How old are you?', 'Ez heft salî me.', 'I am seven.'],
  ['Ev kum yê kê ye?', 'Whose is this cap?', 'Ew kumê min ê kevn e!', 'It is my old cap!'],
  ['Kî li ber derî ye?', 'Who is at the door?', 'Xalo, doktor li vir e.', 'Uncle, the doctor is here.'],
  ['Tu birçî yî?', 'Are you hungry?', 'Erê, ez pir birçî me!', 'Yes, I am very hungry!'],
  ['Sêv li ku ne?', 'Where are the apples?', 'Di sindoqê de sêv tune!', 'There are no apples in the crate!'],
  ['Bazar mezin e?', 'Is the market big?', 'Belê, bazar pir mezin e.', 'Yes, the market is very big.'],
  ['Otobûs kengî tê?', 'When does the bus come?', 'Otobûs her saet tê.', 'The bus comes every hour.'],
  ['Tu çay dixwazî?', 'Would you like tea?', 'Na… ez çay naxwazim.', 'No… I do not want tea.'],
  ['Mala te li ku ye?', 'Where is your house?', 'Mala min li gund e.', 'My house is in the village.'],
];
const OTHERS = [
  { ku: 'Li wir sêv hene!', meanings: en('There are apples over there!') },
  { ku: 'Şîrîn hîn jî henekên xwe bi min dike!', meanings: en('Şîrîn still makes fun of me!'), why: en('That is about Şîrîn, and answers nothing.') },
  { ku: 'Ez ne hêdî me!', meanings: en('I am not slow!') },
];

function row(i: number, level: number): PublishedContent<'scenario'> {
  const [line, lineEn, reply, replyEn] = PAIRS[i % PAIRS.length]!;
  const payload = {
    situation: en(`Scene ${i}`),
    place: 'home',
    speaker: 'hamo',
    line: { ku: line, meanings: en(lineEn), recording: `conv${i}|0|line` },
    reply: { ku: reply, meanings: en(replyEn), why: en('This is what was said next.') },
    others: OTHERS,
  };
  const checked = checkGameContent('scenario', 'kmr', payload);
  if (!checked.ok) throw new Error(JSON.stringify(checked.issues));
  return { id: `id${i}`, key: `gc:id${i}`, level, payload: checked.payload as ScenarioContent };
}

function fakeSources(rows: Array<PublishedContent<'scenario'>>): TrustedSources {
  return { content: async (kind: string) => (kind === 'scenario' ? rows : []) } as unknown as TrustedSources;
}

/** A database where every scene's line is recorded (each under its own key), and nothing is seen. */
const db = {
  query: async (sql: string, params: unknown[] = []) =>
    sql.includes('lesson_audio')
      ? {
          rows: (params[0] as string[])
            .filter((k) => k.startsWith('conv'))
            .map((key) => ({ key, url: `https://media.example.com/${key.split('|')[0]}.mp3`, text: 'Tu çend salî yî?', duration_ms: 900, speaker: 'xezo', lipsync: null })),
        }
      : { rows: [] },
} as never;

const ask = (difficulty: 'beginner' | 'intermediate' | 'advanced') => ({ userId: 'u1', dialect: 'kmr' as const, difficulty, seed: `seed-${difficulty}` });

describe('a round', () => {
  const rows = [...Array.from({ length: 9 }, (_, i) => row(i, 1)), ...Array.from({ length: 9 }, (_, i) => row(i + 20, 4))];
  const game = new WhatWouldYouSayGame(fakeSources(rows));

  it('is eight scenes of the difficulty’s levels, each with three real replies to choose from at beginner', async () => {
    const round = await game.build(ask('beginner'), db);
    expect(round!.items).toHaveLength(SOLO_ROUND_ITEMS);
    expect(round!.items.every((i) => i.level === 1 && i.mode === 'choose' && i.shown.length === 3 && i.shown.includes(-1))).toBe(true);
    const view = game.view(round!.items[0]!, 0);
    expect(view.options).toHaveLength(3);
    expect(view.tiles).toBeNull();
    expect(JSON.stringify(view)).not.toContain('fits');
  });

  it('is refused when the difficulty holds fewer than eight scenes', async () => {
    expect(await new WhatWouldYouSayGame(fakeSources(rows.slice(0, 5))).build(ask('beginner'), db)).toBeNull();
    expect(await game.build(ask('intermediate'), db)).toBeNull();
  });

  it('plays the line heard in its recording, in the voice of the one who says it in the scene', async () => {
    const round = await game.build(ask('beginner'), db);
    const first = round!.items[0]!;
    expect(first.line.audio).toEqual({ src: `https://media.example.com/conv${first.key.slice('gc:id'.length)}.mp3`, voice: expect.objectContaining({ speaker: 'hamo' }) });
    // which reply is the real one, and what any of them means, stays for after the answer
    const sent = JSON.stringify(game.view(first, 0));
    expect(sent).not.toContain('This is what was said next.');
    expect(sent).not.toContain(first.reply.meanings.en);
  });

  it('builds the reply from its words and a few others at advanced level, never laid out in order', async () => {
    const round = await game.build(ask('advanced'), db);
    for (const item of round!.items) {
      expect(item.mode).toBe('tiles');
      const words = gameWords(item.reply.ku);
      expect(item.tiles.length).toBeGreaterThan(words.length);
      const own = item.tiles.filter((t) => words.some((w) => w.toLowerCase() === t.toLowerCase()));
      expect(own.map((t) => t.toLowerCase())).not.toEqual(words.map((w) => w.toLowerCase()));
    }
  });
});

describe('an answer', () => {
  const game = new WhatWouldYouSayGame(fakeSources(Array.from({ length: 8 }, (_, i) => row(i, 2))));

  it('is right only when it chooses the real reply, and a wrong one is ruled out with what it means', async () => {
    const item = (await game.build(ask('beginner'), db))!.items[0]!;
    const right = item.shown.indexOf(-1);
    const wrong = item.shown.findIndex((s) => s >= 0);
    expect(game.grade(item, { choice: right })).toBe(true);
    expect(game.grade(item, { choice: wrong })).toBe(false);
    expect(game.grade(item, { order: [0, 1] })).toBe(false);
    const hint = game.hint(item, { choice: wrong }, 'kmr');
    expect(hint.ruledOut).toBe(wrong);
    expect(hint.meanings).toEqual(item.others[item.shown[wrong]!]!.meanings);
    const correction = game.correction(item, { choice: wrong }, 'kmr');
    expect(correction.options.map((o) => o.fits)).toEqual(item.shown.map((s) => s === -1));
    expect(correction.chosen).toBe(wrong);
    expect(correction.line.meanings.en).toBeTruthy();
    expect(game.why()).toBe('reply');
  });

  it('built from tiles is graded as the reply, and a wrong line is marked where it goes astray', () => {
    const item: ScenarioItem = {
      key: 'k',
      level: 4,
      situation: en('s'),
      place: null,
      speaker: null,
      line: { ku: 'Tu çend salî yî?', meanings: en('How old are you?'), audio: null },
      reply: { ku: 'Ez heft salî me.', meanings: en('I am seven.'), why: null, audio: null },
      others: [],
      mode: 'tiles',
      shown: [],
      tiles: ['me', 'heft', 'ez', 'salî', 'sêv'],
    };
    expect(game.grade(item, { order: [2, 1, 3, 0] })).toBe(true);
    expect(game.grade(item, { order: [1, 2, 3, 0] })).toBe(false);
    expect(game.grade(item, { order: [2, 2, 3, 0] })).toBe(false);
    expect(game.hint(item, { order: [2, 3, 1, 0] }, 'kmr').firstWrong).toBe(1);
    const correction = game.correction(item, { order: [2, 3, 1, 0] }, 'kmr');
    expect(correction.options[0]).toMatchObject({ ku: 'Ez heft salî me.', fits: true });
    expect(correction.firstWrong).toBe(1);
    expect(game.correction(item, { order: [2, 1, 3, 0] }, 'kmr').firstWrong).toBeNull();
  });
});

describe('the conversation reader', () => {
  it('gives every line its place, its part, its English and its recording’s key', () => {
    const payload = {
      id: 'roadu02s3l3a',
      title: 'Tu çend salî yî?',
      speakers: [{ character: 'xezo' }, { character: 'hamo' }],
      lines: [
        { speaker: 0, text: 'Tu çend salî yî?', en: 'How old are you?' },
        { speaker: 1, text: 'Ez heft salî me.', en: 'I am seven.' },
      ],
      prompt: 'How old?',
      options: ['Seven', 'Eight'],
      correctIndex: 0,
    };
    const lines = conversationLinesOf({ id: 'ex1', type: 'conversation', payload }, 'kmr', 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatchObject({ exerciseId: 'ex1', index: 1, part: 1, speaker: 'hamo', en: 'I am seven.', level: 2, origin: 'conversation:ex1:1' });
    expect(lines[1]!.recording).toBe(conversationLineKey('roadu02s3l3a', 1, 'Ez heft salî me.'));
    expect(conversationLinesOf({ id: 'ex1', type: 'conversation', payload }, 'ckb', 2)).toEqual([]);
  });
});
