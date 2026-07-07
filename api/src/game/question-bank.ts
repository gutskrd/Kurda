/**
 * Placeholder Kurmanji question bank (KUR-051). The real source is the
 * course content pipeline (KUR-026/#26, KUR-041/#41) selecting by the
 * overlap of both players' course levels — this module keeps the game
 * engine playable until that lands, behind the same interface.
 */
import { createHash } from 'node:crypto';

export interface GameQuestion {
  id: string;
  /** Kurdish-first prompt. */
  prompt: string;
  options: [string, string, string, string];
  correctIndex: number;
}

const BANK: GameQuestion[] = [
  { id: 'q-sev', prompt: '"Sêv" bi îngilîzî çi ye?', options: ['Apple', 'Bread', 'Water', 'Mountain'], correctIndex: 0 },
  { id: 'q-av', prompt: '"Av" bi îngilîzî çi ye?', options: ['Fire', 'Water', 'Sun', 'Stone'], correctIndex: 1 },
  { id: 'q-nan', prompt: '"Nan" bi îngilîzî çi ye?', options: ['Milk', 'Rice', 'Bread', 'Tea'], correctIndex: 2 },
  { id: 'q-roj', prompt: '"Roj" bi îngilîzî çi ye?', options: ['Moon', 'Star', 'Night', 'Sun'], correctIndex: 3 },
  { id: 'q-ciya', prompt: '"Çiya" bi îngilîzî çi ye?', options: ['Mountain', 'River', 'Valley', 'Forest'], correctIndex: 0 },
  { id: 'q-dil', prompt: '"Dil" bi îngilîzî çi ye?', options: ['Hand', 'Heart', 'Head', 'Eye'], correctIndex: 1 },
  { id: 'q-sher', prompt: '"Şêr" bi îngilîzî çi ye?', options: ['Wolf', 'Eagle', 'Lion', 'Horse'], correctIndex: 2 },
  { id: 'q-heval', prompt: '"Heval" bi îngilîzî çi ye?', options: ['Enemy', 'Teacher', 'Family', 'Friend'], correctIndex: 3 },
  { id: 'q-zman', prompt: '"Ziman" bi îngilîzî çi ye?', options: ['Language', 'Country', 'Book', 'Word'], correctIndex: 0 },
  { id: 'q-azadi', prompt: '"Azadî" bi îngilîzî çi ye?', options: ['Peace', 'Freedom', 'Hope', 'Unity'], correctIndex: 1 },
];

/** Deterministic per-seed selection so reconnecting nodes agree. */
export function selectQuestions(seed: string, count: number): GameQuestion[] {
  const scored = BANK.map((question) => ({
    question,
    order: createHash('sha1').update(`${seed}:${question.id}`).digest('hex'),
  }));
  scored.sort((a, b) => (a.order < b.order ? -1 : 1));
  return scored.slice(0, Math.min(count, BANK.length)).map((s) => s.question);
}
