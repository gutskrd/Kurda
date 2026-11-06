import { describe, expect, it } from 'vitest';
import { checkGameContent, kurdishTexts } from '../content.js';
import { SCENARIO_CANDIDATES, buildsFromTiles, guessPlace, pickWrongReplies, scenarioLevel, type ReplyCandidate } from './rules.js';

const en = (text: string) => ({ en: text });

// lines of the course's own conversations, as an importer would find them
const pair = { line: 'Tu çend salî yî?', reply: 'Ez heft salî me.', conversation: 'roadu02s3l3a', level: 1 };
const candidate = (ku: string, conversation: string, level = 1): ReplyCandidate => ({ ku, en: null, conversation, level });

describe('scenarioLevel', () => {
  it('climbs with the unit’s place in its course', () => {
    expect([1, 3, 4, 6, 9, 11, 12].map((u) => scenarioLevel(u, 12))).toEqual([1, 1, 2, 3, 4, 5, 5]);
    expect(scenarioLevel(1, 1)).toBe(1);
    expect(scenarioLevel(0, 0)).toBe(1);
  });
});

describe('buildsFromTiles', () => {
  it('builds only at advanced level, and only a reply of two to ten words', () => {
    expect(buildsFromTiles('advanced', 'Ez heft salî me.')).toBe(true);
    expect(buildsFromTiles('intermediate', 'Ez heft salî me.')).toBe(false);
    expect(buildsFromTiles('advanced', 'Belê.')).toBe(false);
    expect(buildsFromTiles('advanced', 'a b c d e f g h i j k')).toBe(false);
  });
});

describe('pickWrongReplies', () => {
  const pool = [
    candidate('Nan û penîr li ser maseyê ne.', 'roadu04s2l4a'),
    candidate('Otobûs diçe, zû were!', 'roadu05s4l4a', 2),
    candidate('Ez jî heft salî me.', 'roadu02s1l4a'),
    candidate('Spas, baş e.', 'roadu01s1l3a'),
    candidate('Ew kumê min ê kevn e!', 'roadu02s2l3a'),
    candidate('Hesp li ber çem e.', 'roadu09s4l3a', 4),
    candidate('Tu çend salî yî?', 'roadu01s3l3a'),
    candidate('Li wir sêv hene!', 'roadu03s1l3a', 2),
    candidate('Pirtûk li ser maseyê ye.', 'roadu04s2l4a'),
    candidate('Ez dizanim, tu ji Amedê yî!', 'roadu01s3l3a'),
    candidate('Ez heft salî me, xalo, ji kerema xwe vê pirtûkê bide min!', 'roadu03s4l4a'),
    candidate('Erê, hemû gel. Em dikenin.', 'roadu06s1l4a'),
  ];
  const picked = pickWrongReplies(pair, pool, 'kmr');
  const texts = picked.map((c) => c.ku);

  it('offers real lines from other conversations of about the same level', () => {
    expect(picked.length).toBeGreaterThanOrEqual(2);
    expect(picked.length).toBeLessThanOrEqual(SCENARIO_CANDIDATES);
    expect(picked.every((c) => c.conversation !== pair.conversation && Math.abs(c.level - pair.level) <= 1)).toBe(true);
    expect(texts).not.toContain('Hesp li ber çem e.');
  });

  it('leaves out what would fit too: the same words, the line itself, and words that answer anything', () => {
    expect(texts).not.toContain('Ez jî heft salî me.');
    expect(texts).not.toContain('Tu çend salî yî?');
    expect(texts).not.toContain('Spas, baş e.');
    // after a question, a line that opens with yes or no looks like an answer whatever it goes on to say
    expect(texts).not.toContain('Erê, hemû gel. Em dikenin.');
  });

  it('keeps lengths close to the reply’s and never two from one conversation', () => {
    expect(texts).not.toContain('Ez heft salî me, xalo, ji kerema xwe vê pirtûkê bide min!');
    expect(new Set(picked.map((c) => c.conversation)).size).toBe(picked.length);
  });

  it('picks the same lines however often it is asked', () => {
    expect(pickWrongReplies(pair, [...pool].reverse(), 'kmr').map((c) => c.ku).sort()).toEqual([...texts].sort());
  });
});

describe('guessPlace', () => {
  it('suggests the place a conversation’s English mentions most, or none', () => {
    expect(guessPlace(['Mîrza, a kilo of cheese and some honey, please.', 'The market is big.', 'Here is the bread.'])).toBe('market');
    expect(guessPlace(['The doctor is coming.', 'Is honey medicine too?'])).toBe('doctor');
    expect(guessPlace(['Hello!', null, 'How are you?'])).toBeNull();
  });
});

describe('a scenario row', () => {
  it('keeps the recordings the importer found and checks every line’s script', () => {
    const payload = {
      situation: en('At a birthday, a child asks you a question.'),
      place: 'party',
      speaker: 'xezo',
      line: { ku: pair.line, meanings: en('How old are you?'), recording: 'roadu02s3l3a|0|tu cend sali yi' },
      reply: { ku: pair.reply, meanings: en('I am seven.'), recording: 'roadu02s3l3a|1|ez heft sali me' },
      others: [
        { ku: 'Li wir sêv hene!', meanings: en('There are apples over there!') },
        { ku: 'Ew kumê min ê kevn e!', meanings: en('It is my old cap!'), why: en('That is about a cap, not an age.') },
      ],
    };
    const ok = checkGameContent('scenario', 'kmr', payload);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(kurdishTexts('scenario', ok.payload).map((t) => t.path)).toEqual(['line.ku', 'reply.ku', 'others.0.ku', 'others.1.ku']);
    const mixed = checkGameContent('scenario', 'ckb', payload);
    expect(mixed.ok).toBe(false);
  });
});
