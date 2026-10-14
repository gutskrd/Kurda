import type { StoryGameMode, StoryGameReviewItem, StoryGameStanding } from '@kurda/shared';

/**
 * How a finished game's standings are shown (the StoryGameResults rules):
 * a podium only with four or more players; a duo as both scores and the two
 * together, without places; three players in seat order with only your own
 * place said to you. A game alone has nobody to stand against.
 */
export type StandingsLayout = 'solo' | 'duo' | 'seats' | 'podium';

export function standingsLayout(mode: StoryGameMode, standings: readonly StoryGameStanding[]): StandingsLayout {
  if (mode === 'solo' || standings.length < 2) return 'solo';
  if (standings.length === 2) return 'duo';
  if (standings.length === 3) return 'seats';
  return 'podium';
}

/** The duo line's numbers: each score as right answers, and the two together out of both totals. */
export function duoTotals(standings: readonly StoryGameStanding[], total: number): { together: number; outOf: number } {
  return { together: standings.reduce((n, s) => n + s.correct, 0), outOf: total * standings.length };
}

/** Seat order, for three players. */
export function bySeat(standings: readonly StoryGameStanding[]): StoryGameStanding[] {
  return [...standings].sort((a, b) => a.seat - b.seat);
}

/** Going over the questions: the ones you missed first, each group in question order. */
export function reviewOrder(review: readonly StoryGameReviewItem[]): StoryGameReviewItem[] {
  const missed = (r: StoryGameReviewItem) => r.myChoice === null || r.myChoice !== r.correctIndex;
  return [...review].sort((a, b) => Number(missed(b)) - Number(missed(a)) || a.index - b.index);
}
