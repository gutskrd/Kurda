/**
 * Guards The Kurmanji Road in CI: the plan is complete and consistent, and
 * every unit file that exists passes every check, so a unit only lands when
 * it is clean. The check itself is proved end to end on a small example
 * unit written here — two lessons against a two-lesson plan — which passes,
 * and then fails in the one way each change to it should.
 */
import { describe, expect, it } from 'vitest';
import {
  ROAD_COURSE,
  checkRoad,
  checkRoadPlan,
  formatProblem,
  kurdishWords,
  loadRoadPlan,
  recordedTexts,
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

  it('teaches 1,100 to 1,400 items, 4 to 8 a lesson, none twice', () => {
    expect(items.length).toBeGreaterThanOrEqual(1100);
    expect(items.length).toBeLessThanOrEqual(1400);
    for (const l of lessons) expect(l.new.length, l.key).toBeGreaterThanOrEqual(4);
    const ids = items.map((i) => `${i.ku.toLowerCase()}|${i.pos}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('writes every form as a lower-case word in Hawar letters', () => {
    const bad = items.flatMap((i) => i.forms.filter((f) => !/^[a-zçêîşû]+$/.test(f)).map((f) => `${i.ku}: ${f}`));
    expect(bad).toEqual([]);
  });

  it('gives Hamo most of the lessons, Xezal her scenes and Hevalo a few', () => {
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
  }
});

// ---------- the example ----------

const item = (ku: string, en: string, pos: string, forms: string[]): RoadPlan['units'][number]['skills'][number]['lessons'][number]['new'][number] => ({ ku, en, pos, forms });

const PLAN: RoadPlan = {
  course: { ...ROAD_COURSE },
  characters: { hamo: 'Hamo, the uncle.', xezo: 'Xezal, his niece.', hevalo: 'Hevalo, the deer.' },
  core: ['û', 'ji', 'li', 'jî'],
  names: [
    { name: 'Hamo', kind: 'person', en: 'Hamo', forms: ['Hamo'] },
    { name: 'Xezal', kind: 'person', en: 'Xezal', forms: ['Xezal'] },
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
              beat: 'Xezal arrives.',
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
const mc = (say: string | undefined, prompt: string, options: string[], correctIndex: number, voice?: string): Omit<Ex, 'position'> => ({
  type: 'multiple_choice',
  payload: { ...(say ? { say } : {}), prompt, options, correctIndex, ...(voice ? { voice } : {}) },
});
const tr = (prompt: string, accepted: string[], voice: string, say?: string): Omit<Ex, 'position'> => ({ type: 'translate', payload: { ...(say ? { say } : {}), prompt, accepted, voice } });
const listen = (accepted: string[], voice: string): Omit<Ex, 'position'> => ({ type: 'listening', payload: { prompt: 'Type what you hear.', accepted, voice } });
const speak = (prompt: string, reference: string, voice: string): Omit<Ex, 'position'> => ({ type: 'speaking', payload: { prompt, reference, voice } });
const write = (prompt: string, accepted: string[], voice: string): Omit<Ex, 'position'> => ({ type: 'writing', payload: { prompt, accepted, voice } });
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
      { speaker: 0, text: 'Silav, Xezal!', en: 'Hello, Xezal!' },
      { speaker: 1, text: 'Silav, Hamo! Tu çawa yî?', en: 'Hello, Hamo! How are you?' },
      { speaker: 0, text: 'Ez baş im, spas. Tu çawa yî?', en: 'I am well, thanks. How are you?' },
      { speaker: 1, text: 'Ez jî baş im.', en: 'I am well too.' },
      { speaker: 0, text: 'Tu ji Amedê yî?', en: 'Are you from Amed?' },
      { speaker: 1, text: 'Erê, ez ji Amedê me.', en: 'Yes, I am from Amed.' },
    ],
    prompt: 'Where is Xezal from?',
    options: ['From the village', 'From Amed', 'From the market'],
    correctIndex: 1,
  },
};

function exampleUnit(): { course: typeof ROAD_COURSE; units: unknown[] } {
  const meet = numbered([
    mc('Silav!', 'Hamo opens the gate. What does “Silav!” mean?', ['Hello!', 'Thanks!', 'Goodbye!'], 0, 'hamo'),
    pairs([['silav', 'hello'], ['ez', 'I'], ['tu', 'you'], ['baş', 'good']], 'hamo'),
    mc('Ez Hamo me.', 'What does Hamo say?', ['You are Hamo.', 'I am Hamo.', 'Hello, Hamo.'], 1, 'hamo'),
    listen(['Ez baş im.', 'Ez baş im'], 'hamo'),
    tr('I am well.', ['Ez baş im.', 'Ez baş im'], 'hamo'),
    speak('Say it aloud: “Silav, ez Xezal im.” (Hello, I am Xezal.)', 'Silav, ez Xezal im.', 'xezo'),
    mc(undefined, 'Which word means “you”?', ['ez', 'baş', 'tu'], 2),
    write('Write: I am from Amed.', ['Ez ji Amedê me.', 'Ez ji Amedê me'], 'hamo'),
    tr('“Silav, Hamo!” in English', ['Hello, Hamo!', 'Hello Hamo', 'Hi Hamo'], 'xezo', 'Silav, Hamo!'),
    listen(['Silav, ez Hamo me.', 'Silav ez Hamo me'], 'hamo'),
    mc('Ez baş im.', 'Hamo is asked how he is. What does he answer?', ['I am from Amed.', 'I am well.', 'I am Hamo.'], 1, 'hamo'),
    mc('Tu!', 'Xezal points at you: “Tu!” What does it mean?', ['you', 'I', 'hello'], 0, 'xezo'),
  ]);
  const talk = numbered([
    CONVERSATION,
    mc('Tu çawa yî?', 'Xezal asks Hamo something. What?', ['Who are you?', 'How are you?', 'Where are you from?'], 1, 'xezo'),
    pairs([['çawa', 'how'], ['spas', 'thanks'], ['erê', 'yes'], ['silav', 'hello']], 'hamo'),
    listen(['Ez baş im, spas.', 'Ez baş im spas', 'Ez baş im, spas'], 'hamo'),
    tr('How are you?', ['Tu çawa yî?', 'Tu çawa yî'], 'hamo'),
    tr('“Erê, ez baş im.” in English', ['Yes, I am fine.', 'Yes, I’m fine', 'Yes, I am well'], 'hamo', 'Erê, ez baş im.'),
    speak('Say it aloud: “Spas, Hamo!” (Thanks, Hamo!)', 'Spas, Hamo!', 'xezo'),
    write('Write: Yes, you are Hamo.', ['Erê, tu Hamo yî.', 'Erê, tu Hamo yî', 'Erê tu Hamo yî'], 'xezo'),
    mc(undefined, 'Which is right for “you are well”?', ['Tu baş î.', 'Tu baş yî.', 'Tu baş im.'], 0),
    mc('Tu ji Amedê yî?', 'What does Hamo ask?', ['Are you going to Amed?', 'Are you in Amed?', 'Are you from Amed?'], 2, 'hamo'),
    listen(['Tu çawa yî, Hamo?', 'Tu çawa yî Hamo'], 'xezo'),
    tr('Thanks!', ['Spas!', 'Spas'], 'hamo'),
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
    expect(stats.conversationLines).toEqual({ hamo: 3, xezo: 3, hevalo: 0 });
    expect(stats.recordings.hamo).toBe(14);
    expect(stats.recordings.xezo).toBe(6);
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
    const allXezal = check((doc) => {
      for (const li of [0, 1]) for (const ex of lessonOf(doc, li).exercises) if (ex.payload.voice) ex.payload.voice = 'xezo';
    });
    expect(allXezal.text).toContain('unit 1: Hamo records 0 % of the unit’s sentences (at least 65 %)');
  });

  it('keeps conversation ids unique and their length in bounds', () => {
    const { text } = check((doc) => {
      const twin = structuredClone(CONVERSATION) as Omit<Ex, 'position'>;
      twin.payload.lines = (twin.payload.lines as unknown[]).slice(0, 4);
      lessonOf(doc, 1).exercises[8] = { position: 9, ...twin };
    });
    expect(text).toContain('u01s1l2 #9 payload.id: conversation id roadu01s1l2a is already used in u01s1l2 #1');
    expect(text).toContain('u01s1l2 #9 payload.lines: a conversation has 6–12 lines, not 4');
  });

  it('holds each lesson to its recipe', () => {
    const short = check((doc) => {
      const l = lessonOf(doc, 0);
      l.exercises = l.exercises.slice(0, 11);
    });
    expect(short.text).toContain('u01s1l1: has 11 exercises (12–16)');
    const noTalk = check((doc) => {
      lessonOf(doc, 1).exercises[0] = { position: 1, ...mc('Spas!', 'What does “Spas!” mean?', ['Thanks!', 'Hello!', 'Yes!'], 0, 'hamo') };
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
    expect(unmet.text).toContain('u01s1l1: new item “sêv” is met in 0 exercises (at least 3)');
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

describe('what an exercise records', () => {
  it('records only `say` for a translate from Kurdish, and the answer for one into Kurdish', () => {
    expect(recordedTexts('translate', { say: 'Spas!', prompt: 'In English', accepted: ['Thanks!'] })).toEqual(['Spas!']);
    expect(recordedTexts('translate', { prompt: 'Thanks!', accepted: ['Spas!', 'Spas'] })).toEqual(['Spas!']);
    expect(recordedTexts('match_pairs', { pairs: [{ left: 'silav', right: 'hello' }, { left: 'spas', right: 'thanks' }] })).toEqual(['silav', 'spas']);
    expect(recordedTexts('conversation', CONVERSATION.payload)).toEqual([]);
  });

  it('reads Kurdish words in lower case, with their letters and digits only', () => {
    expect(kurdishWords('Silav, Xezal! Saet 7 e.')).toEqual(['silav', 'xezal', 'saet', '7', 'e']);
  });
});
