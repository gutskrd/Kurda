/**
 * The rank result's numbers. The celebration is the app's one (theme/celebration.ts); the ranks set only how many
 * flecks each moment throws and how long the points take to count.
 */

/** How many flecks each kind of moment gets: a division is a nod, a new tier a little more. */
export const FLECKS = { division: 14, tier: 22, placed: 18, badge: 16 } as const;

/** How long the points take to count up, by how far they move: short moves are quick, long ones never drag. */
export function countUpMs(delta: number, reduce: boolean): number {
  if (reduce) return 0;
  const d = Math.abs(Math.round(delta));
  if (d === 0) return 0;
  return Math.round(Math.min(1400, 500 + d * 18));
}
