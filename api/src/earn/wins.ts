/**
 * Zêr for beating other people: a win in an online game, and a quiz night's podium. Both pay only when the room had
 * enough accounts and skip a pair that looks like one person on two accounts (a shared device or a quiet shared network,
 * net/evidence.ts, the evidence the ban-evasion checks weigh), so nobody farms Zêr by playing themselves. The same wins
 * put a small gift in the winner's gift bag (gifts/bag.ts), members and free accounts alike, under the same checks.
 */
import type pg from 'pg';
import { PAID_PODIUMS_PER_DAY, PAID_WINS_PER_DAY, WIN_MIN_ACCOUNTS, onlineWinZer, quizPodiumZer } from '@kurda/shared';
import { isPremiumActive, memberZerUntilSql } from '../cosmetics/access.js';
import { pairEvidence } from '../net/evidence.js';
import type { WalletService } from '../wallet/service.js';
import { earnReason, earnWithin, type GrantResult } from './service.js';
import { grantBagGiftWithin } from '../gifts/bag.js';

export const ONLINE_WIN_REASON = earnReason('online_win');
export const QUIZ_PODIUM_REASON = earnReason('quiz_podium');

/** One player's place in a finished game; 1 is first. */
export interface Placing {
  userId: string;
  place: number;
}

/** Whether two accounts look like one person: a device both used, or a quiet network both were on together. */
export async function looksLikeOnePerson(db: Pick<pg.Pool, 'query'>, a: string, b: string): Promise<boolean> {
  const evidence = await pairEvidence(db, a, b);
  return evidence.device !== null || evidence.network !== null;
}

async function isMember(db: Pick<pg.Pool, 'query'>, userId: string, now: Date): Promise<boolean> {
  const row = await db.query<{ premium_until: Date | null }>(`SELECT ${memberZerUntilSql('u')} AS premium_until FROM users u WHERE u.id = $1`, [userId]);
  return isPremiumActive(row.rows[0]?.premium_until ?? null, now);
}

/** Paid wins so far today (UTC), read before the costlier same-person check. */
async function paidToday(db: Pick<pg.Pool, 'query'>, userId: string, reason: string): Promise<number> {
  const res = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM wallet_ledger
      WHERE user_id = $1 AND currency = 'zer' AND reason = $2 AND amount > 0
        AND created_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`,
    [userId, reason],
  );
  return res.rows[0]?.n ?? 0;
}

/**
 * `payOnlineWin` in a savepoint, for a game's finishing transaction: a failure leaves the win unpaid and logged rather
 * than undoing the finish.
 */
export async function payOnlineWinSafely(
  client: pg.PoolClient,
  wallet: WalletService,
  game: { ref: string; players: readonly Placing[] },
  log?: { warn: (obj: unknown, msg: string) => void },
  now: Date = new Date(),
): Promise<void> {
  await client.query('SAVEPOINT online_win');
  try {
    await payOnlineWin(client, wallet, game, now);
    await client.query('RELEASE SAVEPOINT online_win');
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT online_win');
    log?.warn({ err, ref: game.ref }, 'a win was not paid');
  }
}

/**
 * Pays the winner of a finished online game, in the transaction that finished it: the one player in first place, in a
 * game of at least WIN_MIN_ACCOUNTS accounts, at most PAID_WINS_PER_DAY a day, and nothing when any opponent looks
 * like the winner on another account. A shared first place is a draw and pays nobody. `ref` names the game, so a retry
 * pays once. Returns who was paid what.
 */
export async function payOnlineWin(
  client: pg.PoolClient,
  wallet: WalletService,
  game: { ref: string; players: readonly Placing[] },
  now: Date = new Date(),
): Promise<{ userId: string; result: GrantResult } | null> {
  const accounts = [...new Set(game.players.map((p) => p.userId))];
  if (accounts.length < WIN_MIN_ACCOUNTS) return null;
  const first = game.players.filter((p) => p.place === 1);
  if (first.length !== 1) return null;
  const winner = first[0]!.userId;
  for (const other of accounts) {
    if (other !== winner && (await looksLikeOnePerson(client, winner, other))) return null;
  }
  if ((await paidToday(client, winner, ONLINE_WIN_REASON)) >= PAID_WINS_PER_DAY) {
    await grantBagGiftWithin(client, { userId: winner, source: 'win', ref: game.ref });
    return null;
  }
  const result = await earnWithin(client, wallet, {
    userId: winner,
    amount: onlineWinZer(await isMember(client, winner, now)),
    reason: ONLINE_WIN_REASON,
    refId: game.ref,
    idempotencyKey: `online-win:${game.ref}:${winner}`,
    perDay: PAID_WINS_PER_DAY,
    now,
  });
  // after the Zêr, the order every path takes (gifts/bag.ts)
  await grantBagGiftWithin(client, { userId: winner, source: 'win', ref: game.ref });
  return { userId: winner, result };
}

/**
 * Pays a quiz night's podium, in the transaction that ends the night: first to third (`quizPodiumZer`), in a room of
 * QUIZ_PODIUM_MIN_ACCOUNTS accounts or more, to members only, at most PAID_PODIUMS_PER_DAY podiums a person a
 * day. A podium place is skipped when that player looks like another podium player on a second account, which is how a
 * room filled with someone's own accounts would farm it. `accounts` counts the room's signed-in players; nicknames
 * without an account earn nothing and do not count. A shared place pays each who shares it.
 */
export async function payQuizPodium(
  client: pg.PoolClient,
  wallet: WalletService,
  night: { ref: string; placings: readonly Placing[]; accounts: number },
  now: Date = new Date(),
): Promise<Array<{ userId: string; place: number; result: GrantResult }>> {
  // the places that pay, whoever holds them; who is a member decides the amount below
  const podium = night.placings.filter((p) => quizPodiumZer(p.place, night.accounts, true) > 0);
  const paid: Array<{ userId: string; place: number; result: GrantResult }> = [];
  for (const p of podium) {
    let alone = true;
    for (const other of podium) {
      if (other.userId !== p.userId && (await looksLikeOnePerson(client, p.userId, other.userId))) alone = false;
    }
    if (!alone) continue;
    const result = await earnWithin(client, wallet, {
      userId: p.userId,
      amount: quizPodiumZer(p.place, night.accounts, await isMember(client, p.userId, now)),
      reason: QUIZ_PODIUM_REASON,
      refId: night.ref,
      idempotencyKey: `quiz-podium:${night.ref}:${p.userId}`,
      perDay: PAID_PODIUMS_PER_DAY,
      now,
    });
    await grantBagGiftWithin(client, { userId: p.userId, source: 'podium', ref: night.ref });
    paid.push({ userId: p.userId, place: p.place, result });
  }
  return paid;
}
