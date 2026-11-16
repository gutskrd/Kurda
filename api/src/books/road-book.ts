/**
 * The Hevalo book: the Kurmanji Road on paper, chapter by chapter, for a
 * learner to download as a PDF and keep beside the app.
 *
 * What a chapter holds comes from the same files the course is seeded from
 * (content/lessons/road and content/stories/road.json), gathered here into a
 * plain outline (`roadBookChapters`) that pdf.ts lays out. A chapter is its
 * four parts; a part is its grammar note and its four lessons; and a lesson
 * is what the app teaches in it: the little scene it happens in (the plan's
 * beat), its new words, the line Hamo has the learner say after him, a few
 * of its sentences to read aloud with their meaning, and its conversation.
 * Then the story Hamo tells at the chapter's end, with its English and its
 * questions, and practice for a pencil, whose answers wait at the back.
 *
 * Every kind of exercise gives the book something (see `lessonOf` and
 * `practiceOf`), and nothing Kurdish is written here: every word and line is
 * taken as the files have it.
 *
 * Pure: the routes decide which chapters a learner may have (only the ones
 * online), and the files are read by the caller.
 */
import { LATIN_LETTERS, PATH_LANDS, type PathLand } from '@kurda/shared';

/** The parts of the course files the book reads, as loose as the files themselves. */
export interface BookPlanUnit {
  number: number;
  cefr: string;
  titleKu: string;
  titleEn: string;
  story: string;
  skills: Array<{
    position: number;
    titleKu: string;
    titleEn: string;
    grammar?: string;
    grammarMd?: string;
    lessons: Array<{
      key: string;
      position?: number;
      titleKu: string;
      titleEn: string;
      focus?: string;
      beat?: string;
      new: Array<{ ku: string; en: string; pos?: string; gender?: string }>;
    }>;
  }>;
}

export interface BookPlan {
  characters: Record<string, string>;
  /** everyone and every place the road names, each with a few words on who or what it is */
  names?: Array<{ name: string; kind: string; en: string; forms?: string[] }>;
  units: BookPlanUnit[];
}

interface BookExercise {
  position: number;
  type: string;
  payload: Record<string, unknown>;
}

export interface BookUnitDoc {
  units: Array<{
    position: number;
    skills: Array<{
      position: number;
      lessons: Array<{ key?: string; position: number; exercises: BookExercise[] }>;
    }>;
  }>;
}

export interface BookStory {
  slug: string;
  title: string;
  body: string;
  translations?: { en?: string };
  glossary?: Array<{ term: string; meanings: { en: string } }>;
  questions?: Array<{ promptEn?: string | null; prompt: string; options: string[]; correctIndex: number }>;
}

export interface BookWord {
  ku: string;
  en: string;
  /** masculine, feminine, or either (a neighbour, a teacher), where the plan says */
  gender: 'm' | 'f' | 'mf' | null;
  /** what kind of word the plan says it is: noun, verb, num … */
  pos: string | null;
  /** the picture the lessons themselves show for it (the right card of a "pick the picture" item), when they do */
  picture: string | null;
}

export interface BookLine {
  /** who says it, as the book names them: a character, or "You" for the learner */
  who: string;
  learner: boolean;
  text: string;
  en: string | null;
}

export interface BookDialogue {
  title: string | null;
  lines: BookLine[];
  /** what the lesson asks about it afterwards, in English; the answer waits at the back */
  question: { prompt: string; options: string[]; answer: number } | null;
}

/** A Kurdish line with what it means. */
export interface BookPair {
  ku: string;
  en: string;
}

export interface BookLesson {
  key: string;
  /** its place in its part, from 1 */
  position: number;
  titleKu: string;
  titleEn: string;
  /** what the lesson is for, in the plan's word: meet, build, talk or review */
  focus: string;
  /** the little scene the lesson happens in, in English, as the plan tells it */
  beat: string;
  words: BookWord[];
  /** the line Hamo says for the learner to say after him */
  say: string | null;
  /** a few of the lesson's lines with their meaning, to read aloud */
  sentences: BookPair[];
  dialogue: BookDialogue | null;
}

export interface BookPart {
  position: number;
  titleKu: string;
  titleEn: string;
  /** what the part teaches, in a line */
  grammar: string;
  grammarMd: string;
  lessons: BookLesson[];
}

/** A chapter's practice, one kind of task from each kind of exercise the lessons set. */
export interface BookPractice {
  /** words to join to their meanings with a line (the lessons' matching pairs) */
  match: BookPair[];
  /** lines with a word left out, and the word (the lessons' "which word is missing"); `cue` is the lesson's own hint */
  gaps: Array<{ text: string; answer: string; cue: string | null }>;
  /** what Hamo says, and what to answer (the lessons' "what do you say back") */
  replies: Array<{ say: string; answer: string; cue: string | null }>;
  /** English to put into Kurdish (the lessons' translating and writing) */
  toKurdish: BookPair[];
  /** pictures to name (the lessons' "pick the picture"): a word picture's id, and its word */
  pictures: Array<{ picture: string; ku: string }>;
  /** lines the lessons only say aloud, with no English beside them: to read alone */
  alone: string[];
}

export interface BookChapter {
  number: number;
  cefr: string;
  titleKu: string;
  titleEn: string;
  /** what happens in the chapter, in English */
  summary: string;
  land: PathLand;
  parts: BookPart[];
  tale: {
    title: string;
    paragraphs: string[];
    english: string[];
    glossary: Array<{ term: string; en: string }>;
    questions: Array<{ prompt: string; promptEn: string | null; options: string[]; answer: number }>;
  } | null;
  practice: BookPractice;
  /** the chapter's own line about Hevalo and his apples, for the page it ends on */
  gag: BookPair | null;
}

const PARAGRAPH = /\n\s*\n/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);

/** A fair spread of at most `max` of `list`, starting from the first, the same every time. */
export function spread<T>(list: readonly T[], max: number): T[] {
  if (max <= 0) return [];
  if (list.length <= max) return [...list];
  const step = list.length / max;
  return Array.from({ length: max }, (_, i) => list[Math.floor(i * step)]!);
}

/** The right option of a choice, when it has one. */
function rightOption(p: Record<string, unknown>): string | null {
  return typeof p.correctIndex === 'number' ? str(strings(p.options)[p.correctIndex]) : null;
}

/** A small number from a text, the same on every machine: what the book deals a question's options by. */
function tally(text: string): number {
  let sum = 0;
  for (const ch of text) sum = (sum * 31 + ch.codePointAt(0)!) % 9973;
  return sum;
}

/**
 * A question's options as the book prints them. In the files the right one
 * always comes first (the app deals them afresh each time it asks); a book
 * is dealt once, so the right one is moved to a place worked out from `by`,
 * and the answers at the back are not all "a".
 */
export function dealt(options: readonly string[], right: number, by: string): { options: string[]; answer: number } {
  const others = options.filter((_, i) => i !== right);
  const answer = options.length === 0 ? 0 : tally(by) % options.length;
  return { options: [...others.slice(0, answer), options[right]!, ...others.slice(answer)], answer };
}

/** A lesson's conversation, as the book prints it. */
function dialogueOf(exercises: readonly BookExercise[]): BookDialogue | null {
  const conv = exercises.find((e) => e.type === 'conversation');
  if (!conv) return null;
  const p = conv.payload;
  const speakers = Array.isArray(p.speakers) ? p.speakers : [];
  const lines = (Array.isArray(p.lines) ? p.lines : []).flatMap((l): BookLine[] => {
    if (!isRecord(l) || typeof l.text !== 'string' || typeof l.speaker !== 'number') return [];
    const part = speakers[l.speaker];
    const learner = isRecord(part) && part.learner === true;
    const who = learner ? 'You' : isRecord(part) && typeof part.name === 'string' ? part.name : 'Hamo';
    return [{ who, learner, text: l.text, en: str(l.en) }];
  });
  if (lines.length === 0) return null;
  const prompt = str(p.prompt);
  const options = strings(p.options);
  const right = typeof p.correctIndex === 'number' && p.correctIndex >= 0 && p.correctIndex < options.length ? p.correctIndex : -1;
  const question = prompt && options.length > 1 && right >= 0 ? { prompt, ...dealt(options, right, `${str(p.id) ?? ''}|${prompt}`) } : null;
  return { title: str(p.title), lines, question };
}

/**
 * A lesson's Kurdish lines with what they mean: the items that ask for the
 * English of something Hamo says — a choice of what his line means, whose
 * right option is its English, or a translation into English.
 */
function pairsOf(exercises: readonly BookExercise[]): BookPair[] {
  const out: BookPair[] = [];
  const seen = new Set<string>();
  for (const e of exercises) {
    const p = e.payload;
    const meaning = e.type === 'multiple_choice' && p.ask === 'meaning';
    if (!meaning && !(e.type === 'translate' && p.ask === 'to-english')) continue;
    const ku = str(p.say);
    const en = meaning ? rightOption(p) : str(strings(p.accepted)[0]);
    if (!ku || !en || seen.has(ku)) continue;
    seen.add(ku);
    out.push({ ku, en });
  }
  return out;
}

const genderOf = (g: string | undefined): BookWord['gender'] => (g === 'm' || g === 'f' || g === 'mf' ? g : null);
const sorted = (exercises: readonly BookExercise[]): BookExercise[] => [...exercises].sort((a, b) => a.position - b.position);
const wordsIn = (text: string): number => text.trim().split(/\s+/).length;

/** How many lines a lesson gives to read aloud: a lesson with a conversation is read as that. */
const READ_ALOUD = 2;

/**
 * One lesson, from the plan and its exercises. What each kind of exercise
 * gives it: "pick the picture" ties a word to its picture; the line to
 * repeat is the line to say after Hamo; "what does it mean" and translating
 * into English are the lines to read aloud; the conversation is printed
 * whole, with the question the lesson asks about it. (The other kinds are
 * the chapter's practice: `practiceOf`.)
 */
function lessonOf(plan: BookPlanUnit['skills'][number]['lessons'][number], index: number, exercises: readonly BookExercise[]): BookLesson {
  const pictures = new Map<string, string>();
  for (const e of exercises) {
    if (e.type !== 'multiple_choice' || e.payload.ask !== 'picture') continue;
    const word = str(e.payload.prompt);
    const right = rightOption(e.payload);
    if (word && right && !pictures.has(word)) pictures.set(word, right);
  }
  const dialogue = dialogueOf(exercises);
  const speaking = exercises.find((e) => e.type === 'speaking');
  // a line of one word is on the page already, as a word; a line of the conversation is in the conversation
  const spoken = new Set(dialogue?.lines.map((l) => l.text) ?? []);
  const all = pairsOf(exercises).filter((s) => !spoken.has(s.ku));
  const whole = all.filter((s) => wordsIn(s.ku) > 1);
  return {
    key: plan.key,
    position: plan.position ?? index + 1,
    titleKu: plan.titleKu,
    titleEn: plan.titleEn,
    focus: plan.focus ?? '',
    beat: plan.beat ?? '',
    words: plan.new.map((w) => ({ ku: w.ku, en: w.en, gender: genderOf(w.gender), pos: w.pos ?? null, picture: pictures.get(w.ku) ?? null })),
    say: speaking ? (str(speaking.payload.reference) ?? str(speaking.payload.prompt)) : null,
    sentences: dialogue ? [] : spread(whole.length >= READ_ALOUD ? whole : all, READ_ALOUD),
    dialogue,
  };
}

/** How much of each kind of task a chapter's practice holds. */
const PRACTICE = { match: 8, gaps: 6, replies: 4, toKurdish: 4, pictures: 6, alone: 3 } as const;

/**
 * The fewest lines a gap task is worth setting: with a line or two, the box
 * of words beside it gives the answers away. A chapter with fewer is given
 * this many more lines to put into Kurdish instead.
 */
const GAPS_AT_LEAST = 3;

/**
 * A chapter's practice, from all its lessons' exercises: the matching pairs
 * to join, the missing words to fill in (from a choice or from writing), the
 * replies to give, the English to put into Kurdish (translating, writing, or
 * choosing the right Kurdish), the pictures to name, and the lines the
 * lessons only say aloud, to read alone. Only what is right is taken: a
 * choice's wrong options are wrong on purpose, and stay in the app.
 */
function practiceOf(exercises: readonly BookExercise[], printed: ReadonlySet<string>): BookPractice {
  const match: BookPair[] = [];
  const gaps: BookPractice['gaps'] = [];
  const replies: BookPractice['replies'] = [];
  const toKurdish: BookPair[] = [];
  const pictures: BookPractice['pictures'] = [];
  const alone: string[] = [];
  const once = new Set<string>();
  const first = (key: string): boolean => (once.has(key) ? false : (once.add(key), true));
  for (const e of exercises) {
    const p = e.payload;
    if (e.type === 'match_pairs') {
      for (const pair of Array.isArray(p.pairs) ? p.pairs : []) {
        if (isRecord(pair) && typeof pair.left === 'string' && typeof pair.right === 'string' && first(`match|${pair.left}`)) match.push({ ku: pair.left, en: pair.right });
      }
    } else if (p.ask === 'missing') {
      const text = str(p.prompt);
      const answer = e.type === 'writing' ? str(strings(p.accepted)[0]) : rightOption(p);
      if (text && answer && text.includes('___') && first(`gap|${text}`)) gaps.push({ text, answer, cue: str(p.cue) });
    } else if (e.type === 'multiple_choice' && p.ask === 'reply') {
      const say = str(p.say) ?? str(p.prompt);
      const answer = rightOption(p);
      if (say && answer && first(`reply|${say}|${answer}`)) replies.push({ say, answer, cue: str(p.cue) });
    } else if (p.ask === 'to-kurdish' || p.ask === 'choose-kurdish') {
      const en = str(p.prompt);
      const ku = p.ask === 'choose-kurdish' ? rightOption(p) : str(strings(p.accepted)[0]);
      if (en && ku && !printed.has(ku) && first(`ku|${en}`)) toKurdish.push({ en, ku });
    } else if (e.type === 'multiple_choice' && p.ask === 'picture') {
      const ku = str(p.prompt);
      const picture = rightOption(p);
      if (ku && picture && first(`picture|${picture}`)) pictures.push({ picture, ku });
    } else if (e.type === 'listening') {
      const line = str(strings(p.accepted)[0]);
      if (line && !printed.has(line) && first(`alone|${line}`)) alone.push(line);
    }
  }
  // a reply with the lesson's own hint says what is going on, and a sentence is a fairer thing to translate than one word
  const hinted = replies.filter((r) => r.cue !== null);
  const sentences = toKurdish.filter((t) => wordsIn(t.ku) > 1);
  const few = gaps.length < GAPS_AT_LEAST;
  const into = PRACTICE.toKurdish + (few ? GAPS_AT_LEAST : 0);
  // what is joined with a line is a word and its meaning: a whole proverb is for reading, not for one end of a line
  const short = match.filter((m) => wordsIn(m.ku) <= 3 && m.ku.length <= 18 && m.en.length <= 26);
  return {
    match: spread(short.length >= PRACTICE.match ? short : match, PRACTICE.match),
    gaps: few ? [] : spread(gaps, PRACTICE.gaps),
    replies: spread(hinted.length >= PRACTICE.replies ? hinted : replies, PRACTICE.replies),
    toKurdish: spread(sentences.length >= into ? sentences : toKurdish, into),
    pictures: spread(pictures, PRACTICE.pictures),
    alone: spread(alone.filter((l) => wordsIn(l) > 2), PRACTICE.alone),
  };
}

/**
 * The chapter's own line about Hevalo and his apples: the shortest of its
 * lines that names both, one said with feeling (an exclamation) before a
 * plain one; or failing that the shortest that has him eating. Every chapter
 * of the road has one; the book prints it where the chapter ends.
 */
function gagOf(pairs: readonly BookPair[]): BookPair | null {
  const shortest = (list: readonly BookPair[]): BookPair | null => list.reduce<BookPair | null>((best, s) => (best === null || s.ku.length < best.ku.length ? s : best), null);
  const his = pairs.filter((s) => s.ku.includes('Hevalo'));
  const apples = his.filter((s) => /sêv/i.test(s.ku));
  return shortest(apples.filter((s) => s.ku.includes('!'))) ?? shortest(apples) ?? shortest(his.filter((s) => /birçî|dixwe|xwar/i.test(s.ku)));
}

/**
 * The chapters asked for, in order, gathered from the plan, the unit files and
 * the stories. A chapter whose unit file is missing is left out.
 */
export function roadBookChapters(plan: BookPlan, docs: ReadonlyMap<number, BookUnitDoc>, stories: readonly BookStory[], chapters: readonly number[]): BookChapter[] {
  const out: BookChapter[] = [];
  for (const n of [...new Set(chapters)].sort((a, b) => a - b)) {
    const unit = plan.units.find((u) => u.number === n);
    const doc = docs.get(n)?.units[0];
    if (!unit || !doc) continue;
    const everything: BookExercise[] = [];
    const lines: BookPair[] = [];
    const parts: BookPart[] = unit.skills.map((skill) => {
      const files = doc.skills.find((s) => s.position === skill.position)?.lessons ?? [];
      const lessons = skill.lessons.map((lesson, i) => {
        const file = files.find((l) => l.key === lesson.key) ?? files.find((l) => l.position === (lesson.position ?? i + 1));
        const exercises = sorted(file?.exercises ?? []);
        everything.push(...exercises);
        lines.push(...pairsOf(exercises));
        const made = lessonOf(lesson, i, exercises);
        for (const l of made.dialogue?.lines ?? []) if (l.en) lines.push({ ku: l.text, en: l.en });
        return made;
      });
      return { position: skill.position, titleKu: skill.titleKu, titleEn: skill.titleEn, grammar: skill.grammar ?? '', grammarMd: skill.grammarMd ?? '', lessons };
    });

    const story = stories.find((s) => s.slug.startsWith(`road-${String(n).padStart(2, '0')}-`));
    const tale = story
      ? {
          title: story.title,
          paragraphs: story.body.split(PARAGRAPH).map((p) => p.trim()).filter(Boolean),
          english: (story.translations?.en ?? '').split(PARAGRAPH).map((p) => p.trim()),
          glossary: (story.glossary ?? []).map((g) => ({ term: g.term, en: g.meanings.en })),
          questions: (story.questions ?? []).map((q) => ({ prompt: q.prompt, promptEn: q.promptEn ?? null, options: q.options, answer: q.correctIndex })),
        }
      : null;

    // practice asks for nothing the chapter's pages already answer beside the question
    const printed = new Set(parts.flatMap((p) => p.lessons.flatMap((l) => [...l.sentences.map((s) => s.ku), ...(l.dialogue?.lines.map((d) => d.text) ?? []), ...(l.say ? [l.say] : [])])));
    out.push({
      number: n,
      cefr: unit.cefr,
      titleKu: unit.titleKu,
      titleEn: unit.titleEn,
      summary: unit.story,
      land: PATH_LANDS[(n - 1) % PATH_LANDS.length]!,
      parts,
      tale,
      practice: practiceOf(everything, printed),
      gag: gagOf(lines),
    });
  }
  return out;
}

/** Every word of a chapter, in the order it is taught. */
export function chapterWords(chapter: Pick<BookChapter, 'parts'>): BookWord[] {
  return chapter.parts.flatMap((p) => p.lessons.flatMap((l) => l.words));
}

/**
 * Every word the chapters teach, A to Z in Kurdish alphabetical order, each
 * with the chapter it is first met in: the book's word list.
 */
export function roadBookWordList(chapters: ReadonlyArray<Pick<BookChapter, 'parts' | 'number'>>): Array<BookWord & { chapter: number }> {
  const seen = new Set<string>();
  const out: Array<BookWord & { chapter: number }> = [];
  for (const c of chapters) {
    for (const w of chapterWords(c)) {
      const key = w.ku.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...w, chapter: c.number });
    }
  }
  return out.sort((a, b) => kurdishCompare(a.ku, b.ku));
}

/** The Kurmancî alphabet's order: c after b, ç after c, ê after e, î after i, ş after s, û after u. */
const ORDER = 'abcçdeêfghiîjklmnopqrsştuûvwxyz';

export function kurdishCompare(a: string, b: string): number {
  const rank = (ch: string): number => {
    const i = ORDER.indexOf(ch);
    return i >= 0 ? i : ORDER.length + ch.charCodeAt(0);
  };
  const x = a.toLowerCase().replace(/[^a-zçêîşû ]/g, '');
  const y = b.toLowerCase().replace(/[^a-zçêîşû ]/g, '');
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = rank(x[i]!) - rank(y[i]!);
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

/** A letter of the alphabet with the word of the book that shows it. */
export interface BookLetter {
  /** the lowercase letter */
  id: string;
  upper: string;
  /** a word these chapters teach with the letter in it, or null when they teach none */
  word: BookWord | null;
  /** where in the word the letter is, from 0: the book marks it */
  at: number;
}

/** A plain word for a letter to be shown in: one word, written in letters only, and not a piece of grammar. */
const plainWord = (w: BookWord): boolean => /^[a-zçêîşû]+$/i.test(w.ku) && w.pos !== 'cop' && w.pos !== 'particle';

/**
 * The alphabet, each letter with a word of these chapters to remember it by:
 * the first word taught that begins with the letter, one with a picture
 * before one without (`pictured` says which words have one); and for a
 * letter no word begins with, one that has it inside, and where there is a
 * choice one that no other letter is shown in. Only words the chapters
 * teach, so a book of one chapter shows nothing from further down the road.
 */
export function roadBookAlphabet(chapters: ReadonlyArray<Pick<BookChapter, 'parts'>>, pictured: (word: BookWord) => boolean): BookLetter[] {
  const words = chapters.flatMap((c) => chapterWords(c)).filter(plainWord);
  // the letters that begin a word take theirs first, so a letter found only inside words is not left with one already shown
  const taken = new Set<string>();
  const chosen = new Map<string, BookWord>();
  const begins = (id: string): BookWord[] => words.filter((w) => w.ku.toLowerCase().startsWith(id));
  for (const letter of LATIN_LETTERS) {
    const own = begins(letter.id);
    const word = own.find(pictured) ?? own[0];
    if (!word) continue;
    chosen.set(letter.id, word);
    taken.add(word.ku);
  }
  for (const letter of LATIN_LETTERS) {
    if (chosen.has(letter.id)) continue;
    const inside = words.filter((w) => w.ku.toLowerCase().includes(letter.id));
    const fresh = inside.filter((w) => !taken.has(w.ku));
    const word = fresh.find(pictured) ?? fresh[0] ?? inside.find(pictured) ?? inside[0];
    if (!word) continue;
    chosen.set(letter.id, word);
    taken.add(word.ku);
  }
  return LATIN_LETTERS.map((letter) => {
    const word = chosen.get(letter.id) ?? null;
    return { id: letter.id, upper: letter.upper, word, at: word ? word.ku.toLowerCase().indexOf(letter.id) : -1 };
  });
}

/** Someone the road names, with the plan's few words on who they are. */
export interface BookName {
  name: string;
  kind: string;
  en: string;
}

/**
 * The people and animals of these chapters, in the plan's order: everyone
 * the plan names who is spoken of in the chapters' scenes, lines or stories.
 * Places, and the people of a chapter not asked for, are left out.
 */
export function roadBookCast(plan: BookPlan, chapters: readonly BookChapter[]): BookName[] {
  const text = chapters
    .flatMap((c) => [
      c.summary,
      ...(c.tale ? [c.tale.title, ...c.tale.paragraphs] : []),
      ...c.parts.flatMap((p) => p.lessons.flatMap((l) => [l.beat, l.say ?? '', ...l.sentences.map((s) => s.ku), ...(l.dialogue?.lines.map((d) => d.text) ?? [])])),
    ])
    .join('\n');
  return (plan.names ?? [])
    // an entry that only says what someone is called by another is not a person of its own
    .filter((who) => (who.kind === 'person' || who.kind === 'animal') && !/^what /.test(who.en))
    .filter((who) => [who.name, ...(who.forms ?? [])].some((form) => new RegExp(`(^|[^\\p{L}])${form}($|[^\\p{L}])`, 'u').test(text)))
    .map(({ name, kind, en }) => ({ name, kind, en }));
}
