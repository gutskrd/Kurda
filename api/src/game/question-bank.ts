/**
 * Kurmanji question bank (KUR-051). Questions are edited in the admin panel and
 * live in `quiz_questions`; this constant is the fallback used until that table
 * has rows, so a fresh database still has a playable quiz. `setBank` swaps in the
 * database copy — selection stays synchronous because the engine picks questions
 * on a synchronous path.
 *
 * The original note: the eventual source is the
 * course content pipeline (KUR-026/#26, KUR-041/#41) selecting by the
 * overlap of both players' course levels — this module keeps the game
 * engine playable until that lands, behind the same interface.
 */
import { createHash } from 'node:crypto';

export type QuestionCategory = 'vocabulary' | 'phrases';

export interface GameQuestion {
  id: string;
  /** Kurdish-first prompt. */
  prompt: string;
  options: [string, string, string, string];
  correctIndex: number;
  category: QuestionCategory;
  /** difficulty tier 1–3 */
  level: number;
}

/** A host's question preference for a private room (KUR-056). */
export interface QuestionFilter {
  category?: QuestionCategory;
  level?: number;
}

const BANK: GameQuestion[] = [
  { id: 'q-sev', prompt: '"Sêv" bi îngilîzî çi ye?', options: ['Apple', 'Bread', 'Water', 'Mountain'], correctIndex: 0, category: 'vocabulary', level: 1 },
  { id: 'q-av', prompt: '"Av" bi îngilîzî çi ye?', options: ['Fire', 'Water', 'Sun', 'Stone'], correctIndex: 1, category: 'vocabulary', level: 1 },
  { id: 'q-nan', prompt: '"Nan" bi îngilîzî çi ye?', options: ['Milk', 'Rice', 'Bread', 'Tea'], correctIndex: 2, category: 'vocabulary', level: 1 },
  { id: 'q-roj', prompt: '"Roj" bi îngilîzî çi ye?', options: ['Moon', 'Star', 'Night', 'Sun'], correctIndex: 3, category: 'vocabulary', level: 1 },
  { id: 'q-ciya', prompt: '"Çiya" bi îngilîzî çi ye?', options: ['Mountain', 'River', 'Valley', 'Forest'], correctIndex: 0, category: 'vocabulary', level: 2 },
  { id: 'q-dil', prompt: '"Dil" bi îngilîzî çi ye?', options: ['Hand', 'Heart', 'Head', 'Eye'], correctIndex: 1, category: 'vocabulary', level: 2 },
  { id: 'q-sher', prompt: '"Şêr" bi îngilîzî çi ye?', options: ['Wolf', 'Eagle', 'Lion', 'Horse'], correctIndex: 2, category: 'vocabulary', level: 2 },
  { id: 'q-heval', prompt: '"Heval" bi îngilîzî çi ye?', options: ['Enemy', 'Teacher', 'Family', 'Friend'], correctIndex: 3, category: 'vocabulary', level: 3 },
  { id: 'q-zman', prompt: '"Ziman" bi îngilîzî çi ye?', options: ['Language', 'Country', 'Book', 'Word'], correctIndex: 0, category: 'vocabulary', level: 3 },
  { id: 'q-azadi', prompt: '"Azadî" bi îngilîzî çi ye?', options: ['Peace', 'Freedom', 'Hope', 'Unity'], correctIndex: 1, category: 'vocabulary', level: 3 },
  { id: 'q-slav', prompt: '"Roj baş" tê çi wateyê?', options: ['Good day', 'Good night', 'Goodbye', 'Thank you'], correctIndex: 0, category: 'phrases', level: 1 },
  { id: 'q-spas', prompt: '"Spas" tê çi wateyê?', options: ['Sorry', 'Please', 'Thank you', 'Hello'], correctIndex: 2, category: 'phrases', level: 1 },
  { id: 'q-mal', prompt: '"Mal" bi îngilîzî çi ye?', options: ['Book', 'House', 'Friend', 'Day'], correctIndex: 1, category: 'vocabulary', level: 1 },
  { id: 'q-dayik', prompt: '"Dayik" bi îngilîzî çi ye?', options: ['Mother', 'Father', 'Child', 'Sister'], correctIndex: 0, category: 'vocabulary', level: 1 },
  { id: 'q-bav', prompt: '"Bav" bi îngilîzî çi ye?', options: ['Brother', 'Father', 'Friend', 'Teacher'], correctIndex: 1, category: 'vocabulary', level: 1 },
  { id: 'q-gund', prompt: '"Gund" bi îngilîzî çi ye?', options: ['City', 'Village', 'Mountain', 'Road'], correctIndex: 1, category: 'vocabulary', level: 1 },
  { id: 'q-gul', prompt: '"Gul" bi îngilîzî çi ye?', options: ['Tree', 'Flower', 'Animal', 'Colour'], correctIndex: 1, category: 'vocabulary', level: 1 },
  { id: 'q-shev', prompt: '"Şev" bi îngilîzî çi ye?', options: ['Morning', 'Night', 'Evening', 'Sun'], correctIndex: 1, category: 'vocabulary', level: 1 },
  { id: 'q-dar', prompt: '"Dar" bi îngilîzî çi ye?', options: ['Stone', 'Tree', 'Flower', 'Leaf'], correctIndex: 1, category: 'vocabulary', level: 1 },
  { id: 'q-masi', prompt: '"Masî" bi îngilîzî çi ye?', options: ['Bird', 'Fish', 'Horse', 'Sheep'], correctIndex: 1, category: 'vocabulary', level: 1 },
  { id: 'q-sibe', prompt: '"Sibe" bi îngilîzî çi ye?', options: ['Evening', 'Night', 'Morning', 'Noon'], correctIndex: 2, category: 'vocabulary', level: 1 },
  { id: 'q-pirtuk', prompt: '"Pirtûk" bi îngilîzî çi ye?', options: ['Pen', 'Book', 'Door', 'Tree'], correctIndex: 1, category: 'vocabulary', level: 2 },
  { id: 'q-qelem', prompt: '"Qelem" bi îngilîzî çi ye?', options: ['Notebook', 'Pen', 'River', 'Home'], correctIndex: 1, category: 'vocabulary', level: 2 },
  { id: 'q-bajar', prompt: '"Bajar" bi îngilîzî çi ye?', options: ['Village', 'City', 'Window', 'Flower'], correctIndex: 1, category: 'vocabulary', level: 2 },
  { id: 'q-cem', prompt: '"Çem" bi îngilîzî çi ye?', options: ['River', 'Mountain', 'Fish', 'Snow'], correctIndex: 0, category: 'vocabulary', level: 2 },
  { id: 'q-xwishk', prompt: '"Xwişk" bi îngilîzî çi ye?', options: ['Sister', 'Brother', 'Mother', 'Daughter'], correctIndex: 0, category: 'vocabulary', level: 2 },
  { id: 'q-bira', prompt: '"Bira" bi îngilîzî çi ye?', options: ['Sister', 'Uncle', 'Brother', 'Son'], correctIndex: 2, category: 'vocabulary', level: 2 },
  { id: 'q-zarok', prompt: '"Zarok" bi îngilîzî çi ye?', options: ['Child', 'Adult', 'Parent', 'Neighbour'], correctIndex: 0, category: 'vocabulary', level: 2 },
  { id: 'q-deng', prompt: '"Deng" bi îngilîzî çi ye?', options: ['Colour', 'Voice', 'Light', 'Smell'], correctIndex: 1, category: 'vocabulary', level: 2 },
  { id: 'q-reng', prompt: '"Reng" bi îngilîzî çi ye?', options: ['Voice', 'Shape', 'Colour', 'Sound'], correctIndex: 2, category: 'vocabulary', level: 2 },
  { id: 'q-mamoste', prompt: '"Mamoste" bi îngilîzî çi ye?', options: ['Student', 'Doctor', 'Teacher', 'Farmer'], correctIndex: 2, category: 'vocabulary', level: 3 },
  { id: 'q-welat', prompt: '"Welat" bi îngilîzî çi ye?', options: ['City', 'Village', 'Homeland', 'Border'], correctIndex: 2, category: 'vocabulary', level: 3 },
  { id: 'q-jiyan', prompt: '"Jiyan" bi îngilîzî çi ye?', options: ['Language', 'Life', 'Freedom', 'Homeland'], correctIndex: 1, category: 'vocabulary', level: 3 },
];

/**
 * Deterministic per-seed selection so reconnecting nodes agree. An optional
 * filter (KUR-056) narrows by category/level; if it leaves too few, the full
 * bank backfills so a game always has enough questions.
 */
/**
 * The bank selection actually reads. Starts as the built-in constant and is
 * replaced once the database copy loads (and after an admin edits a question).
 */
let activeBank: GameQuestion[] = BANK;

/** Replace the live bank. An empty list is ignored — never leave the quiz unplayable. */
export function setBank(questions: GameQuestion[]): void {
  activeBank = questions.length > 0 ? questions : BANK;
}

/** The built-in fallback, for seeding the database on first run. */
export function builtInBank(): GameQuestion[] {
  return BANK;
}

export function selectQuestions(seed: string, count: number, filter?: QuestionFilter): GameQuestion[] {
  const matches = (q: GameQuestion) =>
    (filter?.category === undefined || q.category === filter.category) &&
    (filter?.level === undefined || q.level === filter.level);

  const pool = activeBank.filter(matches);
  const primary = order(pool, seed);
  if (primary.length >= count) return primary.slice(0, count);
  // backfill from the rest of the bank, keeping the filtered ones first
  const rest = order(activeBank.filter((q) => !matches(q)), seed);
  return [...primary, ...rest].slice(0, Math.min(count, activeBank.length));
}

function order(questions: GameQuestion[], seed: string): GameQuestion[] {
  return questions
    .map((question) => ({ question, key: createHash('sha1').update(`${seed}:${question.id}`).digest('hex') }))
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((s) => s.question);
}
