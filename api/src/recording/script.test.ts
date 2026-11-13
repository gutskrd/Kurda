import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  LETTER_CLIPS,
  WORD_SET_CLIPS,
  conversationClips,
  conversationLineKey,
  lessonAudioKey,
  lessonAudioTargets,
  storyAudioSentences,
  storyParagraphs,
} from '@kurda/shared';
import { ALPHABET_AUDIO_ROLES } from '../alphabet/routes.js';
import { LESSON_AUDIO_ROLES } from '../lessonaudio/routes.js';
import { ROAD_DIR, readRoadFiles } from '../content/road-seed.js';
import { STUDIO_ROLES, recordsOwnVoicesOnly } from './access.js';
import {
  NARRATOR,
  buildScript,
  castVoice,
  exerciseMeaning,
  gameLineKey,
  linesFor,
  pageAfter,
  peopleOf,
  sectionsOf,
  tally,
  type ExerciseInput,
  type GameInput,
  type PlanInput,
  type ScriptLine,
  type StoryInput,
} from './script.js';
import { planFrom } from './service.js';

const PLAN: PlanInput = { characters: ['hamo', 'xezo', 'hevalo'], about: { hamo: 'The warm uncle.' }, words: [{ ku: 'sêv', en: 'apple' }] };

function exercise(over: Partial<ExerciseInput> & Pick<ExerciseInput, 'type' | 'payload'>): ExerciseInput {
  return {
    courseSlug: 'kurmanji-road',
    courseTitle: 'The Kurmanji Road',
    courseDialect: 'kurmanji',
    unitPosition: 1,
    unitTitle: 'Hello',
    skillPosition: 1,
    lessonPosition: 1,
    lessonId: 'l-1',
    lessonTitle: 'Hello!',
    status: 'draft',
    version: 1,
    exercisePosition: 1,
    ...over,
  };
}

const conversation = {
  id: 'roadu01s1l3a',
  title: 'Bi xêr hatî!',
  speakers: [
    { name: 'Hamo', character: 'hamo' },
    { name: 'Hevalo', character: 'hevalo' },
  ],
  lines: [
    { speaker: 0, text: 'Silav! Bi xêr hatî!', en: 'Hello! Welcome!' },
    { speaker: 1, text: 'Sêv…', en: 'Apples…' },
    { speaker: 0, text: 'Fermo, sêvek!', en: 'Here you are, an apple!' },
  ],
  prompt: 'Why?',
  options: ['a', 'b'],
  correctIndex: 0,
};

const story: StoryInput = { id: 'st-1', dialect: 'kurmanci', title: 'Şorbeya Nîskê', status: 'published', body: 'Dayik şorbe çêdike. Ez birçî me!\n\nSêv sor e.' };

function texts(lines: readonly ScriptLine[]): string[] {
  return lines.map((l) => l.text);
}

describe('the recording script', () => {
  it('lists the lessons in course order — unit, lesson, exercise, each conversation line by line — the Road before any other course', () => {
    const lines = buildScript({
      exercises: [
        exercise({ courseSlug: 'kurmanji', courseTitle: 'Kurmancî for beginners', unitPosition: 1, type: 'translate', payload: { prompt: 'Say: water', accepted: ['Av'] } }),
        exercise({ unitPosition: 2, type: 'speaking', payload: { prompt: 'Say it', reference: 'Ez ji Amedê me.', voice: 'xezo' } }),
        exercise({ exercisePosition: 4, type: 'conversation', payload: conversation }),
        exercise({ exercisePosition: 1, type: 'multiple_choice', payload: { say: 'Silav!', prompt: 'What does he say?', options: ['Hello!', 'No!'], correctIndex: 0, voice: 'hamo' } }),
        exercise({ lessonPosition: 2, exercisePosition: 1, type: 'listening', payload: { prompt: 'Type it', accepted: ['Ez baş im.'], voice: 'hamo' } }),
      ],
      stories: [],
      games: [],
      plan: PLAN,
      letters: [],
      words: [],
    });
    expect(texts(lines)).toEqual(['Silav!', 'Silav! Bi xêr hatî!', 'Sêv…', 'Fermo, sêvek!', 'Ez baş im.', 'Ez ji Amedê me.', 'Av']);
    expect(lines.map((l) => l.seq)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(lines[1]!.places[0]!.label).toBe('Unit 1 · Lesson 1 · conversation ‘Bi xêr hatî!’, line 1');
    expect(lines[4]!.places[0]!.label).toBe('Unit 1 · Lesson 2 · exercise 1 (listening)');
    expect(lines[6]!.places[0]!.label).toBe('Kurmancî for beginners · Unit 1 · Lesson 1 · exercise 1 (translate)');
    expect(lines[5]!.section).toEqual({ id: 'kurmanji-road:2', label: 'Unit 2 · Hello' });
  });

  it('keys every line exactly as the studio does, so a take made in either is the same recording', () => {
    const mc = { say: 'Spas!', prompt: 'x', options: ['Thanks'], correctIndex: 0 };
    const pairs = { pairs: [{ left: 'sêv', right: 'apple' }, { left: 'av', right: 'water' }] };
    const lines = buildScript({
      exercises: [
        exercise({ exercisePosition: 1, type: 'multiple_choice', payload: mc }),
        exercise({ exercisePosition: 2, type: 'match_pairs', payload: pairs }),
        exercise({ exercisePosition: 3, type: 'conversation', payload: conversation }),
      ],
      stories: [story],
      games: [],
      plan: PLAN,
    });
    const keys = new Set(lines.filter((l) => l.store === 'lesson').map((l) => l.key));
    for (const text of [...lessonAudioTargets('multiple_choice', mc), ...lessonAudioTargets('match_pairs', pairs)]) expect(keys).toContain(lessonAudioKey(text));
    for (const c of conversationClips(conversation)) expect(keys).toContain(conversationLineKey(conversation.id, c.part, c.text));
    for (const p of storyParagraphs(story.body)) for (const s of storyAudioSentences(p)) expect(keys).toContain(lessonAudioKey(s));
    // the letters and the word sets in the alphabet's store, under their clip keys
    const clips = new Set(lines.filter((l) => l.store === 'alphabet').map((l) => l.key));
    expect(clips).toEqual(new Set([...WORD_SET_CLIPS, ...LETTER_CLIPS].map((c) => c.key)));
    // a conversation's line carries what the upload needs to file it under its part
    const line = lines.find((l) => l.text === 'Sêv…')!;
    expect(line.conversation).toEqual({ id: 'roadu01s1l3a', part: 1, title: 'Bi xêr hatî!', name: 'Hevalo' });
    expect(line.id).toBe(`lesson|${conversationLineKey('roadu01s1l3a', 1, 'Sêv…')}`);
  });

  it('lists a line said in several places once, with every place, published when any of them is', () => {
    const lines = buildScript({
      exercises: [
        exercise({ exercisePosition: 1, type: 'translate', payload: { prompt: 'Say “Thanks!”', accepted: ['Spas!'] } }),
        // the same exercise in the published version of the same lesson: one place
        exercise({ version: 0, status: 'published', exercisePosition: 1, type: 'translate', payload: { prompt: 'Say “Thanks!”', accepted: ['Spas!'] } }),
        exercise({ unitPosition: 3, lessonId: 'l-9', exercisePosition: 2, type: 'writing', payload: { prompt: 'Write: thanks', accepted: ['spas'] } }),
      ],
      stories: [{ ...story, body: 'Spas.' }],
      games: [{ id: 'g-1', kind: 'question_template', dialect: 'kmr', status: 'draft', payload: { ku: 'Spas!', meanings: { en: 'Thanks!' }, fact: 'x' } }],
      plan: PLAN,
      letters: [],
      words: [],
    });
    expect(lines).toHaveLength(1);
    const [line] = lines;
    expect(line!.places.map((p) => [p.kind, p.label, p.status])).toEqual([
      ['lesson', 'Unit 1 · Lesson 1 · exercise 1 (translate)', 'published'],
      ['lesson', 'Unit 3 · Lesson 1 · exercise 2 (writing)', 'draft'],
      ['story', 'Story ‘Şorbeya Nîskê’ · paragraph 1, sentence 1', 'published'],
      ['game', 'Ez kî me? · a question (not played aloud in the game yet)', 'draft'],
    ]);
    expect(line!.live).toBe(true);
    expect(line!.section.id).toBe('kurmanji-road:1');
  });

  it('gives each line to the first place that plans a voice for it, and the rest to the narrator of its variety', () => {
    const lines = buildScript({
      exercises: [
        // no voice here, Xezal's later: hers, as the studio's plannedSpeaker has it
        exercise({ exercisePosition: 1, type: 'listening', payload: { prompt: 'x', accepted: ['Ez birçî me!'] } }),
        exercise({ lessonPosition: 2, type: 'listening', payload: { prompt: 'x', accepted: ['Ez birçî me!'], voice: 'xezo' } }),
        exercise({ lessonPosition: 3, type: 'listening', payload: { prompt: 'x', accepted: ['Ez birçî me!'], voice: 'hamo' } }),
        exercise({ lessonPosition: 4, type: 'listening', payload: { prompt: 'x', accepted: ['Av sar e.'] } }),
      ],
      stories: [story, { id: 'st-2', dialect: 'sorani', title: 'چیرۆک', status: 'draft', body: 'من برسیمە.' }],
      games: [],
      plan: PLAN,
      letters: [],
      words: [],
    });
    const voice = (text: string): string => lines.find((l) => l.text === text)!.voice;
    expect(voice('Ez birçî me!')).toBe('xezo');
    expect(lines.find((l) => l.text === 'Ez birçî me!')!.speaker).toBe('xezo');
    expect(voice('Av sar e.')).toBe(NARRATOR.kmr);
    expect(voice('Dayik şorbe çêdike.')).toBe(NARRATOR.kmr);
    expect(voice('من برسیمە.')).toBe(NARRATOR.ckb);
    // a narrator's take keeps whoever is drawn for it: no character of its own
    expect(lines.find((l) => l.text === 'Av sar e.')!.speaker).toBeNull();
    // the story's own sentence order, each with the one before it to read on from
    expect(lines.find((l) => l.text === 'Sêv sor e.')!.before).toEqual({ name: null, text: 'Ez birçî me!', meaning: null });
  });

  it('says what each line means where the course says it, and never offers Kurdish as the meaning', () => {
    const lines = buildScript({
      exercises: [
        exercise({ exercisePosition: 1, type: 'match_pairs', payload: { pairs: [{ left: 'baş', right: 'good, well' }] } }),
        exercise({ exercisePosition: 2, type: 'translate', payload: { say: 'Ez baş im.', prompt: 'In English?', accepted: ['I am well.'] } }),
        exercise({ exercisePosition: 3, type: 'conversation', payload: conversation }),
        // a reply question: its options are Kurdish replies, not what the line means
        exercise({ exercisePosition: 4, type: 'multiple_choice', payload: { say: 'Tu çawa yî?', prompt: 'What do you answer?', options: ['Ez baş im.'], correctIndex: 0 } }),
        exercise({ exercisePosition: 5, type: 'multiple_choice', payload: { say: 'Tu birçî yî?', prompt: '“Tu birçî yî?” What is he asking?', options: ['Are you hungry?'], correctIndex: 0 } }),
        exercise({ exercisePosition: 6, type: 'speaking', payload: { prompt: 'Say “Silav, Hamo!” (Hello, Hamo!)', reference: 'Silav, Hamo!' } }),
        exercise({ exercisePosition: 7, type: 'listening', payload: { prompt: 'Type it', accepted: ['sêv'] } }),
      ],
      stories: [],
      games: [],
      plan: PLAN,
      letters: [],
      words: WORD_SET_CLIPS.filter((c) => c.key === 'words:colours:kmr:red'),
    });
    const meaning = (text: string): string | null => lines.find((l) => l.text === text)!.meaning;
    expect(meaning('baş')).toBe('good, well');
    expect(meaning('Ez baş im.')).toBe('I am well.');
    expect(meaning('Sêv…')).toBe('Apples…');
    expect(meaning('Tu çawa yî?')).toBeNull();
    expect(meaning('Tu birçî yî?')).toBe('Are you hungry?');
    expect(meaning('Silav, Hamo!')).toBe('Hello, Hamo!');
    // from the plan's words, which a listening item does not say
    expect(meaning('sêv')).toBe('apple');
    // a word set's word, by what the page shows it as
    expect(lines.find((l) => l.store === 'alphabet')!.meaning).toBe('red');
    // and the line before, to act from
    expect(lines.find((l) => l.text === 'Fermo, sêvek!')!.before).toEqual({ name: 'Hevalo', text: 'Sêv…', meaning: 'Apples…' });
  });

  it('reads meanings off a prompt only where the prompt asks what the Kurdish says', () => {
    expect(exerciseMeaning('multiple_choice', { say: 'Spas, hevalo!', prompt: 'Hamo says “Spas, hevalo!” Why?', options: ['“Hevalo” means friend.'], correctIndex: 0 }, 'Spas, hevalo!').guess).toBeNull();
    expect(exerciseMeaning('multiple_choice', { say: 'Tu kengî diçî?', prompt: 'What does he want to know?', options: ['When she goes'], correctIndex: 0 }, 'Tu kengî diçî?').guess).toBeNull();
    expect(exerciseMeaning('multiple_choice', { say: 'Ez Hamo me.', prompt: '“Ez Hamo me.” What does he tell you?', options: ['I am Hamo.'], correctIndex: 0 }, 'Ez Hamo me.').guess).toBe('I am Hamo.');
    expect(exerciseMeaning('writing', { prompt: 'Write: “I am well too.”', accepted: ['Ez jî baş im.'] }, 'Ez jî baş im.').guess).toBe('I am well too.');
    expect(exerciseMeaning('translate', { prompt: 'Answer Hamo: “I am well.”', accepted: ['Ez baş im.'] }, 'Ez baş im.').guess).toBe('I am well.');
  });

  it('lists the games’ spoken lines last, a case’s card under the conversation line it was copied from', () => {
    const lineKey = conversationLineKey(conversation.id, 0, 'Fermo, sêvek!');
    const games: GameInput[] = [
      { id: 'g-q', kind: 'question_template', dialect: 'ckb', status: 'draft', payload: { ku: 'ئاش', meanings: { en: 'the mill' }, fact: 'place' } },
      {
        id: 'g-case',
        kind: 'case_file',
        dialect: 'kmr',
        status: 'published',
        payload: {
          title: { en: 'The missing apples' },
          suspects: [{ id: 'bozo', name: 'Bozo' }],
          evidence: [
            { id: 'e1', kind: 'overheard', ku: 'Fermo, sêvek!', meanings: { en: 'Here, an apple!' }, speaker: 'hamo', recording: lineKey },
            { id: 'e2', kind: 'statement', ku: 'Ez li malê bûm.', meanings: { en: 'I was at home.' }, speaker: 'hevalo', from: 'bozo' },
          ],
        },
      },
      { id: 'g-old', kind: 'case_file', dialect: 'kmr', status: 'archived', payload: { evidence: [{ id: 'e1', kind: 'note', ku: 'Kevn e.' }] } },
      // rows written for games that are no longer part of Hevalo: nobody is asked to record them
      { id: 'g-b', kind: 'building_name', dialect: 'ckb', status: 'draft', payload: { building: 'mill', ku: 'ئاش', meanings: { en: 'the mill' } } },
      {
        id: 'g-scene',
        kind: 'scenario',
        dialect: 'kmr',
        status: 'published',
        payload: {
          situation: { en: 'Hamo offers you fruit.' },
          speaker: 'hamo',
          line: { ku: 'Fermo, sêvek!', meanings: { en: 'Here, an apple!' }, recording: lineKey },
          reply: { ku: 'Spas, xalo!', meanings: { en: 'Thanks, uncle!' } },
        },
      },
    ];
    const lines = buildScript({ exercises: [exercise({ type: 'conversation', payload: conversation })], stories: [], games, plan: PLAN, letters: [], words: [] });
    const merged = lines.find((l) => l.key === lineKey)!;
    expect(merged.places.map((p) => p.kind)).toEqual(['conversation', 'game']);
    expect(merged.places[1]!.label).toBe('Detektîf · case ‘The missing apples’ · overheard 1');
    // the case before the question, whatever order the rows came in
    expect(texts(lines.slice(3))).toEqual(['Ez li malê bûm.', 'ئاش']);
    expect(lines.find((l) => l.text === 'Ez li malê bûm.')).toMatchObject({ voice: 'hevalo', cue: 'From Bozo.', section: { id: 'games:case_file' } });
    const mill = lines.find((l) => l.text === 'ئاش')!;
    expect(mill).toMatchObject({ voice: NARRATOR.ckb, dialect: 'ckb' });
    expect(mill.places.map((p) => p.ref?.id)).toEqual(['g-q']);
    expect(lines.some((l) => l.text === 'Kevn e.')).toBe(false);
    // the scene's reply is said nowhere else, and its line only in the conversation and the case
    expect(lines.some((l) => l.text === 'Spas, xalo!')).toBe(false);
    expect(merged.places.map((p) => p.ref?.id ?? null)).not.toContain('g-scene');
  });

  it('trusts a game line’s recording key only while it is still the key of those words', () => {
    const key = conversationLineKey('roadu01s1l3a', 1, 'Sêv…');
    expect(gameLineKey('Sêv…', key)).toEqual({ key, conversation: { id: 'roadu01s1l3a', part: 1 } });
    expect(gameLineKey('Sêv sor e.', key)).toEqual({ key: lessonAudioKey('Sêv sor e.'), conversation: null });
    expect(gameLineKey('Sêv…', 'sêv')).toEqual({ key: 'sêv', conversation: null });
  });

  it('names the people from the voice plan, then the parts no character plays, then a narrator for each variety', () => {
    const legacy = { ...conversation, id: 'oldconv01', speakers: [{ name: 'Nazê' }, { name: 'Hamo', character: 'hamo' }], lines: [{ speaker: 0, text: 'Were!' }, { speaker: 1, text: 'Ez têm.' }] };
    const lines = buildScript({ exercises: [exercise({ type: 'conversation', payload: legacy })], stories: [], games: [], plan: PLAN, letters: [], words: [] });
    expect(lines.find((l) => l.text === 'Were!')).toMatchObject({ voice: castVoice('Nazê'), speaker: null });
    const people = peopleOf(lines, PLAN);
    expect(people.map((p) => [p.id, p.name])).toEqual([
      ['hamo', 'Hamo'],
      ['xezo', 'Xezal'],
      ['hevalo', 'Hevalo'],
      ['cast-naze', 'Nazê'],
      ['narrator-kmr', 'Narrator · Kurmancî'],
      ['narrator-ckb', 'Narrator · Soranî'],
    ]);
    expect(people[0]!.about).toBe('The warm uncle.');
  });

  it('counts, narrows and pages one voice’s lines in script order', () => {
    const lines = buildScript({ exercises: [], stories: [], games: [], plan: PLAN, letters: LETTER_CLIPS.slice(0, 5), words: WORD_SET_CLIPS.filter((c) => c.group === 'colours') });
    const recorded = new Set(['kmr:sound:a', 'words:colours:kmr:red']);
    const done = (l: ScriptLine): boolean => recorded.has(l.key);
    const kmr = linesFor(lines, { voice: NARRATOR.kmr }, done);
    const counted = tally(kmr, done);
    expect(counted).toMatchObject({ done: 2, todo: kmr.length - 2, dialects: [{ dialect: 'kmr', done: 2 }] });
    expect(linesFor(lines, { voice: NARRATOR.kmr, status: 'done' }, done).map((l) => l.key)).toEqual(['words:colours:kmr:red', 'kmr:sound:a']);
    expect(linesFor(lines, { voice: NARRATOR.ckb, dialect: 'kmr' }, done)).toEqual([]);
    const first = pageAfter(kmr, null, 3);
    const second = pageAfter(kmr, first.next, 3);
    expect(first.lines).toHaveLength(3);
    expect(second.lines[0]!.seq).toBeGreaterThan(first.lines[2]!.seq);
    expect([...first.lines, ...second.lines, ...pageAfter(kmr, second.next, 100).lines].map((l) => l.id)).toEqual(kmr.map((l) => l.id));
    expect(pageAfter(kmr, kmr.at(-1)!.seq, 3)).toEqual({ lines: [], next: null });
    expect(sectionsOf(kmr, done).map((s) => [s.id, s.done])).toEqual([
      ['words:colours', 1],
      ['alphabet:kmr-sound', 1],
    ]);
  });
});

describe('the Kurmanji Road in the script', () => {
  it('has every line the studio would ask for from all of the Road’s units, each person’s from the plan', async () => {
    const files = await readRoadFiles(ROAD_DIR);
    const plan = planFrom(JSON.parse(await readFile(new URL('plan.json', ROAD_DIR), 'utf8')));
    expect(new Set(files.lessons.map((l) => l.unit.position))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
    const exercises: ExerciseInput[] = files.lessons.flatMap((l) =>
      l.exercises.map((e) =>
        exercise({ unitPosition: l.unit.position, skillPosition: l.skill.position, lessonPosition: l.position, lessonId: null, exercisePosition: e.position, type: e.type, payload: e.payload }),
      ),
    );
    const lines = buildScript({ exercises, stories: [], games: [], plan, letters: [], words: [] });
    const byKey = new Map(lines.map((l) => [l.key, l]));
    let asked = 0;
    for (const e of exercises) {
      const keys = e.type === 'conversation' ? conversationClips(e.payload).map((c) => c.key) : lessonAudioTargets(e.type, e.payload).map(lessonAudioKey);
      for (const key of keys) {
        asked += 1;
        expect(byKey.has(key), key).toBe(true);
      }
    }
    expect(asked).toBeGreaterThan(lines.length);
    // every conversation line is its character's, and everything is a draft until it is published
    for (const e of exercises.filter((x) => x.type === 'conversation')) {
      for (const c of conversationClips(e.payload)) expect(byKey.get(c.key)!.voice).toBe(c.character);
    }
    expect(lines.every((l) => !l.live && l.places.every((p) => p.status === 'draft'))).toBe(true);
    expect(peopleOf(lines, plan).map((p) => p.id)).toEqual(['hamo', 'xezo', 'hevalo', 'narrator-kmr', 'narrator-ckb']);
    // Hamo is the road's main voice
    const counts = new Map(peopleOf(lines, plan).map((p) => [p.id, lines.filter((l) => l.voice === p.id).length]));
    expect(counts.get('hamo')!).toBeGreaterThan(counts.get('xezo')!);
    expect(counts.get('hevalo')!).toBeGreaterThan(0);
  });
});

describe('who records from the people page', () => {
  it('keeps the studio’s recording roles, and narrows only a voice actor with none of them', () => {
    expect([...STUDIO_ROLES].sort()).toEqual([...ALPHABET_AUDIO_ROLES].sort());
    expect([...STUDIO_ROLES].sort()).toEqual([...LESSON_AUDIO_ROLES].sort());
    expect(recordsOwnVoicesOnly(['voice_actor'])).toBe(true);
    expect(recordsOwnVoicesOnly(['voice_actor', 'content_editor'])).toBe(false);
    expect(recordsOwnVoicesOnly(['superadmin'])).toBe(false);
    expect(recordsOwnVoicesOnly([])).toBe(false);
  });
});
