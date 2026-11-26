/**
 * Guards the Kurmanji Road in CI: the plan is complete and consistent, and every existing unit file passes every check.
 * The check itself is proved on a small example unit (two lessons against a two-lesson plan) that passes, then fails in
 * the one way each change should.
 */
import { describe, expect, it } from 'vitest';
import { REACTION_LINES } from '@kurda/shared';
import {
  CHARACTER_LINES_MAX,
  ROAD_COURSE,
  addressesHamo,
  checkRoad,
  checkRoadPlan,
  checkRoadStories,
  familyProblems,
  soundProblems,
  formatProblem,
  kurdishWords,
  loadRoadPlan,
  loadRoadStories,
  onlySaidBy,
  recordedTexts,
  speakerProblems,
  ROAD_VOICE_LINES_MAX,
  roadUnitNumbers,
  type RoadPlan,
  type RoadProblem,
} from './road-check.js';

const plan = loadRoadPlan();
const lessons = plan.units.flatMap((u) => u.skills.flatMap((s) => s.lessons));
const items = lessons.flatMap((l) => l.new);

describe('the road’s plan', () => {
  it('passes the plan check', () => {
    expect(checkRoadPlan(plan).map(formatProblem)).toEqual([]);
  });

  it('has 192 lessons with their keys in order', () => {
    expect(lessons).toHaveLength(192);
    const keys = plan.units.flatMap((u) => u.skills.flatMap((s) => s.lessons.map((l) => `u${String(u.number).padStart(2, '0')}s${s.position}l${l.position}`)));
    expect(lessons.map((l) => l.key)).toEqual(keys);
  });

  it('teaches 700 to 850 items, few at first and more later, none in a review lesson and none twice', () => {
    expect(items.length).toBeGreaterThanOrEqual(700);
    expect(items.length).toBeLessThanOrEqual(850);
    for (const l of lessons) if (l.focus === 'review') expect(l.new, l.key).toEqual([]);
    const perUnit = plan.units.map((u) => u.skills.reduce((s, sk) => s + sk.lessons.reduce((t, l) => t + l.new.length, 0), 0));
    expect(perUnit[0]!).toBeLessThan(perUnit[10]!);
    const ids = items.map((i) => `${i.ku.toLowerCase()}|${i.pos}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('writes every form as a lower-case word in Hawar letters', () => {
    const bad = items.flatMap((i) => i.forms.filter((f) => !/^[a-zçêîşû]+$/.test(f)).map((f) => `${i.ku}: ${f}`));
    expect(bad).toEqual([]);
  });

  it('gives Hamo most of the lessons, Xezo her scenes and Hevalo a few', () => {
    const count = (v: string): number => lessons.filter((l) => l.voice === v).length;
    expect(count('hamo') / lessons.length).toBeGreaterThanOrEqual(0.65);
    expect(count('hevalo') / lessons.length).toBeLessThanOrEqual(0.1);
    expect(count('hamo') + count('xezo') + count('hevalo')).toBe(lessons.length);
  });

  it('lists its doubts for the native review, each with a reason', () => {
    expect(plan.doubts.length).toBeGreaterThan(0);
    for (const d of plan.doubts) expect(d.ku && d.reason).toBeTruthy();
  });
});

const written = roadUnitNumbers();

describe('the road’s unit files', () => {
  if (written.length === 0) {
    it('has none yet, so only the plan is checked', () => {
      expect(checkRoad().stats.units).toEqual([]);
    });
  } else {
    it.each(written)('unit %i passes every check', (n) => {
      expect(checkRoad({ plan, units: [n] }).problems.map(formatProblem)).toEqual([]);
    });

    it('keeps every voice within what it records for the road', () => {
      const { recordings } = checkRoad({ plan }).stats;
      for (const v of ['hamo', 'xezo', 'hevalo'] as const) expect(recordings[v], v).toBeLessThanOrEqual(ROAD_VOICE_LINES_MAX[v]);
      for (const v of ['xezo', 'hevalo'] as const) {
        expect(recordings[v] + REACTION_LINES.filter((l) => l.character === v).length, v).toBeLessThanOrEqual(CHARACTER_LINES_MAX);
      }
      expect(recordings.xezo).toBeGreaterThan(0);
      expect(recordings.hevalo).toBeGreaterThan(0);
      expect(recordings.unvoiced).toBe(0);
    });
  }
});

describe('the stories at the chapters’ ends', () => {
  it('pass their check: each its chapter’s, at its level, in words the chapter taught', () => {
    expect(checkRoadStories(plan, loadRoadStories()).map(formatProblem)).toEqual([]);
  });

  it('name a word the chapter has not taught, unless the story glosses it, and a story that is not one chapter’s', () => {
    const tale = { slug: 'road-01-test', dialect: 'kurmanci', level: 1, title: 'Sêv', body: 'Ez Hamo me. Sêv gelek spehî ye.', glossary: [], questions: [] };
    expect(checkRoadStories(plan, [tale]).map(formatProblem)).toEqual([
      'road-01-test body: “spehî” is not met by the end of chapter 1: gloss it, or say it with words the chapter taught',
      'road-01-test body: 1 of its 7 words are new by chapter 1 (at most 2 %)',
    ]);
    const glossed = { ...tale, body: 'Ez Hamo me. Sêv gelek xweş e, û Hevalo birçî ye. Ez baş im, tu jî baş î. Çay germ e. Ev sêv spehî ye.', glossary: [{ term: 'spehî', meanings: { en: 'beautiful' } }] };
    expect(checkRoadStories(plan, [glossed]).map(formatProblem).filter((t) => t.includes('spehî'))).toEqual([]);
    expect(checkRoadStories(plan, [{ ...tale, slug: 'chapter-one' }, { ...tale, level: 2 }]).map(formatProblem)).toContain('chapter-one slug: slug should be road-NN-… with NN the chapter it ends (01–12)');
  });

  it('ask their questions in words the chapter taught too', () => {
    const tale = { slug: 'road-01-test', dialect: 'kurmanci', level: 1, title: 'Sêv', body: 'Ez Hamo me. Sêv gelek xweş e, û Hevalo birçî ye. Ez baş im, tu jî baş î.' };
    const asked = (prompt: string, options: string[]) => checkRoadStories(plan, [{ ...tale, questions: [{ prompt, options, correctIndex: 0 }] }]).map(formatProblem);
    expect(asked('Kî birçî ye?', ['Hevalo', 'Hamo'])).toEqual([]);
    expect(asked('Çima Hevalo birçî ye?', ['Wî sêv nexwar.', 'Ew sar e.'])).toEqual([
      'road-01-test questions[0]: “çima” is not met by the end of chapter 1: ask with words the chapter taught',
      'road-01-test questions[0]: “wî” is not met by the end of chapter 1: ask with words the chapter taught',
      'road-01-test questions[0]: “nexwar” is not met by the end of chapter 1: ask with words the chapter taught',
    ]);
  });
});

// ---------- the example ----------

const item = (ku: string, en: string, pos: string, forms: string[]): RoadPlan['units'][number]['skills'][number]['lessons'][number]['new'][number] => ({ ku, en, pos, forms });

const PLAN: RoadPlan = {
  course: { ...ROAD_COURSE },
  characters: { hamo: 'Hamo, the uncle.', xezo: 'Xezo, his niece.', hevalo: 'Hevalo, the deer.' },
  core: ['û', 'ji', 'li', 'jî'],
  names: [
    { name: 'Hamo', kind: 'person', en: 'Hamo', forms: ['Hamo'] },
    { name: 'Xezo', kind: 'person', en: 'Xezo', forms: ['Xezo', 'Xezoyê'] },
    { name: 'Amed', kind: 'place', en: 'Amed', forms: ['Amed', 'Amedê'] },
  ],
  units: [
    {
      number: 1,
      cefr: 'A1',
      titleKu: 'Silav',
      titleEn: 'Hello',
      story: 'You arrive in the village.',
      skills: [
        {
          position: 1,
          titleKu: 'Silav!',
          titleEn: 'Hello!',
          grammar: 'ez and tu with the copula',
          grammarMd: '**Ez baş im.** I am well.',
          lessons: [
            {
              key: 'u01s1l1',
              position: 1,
              titleKu: 'Silav!',
              titleEn: 'Hello!',
              focus: 'meet',
              beat: 'Hamo opens the gate.',
              voice: 'hamo',
              new: [
                item('silav', 'hello', 'interj', ['silav']),
                item('ez', 'I', 'pron', ['ez']),
                item('tu', 'you', 'pron', ['tu']),
                item('baş', 'good', 'adj', ['baş']),
                item('im / me', 'am', 'cop', ['im', 'me']),
              ],
            },
            {
              key: 'u01s1l2',
              position: 2,
              titleKu: 'Tu çawa yî?',
              titleEn: 'How are you?',
              focus: 'talk',
              beat: 'Xezo arrives.',
              voice: 'hamo',
              new: [
                item('çawa', 'how', 'question', ['çawa']),
                item('î / yî', 'are', 'cop', ['î', 'yî']),
                item('spas', 'thanks', 'interj', ['spas']),
                item('erê', 'yes', 'interj', ['erê']),
              ],
            },
          ],
        },
      ],
    },
  ],
  doubts: [],
};

type Ex = { position: number; type: string; payload: Record<string, unknown> };
type NewWords = Array<[string, string]>;
const marks = (words?: NewWords): Record<string, unknown> => (words ? { new: words.map(([ku, en]) => ({ ku, en })) } : {});
/** A multiple-choice item that says what it asks; a Kurdish line's `say` is the line itself. */
const mc = (ask: string, prompt: string, options: string[], correctIndex: number, voice?: string, words?: NewWords): Omit<Ex, 'position'> => ({
  type: 'multiple_choice',
  payload: {
    ask,
    ...(['meaning', 'reply', 'picture'].includes(ask) ? { say: prompt } : {}),
    ...(voice ? { voice } : {}),
    ...marks(words),
    prompt,
    options,
    correctIndex,
  },
});
const toKurdish = (prompt: string, accepted: string[], voice: string): Omit<Ex, 'position'> => ({ type: 'translate', payload: { ask: 'to-kurdish', voice, prompt, accepted } });
const toEnglish = (say: string, accepted: string[], voice: string): Omit<Ex, 'position'> => ({ type: 'translate', payload: { ask: 'to-english', say, voice, prompt: say, accepted } });
const listen = (accepted: string[], voice: string): Omit<Ex, 'position'> => ({ type: 'listening', payload: { ask: 'hear', voice, accepted } });
const speak = (reference: string, voice: string): Omit<Ex, 'position'> => ({ type: 'speaking', payload: { ask: 'repeat', voice, prompt: reference, reference } });
const write = (prompt: string, accepted: string[], voice: string): Omit<Ex, 'position'> => ({ type: 'writing', payload: { ask: 'to-kurdish', voice, prompt, accepted } });
const pairs = (list: Array<[string, string]>, voice: string): Omit<Ex, 'position'> => ({ type: 'match_pairs', payload: { pairs: list.map(([left, right]) => ({ left, right })), voice } });
const numbered = (list: Array<Omit<Ex, 'position'>>): Ex[] => list.map((e, i) => ({ position: i + 1, ...e }));

const CONVERSATION = {
  type: 'conversation',
  payload: {
    id: 'roadu01s1l2a',
    title: 'Li ber derî',
    speakers: [
      { name: 'Hamo', character: 'hamo' },
      { name: 'Xezo', character: 'xezo' },
    ],
    lines: [
      { speaker: 0, text: 'Silav, Xezo!', en: 'Hello, Xezo!' },
      { speaker: 1, text: 'Silav, Hamo! Tu çawa yî?', en: 'Hello, Hamo! How are you?' },
      { speaker: 0, text: 'Ez baş im, spas. Tu çawa yî?', en: 'I am well, thanks. How are you?' },
      { speaker: 1, text: 'Ez jî baş im.', en: 'I am well too.' },
      { speaker: 0, text: 'Tu ji Amedê yî?', en: 'Are you from Amed?' },
      { speaker: 1, text: 'Erê, ez ji Amedê me.', en: 'Yes, I am from Amed.' },
    ],
    prompt: 'Where is Xezo from?',
    options: ['From the village', 'From Amed', 'From the market'],
    correctIndex: 1,
  },
};

function exampleUnit(): { course: typeof ROAD_COURSE; units: unknown[] } {
  const meet = numbered([
    mc('meaning', 'Silav!', ['Hello!', 'Thanks!', 'Goodbye!'], 0, 'hamo', [['silav', 'hello']]),
    mc('meaning', 'Ez Hamo me.', ['You are Hamo.', 'I am Hamo.', 'Hello, Hamo.'], 1, 'hamo', [['ez', 'I'], ['me', 'am']]),
    mc('meaning', 'Ez baş im.', ['I am from Amed.', 'I am well.', 'I am Hamo.'], 1, 'hamo', [['baş', 'good'], ['im', 'am']]),
    listen(['Ez baş im.', 'Ez baş im'], 'hamo'),
    toKurdish('I am well.', ['Ez baş im.', 'Ez baş im'], 'hamo'),
    speak('Silav, ez Xezo me.', 'xezo'),
    mc('meaning', 'Û tu?', ['And you?', 'And me?', 'Hello!'], 0, 'hamo', [['tu', 'you']]),
    write('I am from Amed.', ['Ez ji Amedê me.', 'Ez ji Amedê me'], 'hamo'),
    toEnglish('Silav, Hamo!', ['Hello, Hamo!', 'Hello Hamo', 'Hi Hamo'], 'xezo'),
    listen(['Silav! Û tu?', 'Silav! Û tu', 'Silav û tu'], 'hamo'),
    mc('choose-kurdish', 'I am well.', ['Ez baş im.', 'Ez baş me.', 'Tu baş im.'], 0),
    pairs([['silav', 'hello'], ['ez', 'I'], ['tu', 'you'], ['baş', 'good']], 'hamo'),
  ]);
  const talk = numbered([
    mc('meaning', 'Tu çawa yî?', ['Who are you?', 'How are you?', 'Where are you from?'], 1, 'xezo', [['çawa', 'how'], ['yî', 'are']]),
    mc('meaning', 'Spas!', ['Thanks!', 'Hello!', 'Yes!'], 0, 'hamo', [['spas', 'thanks']]),
    mc('meaning', 'Erê, ez baş im.', ['Yes, I am well.', 'No, I am well.', 'Thanks, I am well.'], 0, 'hamo', [['erê', 'yes']]),
    listen(['Ez baş im, spas.', 'Ez baş im spas', 'Ez baş im, spas'], 'hamo'),
    CONVERSATION,
    pairs([['çawa', 'how'], ['spas', 'thanks'], ['erê', 'yes'], ['silav', 'hello']], 'hamo'),
    speak('Spas, Hamo!', 'xezo'),
    write('Yes, you are Hamo.', ['Erê, tu Hamo yî.', 'Erê, tu Hamo yî', 'Erê tu Hamo yî'], 'xezo'),
    mc('choose-kurdish', 'You are well.', ['Tu baş î.', 'Tu baş yî.', 'Tu baş im.'], 0),
    mc('meaning', 'Tu ji Amedê yî?', ['Are you going to Amed?', 'Are you in Amed?', 'Are you from Amed?'], 2, 'hamo'),
    listen(['Tu çawa yî, Hamo?', 'Tu çawa yî Hamo'], 'xezo'),
    toKurdish('Thanks!', ['Spas!', 'Spas'], 'hamo'),
  ]);
  return {
    course: { ...ROAD_COURSE },
    units: [
      {
        position: 1,
        titleKu: 'Silav',
        titleEn: 'Hello',
        skills: [
          {
            position: 1,
            titleKu: 'Silav!',
            titleEn: 'Hello!',
            grammarMd: '**Ez baş im.** I am well.',
            lessons: [
              { key: 'u01s1l1', position: 1, titleKu: 'Silav!', titleEn: 'Hello!', exercises: meet },
              { key: 'u01s1l2', position: 2, titleKu: 'Tu çawa yî?', titleEn: 'How are you?', exercises: talk },
            ],
          },
        ],
      },
    ],
  };
}

type Unit = ReturnType<typeof exampleUnit>;
const lessonOf = (doc: Unit, li: number): { exercises: Ex[]; key: string } =>
  (doc.units[0] as { skills: Array<{ lessons: Array<{ exercises: Ex[]; key: string }> }> }).skills[0]!.lessons[li]!;

function check(change: (doc: Unit) => void = () => {}, planChange: (p: RoadPlan) => void = () => {}): { problems: RoadProblem[]; text: string[] } {
  const doc = exampleUnit();
  change(doc);
  const p = structuredClone(PLAN);
  planChange(p);
  const { problems } = checkRoad({ plan: p, docs: new Map([[1, doc]]) });
  return { problems, text: problems.map(formatProblem) };
}

describe('the road’s check, on an example unit', () => {
  it('passes a unit that keeps every rule', () => {
    expect(check().text).toEqual([]);
  });

  it('counts lessons, exercises, minutes and who records what', () => {
    const { stats } = checkRoad({ plan: PLAN, docs: new Map([[1, exampleUnit()]]) });
    expect(stats).toMatchObject({ units: [1], lessons: 2, exercises: 24, minutes: 6, newItems: 9 });
    // a line is one recording wherever it is said; of them, the lines only a conversation says
    expect(stats.conversationLines).toEqual({ hamo: 2, xezo: 3, hevalo: 0 });
    expect(stats.recordings.hamo).toBe(17);
    expect(stats.recordings.xezo).toBe(9);
    expect(stats.recordings.unvoiced).toBe(0);
  });

  it('names a word the plan does not have, and one it only introduces later', () => {
    const { text } = check((doc) => {
      (lessonOf(doc, 0).exercises[3]!.payload.accepted as string[])[0] = 'Ez pir baş im.';
      (lessonOf(doc, 0).exercises[4]!.payload.accepted as string[])[0] = 'Tu çawa yî?';
    });
    expect(text).toContain('u01s1l1 #4 payload.accepted[0]: unknown word “pir”');
    expect(text).toContain('u01s1l1 #5 payload.accepted[0]: “çawa” is not introduced until u01s1l2');
  });

  it('refuses letters outside Hawar and a sentence without its capital', () => {
    const { text } = check((doc) => {
      (lessonOf(doc, 1).exercises[3]!.payload.accepted as string[])[0] = 'Ez başım, spas.';
      lessonOf(doc, 1).exercises[6]!.payload.reference = 'spas, Hamo!';
    });
    expect(text).toContain('u01s1l2 #4 payload.accepted[0]: “ı” (dotless ı) is not a Hawar letter');
    expect(text.some((t) => t.startsWith('u01s1l2 #7 payload.reference: a sentence starts with a capital'))).toBe(true);
  });

  it('limits a sentence to twelve words in the first units', () => {
    const { text } = check((doc) => {
      (lessonOf(doc, 1).exercises[11]!.payload.accepted as string[])[0] = 'Ez baş im ez baş im ez baş im ez baş im ez!';
    });
    expect(text).toContain('u01s1l2 #12 payload.accepted[0]: a sentence of 13 words (at most 12 in unit 1)');
  });

  it('asks for a voice on whatever is recorded, and for Hamo’s share', () => {
    expect(check((doc) => delete lessonOf(doc, 0).exercises[0]!.payload.voice).text).toContain('u01s1l1 #1 payload.voice: has something to record but no voice');
    const allXezo = check((doc) => {
      for (const li of [0, 1]) for (const ex of lessonOf(doc, li).exercises) if (ex.payload.voice) ex.payload.voice = 'xezo';
    });
    expect(allXezo.text).toContain('unit 1: Hamo records 0 % of the unit’s sentences (at least 65 %)');
  });

  it('never has Hamo record a line said to him, by his name or as uncle', () => {
    const { text } = check((doc) => {
      lessonOf(doc, 1).exercises[6]!.payload.voice = 'hamo';
      lessonOf(doc, 0).exercises[9]!.payload.accepted = ['Silav, xalo!', 'Silav xalo'];
    });
    expect(text).toContain('u01s1l2 #7: Hamo would say “Spas, Hamo!” to himself: model it without the name (the learner says it)');
    expect(text).toContain('u01s1l1 #10: Hamo would say “Silav, xalo!” to himself: model it without the name (the learner says it)');
    // his own name in a sentence about himself is no greeting to himself
    expect(addressesHamo('Ez Hamo me.')).toBe(false);
    expect(addressesHamo('Navê min Hamo ye.')).toBe(false);
    expect(addressesHamo('Xalo! Xalo!')).toBe(true);
  });

  it('holds a chapter written for the road’s voices to what they record: a few new lines a lesson, two of its own a conversation', () => {
    const forVoices = (p: RoadPlan): void => {
      p.units[0]!.recorder = 'hamo';
    };
    // Xezo says her own lines, in exercises and in her part of the conversation
    expect(check(undefined, forVoices).text).toEqual([
      'u01s1l1 #3: plays “Ez baş im.”, which exercise 4 asks the learner to hear, so it would play nothing here: hear another line there',
      'u01s1l2: records 15 new lines (at most 12): work on fewer lines in more ways, or bring back earlier ones',
      'u01s1l2 #5: the conversation records 5 lines of its own (at most 2): build it from lines the lesson has, “Silav, Xezo!”, “Silav, Hamo! Tu çawa yî?”, “Ez baş im, spas. Tu çawa yî?”, “Ez jî baş im.”, “Erê, ez ji Amedê me.”',
    ]);
    // a review brings back lines already recorded, and one line is one person's
    const { text } = check(
      (doc) => {
        lessonOf(doc, 1).exercises[11]!.payload.voice = 'xezo';
      },
      (p) => {
        forVoices(p);
        p.units[0]!.skills[0]!.lessons[1]!.focus = 'review';
      },
    );
    expect(text).toContain('u01s1l2 #12: “Spas!” is xezo’s here and hamo’s in u01s1l2: one recording is one person’s, so write the line for one of them');
    // its exercises' lines, that is: a review may keep a scene of its chapter as a conversation
    expect(text.find((t) => t.startsWith('u01s1l2: a review lesson brings back lines the road has recorded'))).toMatch(/records 10 new: “Tu çawa yî\?”/);
    expect(text.filter((t) => t.includes('the conversation records'))).toEqual([]);
    // the conversation's lines the lesson teaches are not its own
    const taught = check((doc) => {
      const said = [speak('Silav, Xezo!', 'hamo'), speak('Ez jî baş im.', 'xezo'), speak('Erê, ez ji Amedê me.', 'xezo')];
      lessonOf(doc, 1).exercises.splice(1, 3, ...said.map((e, i) => ({ position: i + 2, ...e })));
    }, forVoices);
    expect(taught.text.filter((t) => t.includes('the conversation records'))).toEqual([]);
  });

  it('plays a match-pairs card in the voice of whoever says its line in an item of its own', () => {
    const forVoices = (p: RoadPlan): void => {
      p.units[0]!.recorder = 'hamo';
    };
    const run = (change: (doc: Unit) => void): ReturnType<typeof checkRoad> => {
      const doc = exampleUnit();
      change(doc);
      const p = structuredClone(PLAN);
      forVoices(p);
      return checkRoad({ plan: p, docs: new Map([[1, doc]]) });
    };
    // “Spas!” is Xezo’s in both items of its own, so the card in Hamo’s pairs plays her take and the line is hers
    const before = run(() => {});
    const after = run((doc) => {
      for (const i of [1, 11]) lessonOf(doc, 1).exercises[i]!.payload.voice = 'xezo';
    });
    expect(after.problems).toEqual(before.problems);
    expect(after.stats.recordings.xezo).toBe(before.stats.recordings.xezo + 1);
    expect(after.stats.recordings.hamo).toBe(before.stats.recordings.hamo - 1);
    // a card no item of its own says is the pairs item’s voice to record, and its words must suit that voice
    const card = (voice: string): string[] =>
      check((doc) => {
        const ex = lessonOf(doc, 0).exercises[11]!;
        (ex.payload.pairs as Array<{ left: string; right: string }>).push({ left: 'Ez baş im, Hamo.', right: 'I am well, Hamo.' });
        ex.payload.voice = voice;
      }, forVoices).text.filter((t) => t.includes('Ez baş im, Hamo.') && !t.includes('new lines'));
    expect(card('hamo')).toEqual(['u01s1l1 #12: Hamo would say “Ez baş im, Hamo.” to himself: model it without the name (the learner says it)']);
    expect(card('xezo')).toEqual([]);
  });

  it('keeps Hevalo and Xezo within what each records in all, their reaction lines included', () => {
    const reactions = REACTION_LINES.filter((l) => l.character === 'hevalo').length;
    const lines = CHARACTER_LINES_MAX - reactions + 1;
    const { text } = check(
      (doc) => {
        const ex = lessonOf(doc, 0).exercises;
        for (let i = 0; i < lines; i++) ex.push({ position: ex.length + 1, ...listen([`Ez baş im ${i}.`], 'hevalo') });
      },
      (p) => {
        p.units[0]!.recorder = 'hamo';
      },
    );
    expect(text).toContain(`plan: Hevalo records ${lines} road lines and ${reactions} reaction lines, ${CHARACTER_LINES_MAX + 1} in all (at most ${CHARACTER_LINES_MAX})`);
  });

  it('asks for the Kurdish an item is about to be in its prompt, where the learner can read it and hear it', () => {
    const { text } = check((doc) => {
      lessonOf(doc, 0).exercises[2]!.payload.prompt = 'What does Hamo say?';
    });
    expect(text).toContain('u01s1l1 #3 payload.prompt: its Kurdish (say) is not in the prompt, so the learner can neither read nor hear it before answering: show it there');
  });

  it('holds an item to what it asks: the line alone, nothing to read under a recording, the same line to repeat, a short cue', () => {
    const { text } = check((doc) => {
      const l = lessonOf(doc, 0);
      l.exercises[3]!.payload.prompt = 'Type what you hear.';
      l.exercises[4]!.payload.prompt = 'Hamo smiles and says: “I am well.”';
      l.exercises[5]!.payload.prompt = 'Silav!';
      delete l.exercises[6]!.payload.ask;
      l.exercises[7]!.payload.cue = 'x'.repeat(41);
    });
    expect(text).toContain('u01s1l1 #4 payload.prompt: a listening item has no prompt: the headline asks, the recording says');
    expect(text).toContain('u01s1l1 #5 payload.prompt: the line stands alone, without quotes or a scene around it: the headline says what to do');
    expect(text).toContain('u01s1l1 #6 payload.prompt: the line to repeat is the one shown: prompt and reference are the same sentence');
    expect(text).toContain(
      'u01s1l1 #7 payload.ask: says nothing of what it asks: give it an ask (meaning, choose-kurdish, picture, reply, missing) and keep its prompt to the line',
    );
    expect(text).toContain('u01s1l1 #8 payload.cue: a cue of 41 characters (at most 40)');
  });

  it('keeps a conversation’s translations to translation, with no scene notes only the translation shows', () => {
    const { text } = check((doc) => {
      const talk = lessonOf(doc, 1).exercises[4]!;
      const lines = (talk.payload.lines as Array<{ text: string; en: string }>).map((l, i) => (i === 1 ? { ...l, en: `${l.en} (she waves from the gate)` } : l));
      talk.payload = { ...talk.payload, lines };
    });
    expect(text).toContain(
      'u01s1l2 #5 payload.lines[1].en: translates its line and sets no scene: a note in brackets reaches only a learner who opens the translation, so say it in the lines',
    );
  });

  it('marks each new word where its lesson first meets it, and only the lesson’s own words', () => {
    const late = check((doc) => {
      const l = lessonOf(doc, 0);
      delete l.exercises[0]!.payload.new;
      l.exercises[2]!.payload.new = [
        { ku: 'silav', en: 'hello' },
        { ku: 'baş', en: 'good' },
        { ku: 'im', en: 'am' },
      ];
    });
    expect(late.text).toContain('u01s1l1 #3 payload.new: “silav” is marked new after it was already met in exercise 1');
    const never = check((doc) => {
      delete lessonOf(doc, 0).exercises[6]!.payload.new;
    });
    expect(never.text).toContain('u01s1l1: new item “tu” is never marked new');
    const foreign = check((doc) => {
      lessonOf(doc, 1).exercises[9]!.payload.new = [{ ku: 'ji', en: 'from' }];
    });
    expect(foreign.text).toContain('u01s1l2 #10 payload.new: “ji” is marked new but is not one of u01s1l2’s new words');
  });

  it('lets a saying the plan gives a lesson bring its glossed word in that line alone, and asks that it be said', () => {
    const LION: NonNullable<RoadPlan['units'][number]['skills'][number]['lessons'][number]['sayings']> = [
      { ku: 'Ez şêr im!', en: 'I am a lion!', words: [{ ku: 'şêr', en: 'lion' }] },
    ];
    const quoted = (doc: Unit): void => {
      const l = lessonOf(doc, 0);
      l.exercises.push({ position: 13, ...mc('meaning', 'Ez şêr im!', ['I am a lion!', 'I am well!', 'You are a lion!'], 0, 'hamo', [['şêr', 'lion']]) });
    };
    const withSaying = (p: RoadPlan): void => {
      p.units[0]!.skills[0]!.lessons[0]!.sayings = structuredClone(LION);
    };
    expect(check(quoted, withSaying).text).toEqual([]);
    // without the saying in the plan, its word is one the road never taught
    expect(check(quoted).text).toEqual([
      'u01s1l1 #13 payload.say: unknown word “şêr”',
      'u01s1l1 #13 payload.prompt: unknown word “şêr”',
      'u01s1l1 #13 payload.new: “şêr” is marked new but is not one of u01s1l1’s new words',
    ]);
    // the gloss holds for the saying only, not for another line with the same word
    const elsewhere = check((doc) => {
      quoted(doc);
      lessonOf(doc, 1).exercises.push({ position: 13, ...listen(['Tu şêr î!'], 'hamo') });
    }, withSaying);
    expect(elsewhere.text).toContain('u01s1l2 #13 payload.accepted[0]: unknown word “şêr”');
    expect(check(() => {}, withSaying).text).toContain('u01s1l1: saying “Ez şêr im!” is not said in the lesson');
  });

  it('holds a saying in the plan to its Kurdish, its meaning and one or two of its own words', () => {
    const problems = (sayings: unknown): string[] => {
      const p = structuredClone(PLAN);
      p.units[0]!.skills[0]!.lessons[0]!.sayings = sayings as RoadPlan['units'][number]['skills'][number]['lessons'][number]['sayings'];
      // the example plan is one unit of a road, so only what it says of sayings is in question here
      return checkRoadPlan(p).map(formatProblem).filter((t) => t.includes('saying'));
    };
    expect(problems([{ ku: 'Ez şêr im!', en: 'I am a lion!', words: [{ ku: 'şêr', en: 'lion' }] }])).toEqual([]);
    expect(problems([{ ku: 'Ez şêr im!', en: 'I am a lion!', words: [] }])).toHaveLength(1);
    expect(problems([{ ku: 'Ez şêr im!', en: 'I am a lion!', words: [{ ku: 'gur', en: 'wolf' }] }])).toEqual([expect.stringContaining('it does not say “gur”')]);
    expect(problems([{ ku: 'Ez şêr im!', en: 'I am a lion!', words: [{ ku: 'Şêr', en: 'lion' }] }])).toEqual([expect.stringContaining('lower-case Hawar word')]);
  });

  it('shows a picture item the picture of its own word', () => {
    const { text } = check((doc) => {
      lessonOf(doc, 0).exercises[10] = { position: 11, ...mc('picture', 'silav', ['apple', 'bread', 'tea'], 0, 'hamo') };
    });
    expect(text).toContain('u01s1l1 #11 payload.prompt: the right picture is “sêv”, not “silav”');
    const unknown = check((doc) => {
      lessonOf(doc, 0).exercises[10] = { position: 11, ...mc('picture', 'silav', ['apple', 'unicorn'], 0, 'hamo') };
    });
    expect(unknown.text).toContain('u01s1l1 #11 payload.options.1: is not a word picture: unicorn');
  });

  it('brings each new word back in the lessons after it', () => {
    const dropSilav = (doc: Unit): void => {
      const talk = lessonOf(doc, 1).exercises;
      for (const ex of talk) {
        if (ex.type === 'match_pairs') ex.payload.pairs = [['çawa', 'how'], ['spas', 'thanks'], ['erê', 'yes'], ['tu', 'you']].map(([left, right]) => ({ left, right }));
        if (ex.type === 'conversation') {
          const lines = (ex.payload.lines as Array<{ text: string; en: string }>).map((l) => ({ ...l, text: l.text.replace('Silav', 'Spas'), en: l.en.replace('Hello', 'Thanks') }));
          ex.payload = { ...ex.payload, lines };
        }
      }
    };
    expect(check(dropSilav).text).toEqual(['u01s1l1: “silav” does not come back in the three lessons after it: bring it into u01s1l2']);
  });

  it('keeps out what the road never says, in any string of an item', () => {
    const text = check((doc) => {
      const first = lessonOf(doc, 0).exercises[0]!;
      first.payload.options = ['Hello!', 'Xezo is my friend.', 'Goodbye!'];
    }).text;
    expect(text).toEqual(['u01s1l1 #1 payload.options[1]: ties Xezo to Hamo as friend, family or more: they are neighbours in the village, nothing else']);
  });

  it('keeps conversation ids unique and their length in bounds', () => {
    const { text } = check((doc) => {
      const twin = structuredClone(CONVERSATION) as Omit<Ex, 'position'>;
      twin.payload.lines = (twin.payload.lines as unknown[]).slice(0, 4);
      lessonOf(doc, 1).exercises[8] = { position: 9, ...twin };
    });
    expect(text).toContain('u01s1l2 #9 payload.id: conversation id roadu01s1l2a is already used in u01s1l2 #5');
    expect(text).toContain('u01s1l2 #9 payload.lines: a conversation has 6–12 lines, not 4');
  });

  it('holds each lesson to its recipe', () => {
    const short = check((doc) => {
      const l = lessonOf(doc, 0);
      l.exercises = l.exercises.slice(0, 11);
    });
    expect(short.text).toContain('u01s1l1: has 11 exercises (12–16)');
    const noTalk = check((doc) => {
      lessonOf(doc, 1).exercises[4] = { position: 5, ...mc('meaning', 'Spas!', ['Thanks!', 'Hello!', 'Yes!'], 0, 'hamo') };
    });
    expect(noTalk.text).toContain('u01s1l2: a talk lesson has a conversation');
    const deaf = check((doc) => {
      for (const ex of lessonOf(doc, 1).exercises) {
        if (ex.type === 'listening') ex.type = 'writing';
        if (ex.type === 'multiple_choice') delete ex.payload.say;
      }
    });
    expect(deaf.text).toContain('u01s1l2: has no listening (a listening, or a multiple choice with say)');
    const unmet = check(undefined, (p) => p.units[0]!.skills[0]!.lessons[0]!.new.push(item('sêv', 'apple', 'noun', ['sêv'])));
    expect(unmet.text).toContain('u01s1l1: new item “sêv” is met in 0 exercises (at least 4)');
  });

  it('matches the plan’s keys and titles, with positions in order and payloads that pass', () => {
    const { text } = check((doc) => {
      const l = lessonOf(doc, 0);
      l.key = 'u01s1l9';
      l.exercises[2]!.position = 4;
      l.exercises[0]!.payload.correctIndex = 5;
    });
    expect(text).toContain('u01s1l1 key: key should be u01s1l1');
    expect(text).toContain('u01s1l1 #3 position: position should be 3');
    expect(text).toContain('u01s1l1 #1 payload.correctIndex: correctIndex must point at an option');
  });
});

describe('who says a line', () => {
  it('knows the lines only one voice can say in the first person', () => {
    expect(onlySaidBy('Ez Hamo me.')).toBe('hamo');
    expect(onlySaidBy('Ez mêr im.')).toBe('hamo');
    expect(onlySaidBy('Ez jin im.')).toBe('xezo');
    expect(onlySaidBy('Silav! Ez Xezo me.')).toBe('xezo');
    expect(onlySaidBy('Ez mamoste me.')).toBe('xezo');
    expect(onlySaidBy('Ez ajel im!')).toBe('hevalo');
    expect(onlySaidBy('Navê min Hevalo ye!')).toBe('hevalo');
    for (const line of ['Ez birçî me!', 'Hevalo heywan e.', 'Xezo mamoste ye.', 'Ez baş im.']) expect(onlySaidBy(line), line).toBeNull();
  });

  it('keeps a line in the mouth it belongs to, and nobody calls their own name', () => {
    expect(speakerProblems('Ez jin im.', 'hamo')).toEqual(['“Ez jin im.” is Xezo’s to say, not Hamo’s: give it xezo’s voice']);
    expect(speakerProblems('Ez ajel im!', 'xezo')).toEqual(['“Ez ajel im!” is Hevalo’s to say, not Xezo’s: give it hevalo’s voice']);
    expect(speakerProblems('Hevalo, were!', 'hevalo')).toEqual(['Hevalo would say “Hevalo, were!” to himself: model it without the name (the learner says it)']);
    expect(speakerProblems('Silav, Xezo!', 'xezo')).toHaveLength(1);
    for (const [line, who] of [['Hevalo, were!', 'hamo'], ['Hamo, simbêlê xwe biparêze!', 'xezo'], ['Ez jin im.', 'xezo']] as const) expect(speakerProblems(line, who), line).toEqual([]);
  });
});

describe('how a line sounds', () => {
  it('finds a word said three times running, and a line set out like a script', () => {
    expect(soundProblems('Sêv, Hevalo? Erê, erê, erê!')).toHaveLength(1);
    expect(soundProblems('Erê, erê… Sêv, sêv, sêv!')).toHaveLength(1);
    expect(soundProblems('Hevalo: erê, erê. Ez: na, spas.')).toHaveLength(1);
    for (const line of ['Sêv.', 'Ez sêvê dixwim.', 'Erê, erê!', 'Hêdî hêdî.', 'Gotina pêşiyan e: baran bereket e.']) expect(soundProblems(line), line).toEqual([]);
  });
});

describe('what the road never says', () => {
  it('finds talk of what a character is not as a man or a woman, in Kurdish and in English', () => {
    expect(familyProblems('Hevalo ne mêr e, ne jin e, ne zarok e.')).toHaveLength(1);
    expect(familyProblems('Hevalo is neither a man nor a woman.')).toHaveLength(1);
    expect(familyProblems('Hevalo ne zarok e, ew xezal e!')).toEqual([]);
    expect(familyProblems('Mêr û jin li dawetê ne.')).toEqual([]);
  });

  it('finds Xezo tied to Hamo as friend, family or more, and leaves a friend with no name alone', () => {
    for (const line of ['Xezo hevala min e.', 'Ew keça min e, Xezo?', 'Hevala min Xezo ji Amedê ye.', 'Xezoyê ji jina min re got.', 'Xezo is my friend.', 'My niece, Xezo!']) {
      expect(familyProblems(line), line).toHaveLength(1);
    }
    for (const line of ['Ew hevalê min e.', 'Ew hevala min e.', 'Xezo mamoste ye.', 'Keça min? Na! Ew cîrana me ye.', 'That is my friend.']) {
      expect(familyProblems(line), line).toEqual([]);
    }
  });
});

describe('what an exercise records', () => {
  it('records only `say` for a translate from Kurdish, and the answer for one into Kurdish', () => {
    expect(recordedTexts('translate', { say: 'Spas!', prompt: 'In English', accepted: ['Thanks!'] })).toEqual(['Spas!']);
    expect(recordedTexts('translate', { prompt: 'Thanks!', accepted: ['Spas!', 'Spas'] })).toEqual(['Spas!']);
    expect(recordedTexts('match_pairs', { pairs: [{ left: 'silav', right: 'hello' }, { left: 'spas', right: 'thanks' }] })).toEqual(['silav', 'spas']);
    expect(recordedTexts('conversation', CONVERSATION.payload)).toEqual([]);
  });

  it('reads Kurdish words in lower case, with their letters and digits only', () => {
    expect(kurdishWords('Silav, Xezo! Saet 7 e.')).toEqual(['silav', 'xezo', 'saet', '7', 'e']);
  });
});
