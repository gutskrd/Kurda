import { rate } from 'openskill';
import {
  IDLE_SIGMA_PER_WEEK,
  NEW_ACCOUNT_RULE,
  PLACEMENT_GAMES,
  POINTS_SCALE,
  SEASON_SIGMA_FLOOR,
  SHIELD_GAMES,
  START_MU,
  START_SIGMA,
  pointsOf,
  tierFloor,
  tierIndex,
  tierOf,
  type PointsTier,
  type RankReason,
} from '@kurda/shared';

/**
 * The rating maths of Game Ranks (contract-4 §R1–R4), pure and deterministic:
 * the same inputs give the same ratings, which is what lets an admin void a
 * game and replay everything after it from history (ranks/replay.ts). All
 * persistence is in the RankService.
 *
 * OpenSkill's Plackett-Luce model (the `openskill` package, Weng & Lin 2011)
 * ranks every finishing place at once, so a 1v1 and an eight-player game are
 * the same call; equal places are ties. On top of it, the Hevalo rules:
 * - σ grows a little for every idle week before a game (capped), so someone
 *   back after a break moves faster — while nothing they see decays;
 * - a game counts with a weight (repeat-opponent damping, decided when it
 *   started), and a new account moves each opponent by at most half;
 * - a shield holds a player who just reached a tier at its floor for three
 *   games; placement, wins and the season's peak are counted here too.
 */

/** Everything a player's standing in one game is made of, as stored per (user, game). */
export interface PlayerState {
  mu: number;
  sigma: number;
  ratedGames: number;
  wins: number;
  placementDone: boolean;
  shieldGames: number;
  lastRatedAt: Date | null;
  seasonId: string;
  seasonGames: number;
  seasonWins: number;
  /** the season's best points so far */
  peakPoints: number;
  /** the best points ever */
  bestPoints: number;
}

export function freshState(seasonId: string): PlayerState {
  return {
    mu: START_MU,
    sigma: START_SIGMA,
    ratedGames: 0,
    wins: 0,
    placementDone: false,
    shieldGames: 0,
    lastRatedAt: null,
    seasonId,
    seasonGames: 0,
    seasonWins: 0,
    peakPoints: 0,
    bestPoints: 0,
  };
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * σ after time away: +0.1 per whole idle week, never past the starting σ. It
 * only feeds the maths of the next game (and the lobby's expected gains): the
 * points a resting player shows do not move while they are away.
 */
export function idleSigma(sigma: number, lastRatedAt: Date | null, at: Date): number {
  if (!lastRatedAt) return sigma;
  const weeks = Math.floor((at.getTime() - lastRatedAt.getTime()) / WEEK_MS);
  if (weeks <= 0 || sigma >= START_SIGMA) return sigma;
  return Math.min(START_SIGMA, sigma + IDLE_SIGMA_PER_WEEK * weeks);
}

/**
 * A new season (R5): σ is raised to at least 4 and μ kept — points dip a
 * little and a good player is back in a few games; the season's counters
 * start again. Placement is not repeated.
 */
export function seasonReset(state: PlayerState, seasonId: string): PlayerState {
  const sigma = Math.max(state.sigma, SEASON_SIGMA_FLOOR);
  return {
    ...state,
    sigma,
    seasonId,
    seasonGames: 0,
    seasonWins: 0,
    peakPoints: pointsOf(state.mu, sigma),
  };
}

/** One player in a finished rated game. */
export interface GameEntry {
  userId: string;
  state: PlayerState;
  /** the place the game gave them (1 = first; equal places are ties) */
  place: number;
  /** left the game after it started: last place, whatever the game said */
  left: boolean;
  /** a new account: moves the others by at most half */
  newAccount: boolean;
}

export interface RateInput {
  entries: readonly GameEntry[];
  /** repeat-opponent damping, decided at the start (1 = full) */
  weight: number;
  at: Date;
}

export interface RateOutcome {
  userId: string;
  before: PlayerState;
  after: PlayerState;
  /** the place the rating used (leavers last) */
  place: number;
  left: boolean;
  won: boolean;
  pointsBefore: number;
  pointsAfter: number;
  delta: number;
  reason: RankReason;
  tierBefore: PointsTier | null;
  tierAfter: PointsTier | null;
  /** the shield held them at their tier's floor in this game */
  shieldHeld: boolean;
  /** the weight this player's change was applied with (damping × new-account limit) */
  weight: number;
  /**
   * how many tiers above them the strongest opponent they finished ahead of was
   * (0 when none, while placing, or when that opponent left the game)
   */
  beatTierGap: number;
}

/** A difference in points smaller than half a division reads as "equals". */
const EVEN_POINTS = 50;

/**
 * The places the rating uses: leavers share the place after everyone who
 * stayed, and the places are then counted again (1 + how many finished ahead),
 * so whoever is ahead of everyone left in the game is first.
 */
export function effectivePlaces(entries: readonly Pick<GameEntry, 'place' | 'left'>[]): number[] {
  const stayed = entries.filter((e) => !e.left).map((e) => e.place);
  const last = (stayed.length ? Math.max(...stayed) : 0) + 1;
  const raw = entries.map((e) => (e.left ? last : e.place));
  return raw.map((p) => 1 + raw.filter((q) => q < p).length);
}

/** The visible tier, or null while placing. */
function shownTier(state: PlayerState, points: number): PointsTier | null {
  return state.placementDone ? tierOf(points) : null;
}

/**
 * Rate one finished game. The order of the outcomes matches `entries`.
 * Needs at least two entries; fewer is not a game and returns nothing.
 */
export function rateGame(input: RateInput): RateOutcome[] {
  const { entries, at } = input;
  if (entries.length < 2) return [];
  const places = effectivePlaces(entries);
  const inflated = entries.map((e) => ({ mu: e.state.mu, sigma: idleSigma(e.state.sigma, e.state.lastRatedAt, at) }));
  const rated = rate(
    inflated.map((r) => [r]),
    { rank: places },
  ).map((team) => team[0]!);

  const pointsBefore = entries.map((e) => pointsOf(e.state.mu, e.state.sigma));
  const newCount = entries.filter((e) => e.newAccount).length;

  return entries.map((e, i) => {
    const before = e.state;
    const opponents = entries.length - 1;
    const newOpponents = newCount - (e.newAccount ? 1 : 0);
    const limit = 1 - NEW_ACCOUNT_RULE.influence * (newOpponents / opponents);
    const weight = Math.max(0, Math.min(1, input.weight)) * limit;
    const base = inflated[i]!;
    const next = rated[i]!;
    let mu = base.mu + weight * (next.mu - base.mu);
    const sigma = base.sigma + weight * (next.sigma - base.sigma);

    const place = places[i]!;
    const others = places.filter((_, j) => j !== i);
    const won = !e.left && place === 1 && others.some((p) => p > 1);
    const placementDone = before.placementDone || before.ratedGames + 1 >= PLACEMENT_GAMES;

    // the shield: a tier just reached cannot be lost for SHIELD_GAMES games
    let shieldHeld = false;
    if (before.placementDone && before.shieldGames > 0) {
      const floor = tierFloor(tierOf(pointsBefore[i]!));
      if (pointsOf(mu, sigma) < floor) {
        mu = floor / POINTS_SCALE + 3 * sigma;
        shieldHeld = true;
      }
    }
    const pointsAfter = pointsOf(mu, sigma);
    const tierBefore = shownTier(before, pointsBefore[i]!);
    const tierAfter = placementDone ? tierOf(pointsAfter) : null;
    let shieldGames = Math.max(0, before.shieldGames - 1);
    if (before.placementDone && tierBefore && tierAfter && tierIndex(tierAfter) > tierIndex(tierBefore)) {
      shieldGames = SHIELD_GAMES;
    }

    const after: PlayerState = {
      mu,
      sigma,
      ratedGames: before.ratedGames + 1,
      wins: before.wins + (won ? 1 : 0),
      placementDone,
      shieldGames,
      lastRatedAt: at,
      seasonId: before.seasonId,
      seasonGames: before.seasonGames + 1,
      seasonWins: before.seasonWins + (won ? 1 : 0),
      peakPoints: Math.max(before.peakPoints, pointsAfter),
      bestPoints: Math.max(before.bestPoints, pointsAfter),
    };

    // who they finished ahead of, and behind
    const mine = pointsBefore[i]!;
    const beaten: number[] = [];
    const beatenBy: number[] = [];
    let ties = 0;
    entries.forEach((o, j) => {
      if (j === i) return;
      if (places[j]! > place) beaten.push(j);
      else if (places[j]! < place) beatenBy.push(j);
      else ties++;
    });
    const score = (beaten.length + ties / 2) / opponents;
    // finishing ahead of someone who walked out beats nobody, and a leaver beats nobody
    let beatTierGap = 0;
    if (tierBefore && !e.left) {
      for (const j of beaten) {
        if (entries[j]!.left) continue;
        const theirs = shownTier(entries[j]!.state, pointsBefore[j]!);
        if (theirs) beatTierGap = Math.max(beatTierGap, tierIndex(theirs) - tierIndex(tierBefore));
      }
    }
    const reason = reasonFor({
      left: e.left,
      placing: !before.placementDone,
      shieldHeld,
      score,
      mine,
      beaten: beaten.map((j) => pointsBefore[j]!),
      beatenBy: beatenBy.map((j) => pointsBefore[j]!),
    });

    return {
      userId: e.userId,
      before,
      after,
      place,
      left: e.left,
      won,
      pointsBefore: mine,
      pointsAfter,
      delta: pointsAfter - mine,
      reason,
      tierBefore,
      tierAfter,
      shieldHeld,
      weight,
      beatTierGap,
    };
  });
}

/**
 * The one plain reason a result is shown with. Strength is judged by the
 * points everyone could see before the game: "a higher-ranked player".
 */
function reasonFor(r: {
  left: boolean;
  placing: boolean;
  shieldHeld: boolean;
  score: number;
  mine: number;
  beaten: number[];
  beatenBy: number[];
}): RankReason {
  if (r.left) return 'left';
  if (r.placing) return 'placement';
  if (r.shieldHeld) return 'shield';
  if (r.score > 0.5) {
    if (r.beaten.some((p) => p > r.mine + EVEN_POINTS)) return 'beat-stronger';
    if (r.beaten.every((p) => p < r.mine - EVEN_POINTS)) return 'expected-win';
    return 'won';
  }
  if (r.score < 0.5) {
    const avg = r.beatenBy.reduce((s, p) => s + p, 0) / Math.max(1, r.beatenBy.length);
    if (avg > r.mine + EVEN_POINTS) return 'lost-to-stronger';
    if (avg < r.mine - EVEN_POINTS) return 'lost-to-weaker';
    return 'lost';
  }
  return 'draw';
}

/** One side of a lobby, for the expected gains. */
export interface Contender {
  state: PlayerState;
  newAccount: boolean;
}

/**
 * What a win and a loss against one opponent would do to `me`'s points, from
 * the ratings as they are now (chess.com's "Win ≈ +24 · Lose ≈ −8").
 */
export function expectedVs(me: Contender, opponent: Contender, weight: number, at: Date): { win: number; lose: number } {
  // a game that would not count changes nothing (and an idle σ is no "loss")
  if (weight <= 0) return { win: 0, lose: 0 };
  const game = (myPlace: number, theirPlace: number) =>
    rateGame({
      entries: [
        { userId: 'me', state: me.state, place: myPlace, left: false, newAccount: me.newAccount },
        { userId: 'them', state: opponent.state, place: theirPlace, left: false, newAccount: opponent.newAccount },
      ],
      weight,
      at,
    })[0]!.delta;
  return { win: game(1, 2), lose: game(2, 1) };
}

/** Finishing first and finishing last among everyone in the lobby (`me` is index 0). */
export function expectedExtremes(players: readonly Contender[], weight: number, at: Date): { first: number; last: number } {
  if (weight <= 0) return { first: 0, last: 0 };
  const n = players.length;
  const game = (myPlace: number) =>
    rateGame({
      entries: players.map((p, i) => ({
        userId: String(i),
        state: p.state,
        // everyone else in seat order around me; only my place matters here
        place: i === 0 ? myPlace : myPlace === 1 ? i + 1 : i,
        left: false,
        newAccount: p.newAccount,
      })),
      weight,
      at,
    })[0]!.delta;
  return { first: game(1), last: game(n) };
}
