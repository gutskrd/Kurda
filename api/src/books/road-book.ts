/**
 * The Hevalo book: the Kurmanji Road on paper, chapter by chapter, for a
 * learner to download as a PDF and keep beside the app.
 *
 * What a chapter holds comes from the same files the course is seeded from
 * (content/lessons/road and content/stories/road.json), gathered here into a
 * plain outline (`roadBookChapters`) that pdf.ts lays out: the chapter's
 * goals, and for each of its four parts the new words, the grammar note, a
 * conversation with Hamo and a few sentences to read; then the story Hamo
 * tells at its end, with its English beside each paragraph and its
 * questions; and practice whose answers wait at the back of the book.
 *
 * Pure: the routes decide which chapters a learner may have (only the ones
 * online), and the files are read by the caller.
 */
import { PATH_LANDS, type PathLand } from '@kurda/shared';

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
    lessons: Array<{ key: string; titleKu: string; titleEn: string; new: Array<{ ku: string; en: string; pos?: string; gender?: string }> }>;
  }>;
}

export interface BookPlan {
  characters: Record<string, string>;
  units: BookPlanUnit[];
}

export interface BookUnitDoc {
  units: Array<{
    position: number;
    skills: Array<{
      position: number;
      lessons: Array<{ key?: string; position: number; exercises: Array<{ position: number; type: string; payload: Record<string, unknown> }> }>;
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
  gender: 'm' | 'f' | null;
}

export interface BookLine {
  /** who says it, as the book names them: a character, or "You" for the learner */
  who: string;
  learner: boolean;
  text: string;
  en: string | null;
}

export interface BookPart {
  position: number;
  titleKu: string;
  titleEn: string;
  grammarMd: string;
  words: BookWord[];
  dialogue: { title: string | null; lines: BookLine[] } | null;
  /** Kurdish sentences of the part with their meaning, to read aloud */
  sentences: Array<{ ku: string; en: string }>;
}

export interface BookPractice {
  /** what the learner is asked: an English meaning to put into Kurdish, or Kurdish to put into English */
  ask: string;
  answer: string;
  direction: 'to-kurdish' | 'to-english';
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
    questions: Array<{ prompt: string; options: string[]; answer: number }>;
  } | null;
  practice: BookPractice[];
}

const PARAGRAPH = /\n\s*\n/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

/** Every `take`-th of `list`, starting from the first, at most `max` of them: a fair spread through a part, the same every time. */
function spread<T>(list: readonly T[], max: number): T[] {
  if (list.length <= max) return [...list];
  const step = list.length / max;
  return Array.from({ length: max }, (_, i) => list[Math.floor(i * step)]!);
}

/** The first conversation of a part, as the book prints it. */
function dialogueOf(exercises: ReadonlyArray<{ type: string; payload: Record<string, unknown> }>): BookPart['dialogue'] {
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
  return lines.length > 0 ? { title: str(p.title), lines } : null;
}

/** A part's Kurdish sentences with what they mean: the items that ask for the English of something Hamo says. */
function sentencesOf(exercises: ReadonlyArray<{ type: string; payload: Record<string, unknown> }>): Array<{ ku: string; en: string }> {
  const out: Array<{ ku: string; en: string }> = [];
  const seen = new Set<string>();
  for (const e of exercises) {
    if (e.type !== 'translate') continue;
    const ku = str(e.payload.say);
    const en = Array.isArray(e.payload.accepted) ? str(e.payload.accepted[0]) : null;
    if (!ku || !en || seen.has(ku)) continue;
    seen.add(ku);
    out.push({ ku, en });
  }
  return out;
}

const genderOf = (g: string | undefined): BookWord['gender'] => (g === 'm' || g === 'f' ? g : null);

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
    const parts: BookPart[] = unit.skills.map((skill) => {
      const lessons = doc.skills.find((s) => s.position === skill.position)?.lessons ?? [];
      const exercises = [...lessons].sort((a, b) => a.position - b.position).flatMap((l) => [...l.exercises].sort((a, b) => a.position - b.position));
      return {
        position: skill.position,
        titleKu: skill.titleKu,
        titleEn: skill.titleEn,
        grammarMd: skill.grammarMd ?? '',
        words: skill.lessons.flatMap((l) => l.new.map((w) => ({ ku: w.ku, en: w.en, gender: genderOf(w.gender) }))),
        dialogue: dialogueOf(exercises),
        sentences: spread(sentencesOf(exercises), 6),
      };
    });

    const story = stories.find((s) => s.slug.startsWith(`road-${String(n).padStart(2, '0')}-`));
    const tale = story
      ? {
          title: story.title,
          paragraphs: story.body.split(PARAGRAPH).map((p) => p.trim()).filter(Boolean),
          english: (story.translations?.en ?? '').split(PARAGRAPH).map((p) => p.trim()),
          glossary: (story.glossary ?? []).map((g) => ({ term: g.term, en: g.meanings.en })),
          questions: (story.questions ?? []).map((q) => ({ prompt: q.promptEn ?? q.prompt, options: q.options, answer: q.correctIndex })),
        }
      : null;

    // practice: words into Kurdish from every part, then sentences into English the parts did not print
    // a word with a plain meaning makes a fair question; "im / me" or a meaning that explains grammar does not
    const askable = (w: BookWord): boolean => !w.ku.includes('/') && !w.ku.startsWith('-') && !/[(;]/.test(w.en) && w.ku.split(' ').length <= 3;
    const words = parts.flatMap((p) => spread(p.words.filter(askable), 3));
    const printed = new Set(parts.flatMap((p) => p.sentences.map((s) => s.ku)));
    const unread = doc.skills.flatMap((s) => s.lessons.flatMap((l) => sentencesOf(l.exercises))).filter((s) => !printed.has(s.ku));
    const practice: BookPractice[] = [
      ...words.map((w): BookPractice => ({ ask: w.en, answer: w.ku, direction: 'to-kurdish' })),
      ...spread(unread, 6).map((s): BookPractice => ({ ask: s.ku, answer: s.en, direction: 'to-english' })),
    ];

    out.push({
      number: n,
      cefr: unit.cefr,
      titleKu: unit.titleKu,
      titleEn: unit.titleEn,
      summary: unit.story,
      land: PATH_LANDS[(n - 1) % PATH_LANDS.length]!,
      parts,
      tale,
      practice,
    });
  }
  return out;
}

/**
 * Every word the chapters teach, A to Z in Kurdish alphabetical order, each
 * with the chapter it is first met in: the book's word list.
 */
export function roadBookWordList(chapters: readonly BookChapter[]): Array<BookWord & { chapter: number }> {
  const seen = new Set<string>();
  const out: Array<BookWord & { chapter: number }> = [];
  for (const c of chapters) {
    for (const p of c.parts) {
      for (const w of p.words) {
        const key = w.ku.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ ...w, chapter: c.number });
      }
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
