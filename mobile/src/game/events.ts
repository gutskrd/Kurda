/** Server → client game events (mirrors the engine, KUR-051/52/53). */

export interface ScoreLine {
  userId: string;
  username: string;
  points: number;
  rank: number;
  correct: number;
  /** XP granted for this game (final results only, KUR-059). */
  xp?: number;
  /** Rating change placeholder until MMR lands (KUR-061); 0 for now. */
  ratingDelta?: number;
}

export type GameEvent =
  | { type: 'countdown'; startsAt: number }
  | { type: 'question'; index: number; total: number; prompt: string; options: string[]; endsAt: number }
  | { type: 'player_answered'; userId: string; index: number }
  | { type: 'reveal'; index: number; correctIndex: number; answers: Record<string, number | null> }
  | { type: 'scoreboard'; index: number; scores: ScoreLine[] }
  | { type: 'results'; provisional: boolean; scores: ScoreLine[] }
  | { type: 'answer_rejected'; index: number; code: string };
