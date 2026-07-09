/**
 * Placeholder Kurmanji question bank (KUR-051). The real source is the
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
];

/**
 * Deterministic per-seed selection so reconnecting nodes agree. An optional
 * filter (KUR-056) narrows by category/level; if it leaves too few, the full
 * bank backfills so a game always has enough questions.
 */
export function selectQuestions(seed: string, count: number, filter?: QuestionFilter): GameQuestion[] {
  const matches = (q: GameQuestion) =>
    (filter?.category === undefined || q.category === filter.category) &&
    (filter?.level === undefined || q.level === filter.level);

  const pool = BANK.filter(matches);
  const primary = order(pool, seed);
  if (primary.length >= count) return primary.slice(0, count);
  // backfill from the rest of the bank, keeping the filtered ones first
  const rest = order(BANK.filter((q) => !matches(q)), seed);
  return [...primary, ...rest].slice(0, Math.min(count, BANK.length));
}

function order(questions: GameQuestion[], seed: string): GameQuestion[] {
  return questions
    .map((question) => ({ question, key: createHash('sha1').update(`${seed}:${question.id}`).digest('hex') }))
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((s) => s.question);
}
