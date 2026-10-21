import { useEffect, useRef, useState } from 'react';
import { BURST, isRankedGame, partWeightReason, progressToNext, type PartWeightReason, type PlayGame, type RankResult as RankResultData, type RankTier } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { ShieldIcon } from '../components/icons';
import { prefersReducedMotion } from '../gifts/motion';
import { useT } from '../i18n/I18nProvider';
import { PlacementEmblem, RankEmblem } from './art';
import { Celebration, useCelebrationHold } from './Celebration';
import { friendlyReason, rankLabel, rankTierNamed, reasonLine, withMeaning } from './names';
import { signed } from './rated';

/** How long the numbers take to count, and how often a result not yet in is asked for again. */
export const COUNT_MS = 1100;
const POLL_MS = 1500;
const POLL_TRIES = 12;

/** The line under a result that moved less than a full game: the reason that applied, never a guess between two. */
const PART_WEIGHT_NOTE = {
  'repeat-opponent': 'rankResult.dampedRepeat',
  'new-account': 'rankResult.dampedNew',
  both: 'rankResult.dampedBoth',
} as const satisfies Record<PartWeightReason, string>;

type Load = { state: 'loading' } | { state: 'none' } | { state: 'ready'; result: RankResultData };

/**
 * What a finished game did to your rank (contract 4 §R2, §U): the change
 * counting up, the bar filling, and one plain reason — "+24 · you beat a
 * higher-ranked player", "−6 · close game against a stronger player". A new
 * division or tier is celebrated once the numbers have landed; the badges the
 * game also earned wait until then.
 *
 * A loss is said as plainly as a win and drawn the same way: the number in the
 * same calm ink, the bar easing back, no shake and no red. A friendly game
 * says it was friendly, and why when the host had chosen Rated.
 *
 * The result can arrive a moment after the game ends (the rating is applied as
 * the game closes), so a "pending" answer is asked again a few times.
 */
export function RankResult({ game, gameRef }: { game: PlayGame; gameRef: string }): React.JSX.Element | null {
  const { client } = useAuth();
  const t = useT();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const ranked = isRankedGame(game) ? game : null;

  useEffect(() => {
    if (!ranked) return;
    let cancelled = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = async (): Promise<void> => {
      const res = await client.get<RankResultData>(`/ranks/results/${ranked}/${gameRef}`);
      if (cancelled) return;
      // not in it, or an answer without the shape (an API from before Game Ranks): nothing to show
      if (!res.ok || typeof res.data?.counted !== 'boolean') return setLoad({ state: 'none' });
      const r = res.data;
      if (!r.counted && r.pending && tries < POLL_TRIES) {
        tries += 1;
        timer = setTimeout(() => void ask(), POLL_MS);
        return;
      }
      setLoad({ state: 'ready', result: r });
    };
    void ask();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [client, ranked, gameRef]);

  // the badges this game earned wait while the result is still being shown
  const counted = load.state === 'ready' && load.result.counted;
  const [done, setDone] = useState(false);
  useCelebrationHold((load.state === 'loading' || counted) && !done);

  if (!ranked || load.state === 'none') return null;
  if (load.state === 'loading') {
    return (
      <div className="rank-result is-loading" aria-busy="true">
        <p className="rank-result-pending">{t('rankResult.pending')}</p>
      </div>
    );
  }
  const r = load.result;
  if (!r.counted) {
    if (r.pending) return <p className="rank-result-note">{t('rankResult.pending')}</p>;
    if (r.voided) return <p className="rank-result-note">{t('rankResult.voided')}</p>;
    const why = r.friendlyReason && r.friendlyReason !== 'chosen' ? friendlyReason(t, r.friendlyReason) : null;
    return <p className="rank-result-note">{why ? t('rankResult.friendlyBecause', { reason: why }) : t('rankResult.friendly')}</p>;
  }
  return <CountedResult result={r} onSettled={() => setDone(true)} />;
}

function CountedResult({
  result,
  onSettled,
}: {
  result: Extract<RankResultData, { counted: true }>;
  onSettled: () => void;
}): React.JSX.Element {
  const t = useT();
  const reduced = useRef(prefersReducedMotion()).current;
  const [phase, setPhase] = useState<'counting' | 'landed'>(reduced ? 'landed' : 'counting');
  const [celebrating, setCelebrating] = useState(false);
  const delta = useCountUp(0, result.delta, reduced);
  const points = useCountUp(result.pointsBefore, result.pointsAfter, reduced);

  const placing = result.tierAfter === null;
  const placed = result.tierBefore === null && result.tierAfter !== null;
  const tierAfter = result.tierAfter;
  const celebrate = !placing && (placed || result.tierUp || result.divisionUp);

  // the bar starts where it was and eases to where it is; across a division it fills, then starts again
  const before = progressToNext(result.pointsBefore);
  const after = result.progress ?? progressToNext(result.pointsAfter);
  const crossed = result.divisionUp || result.tierUp;
  const [bar, setBar] = useState(reduced ? after.fraction : placing ? 0 : before.fraction);
  useEffect(() => {
    if (reduced || placing) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (crossed) {
      timers.push(setTimeout(() => setBar(1), 120));
      timers.push(setTimeout(() => setBar(after.fraction), COUNT_MS * 0.7));
    } else {
      timers.push(setTimeout(() => setBar(after.fraction), 120));
    }
    timers.push(setTimeout(() => setPhase('landed'), COUNT_MS + 100));
    return () => timers.forEach(clearTimeout);
  }, []); // once: a result does not change

  useEffect(() => {
    if (phase !== 'landed') return;
    if (celebrate) setCelebrating(true);
    else onSettled();
  }, [phase]);

  const reason = reasonLine(t, result.reason);
  const label = tierAfter ? rankLabel(t, tierAfter, result.divisionAfter) : null;
  const next = after.next ? rankLabel(t, after.next.tier, after.next.division) : null;
  const partWeight = partWeightReason(result);
  const tone = result.delta > 0 ? 'is-up' : result.delta < 0 ? 'is-down' : 'is-even';

  return (
    <section className={`rank-result ${tierAfter ? `tier-${tierAfter}` : 'is-placing'} ${tone}`} aria-labelledby="rank-result-title">
      <h3 id="rank-result-title" className="sr-only">
        {t('rankResult.title')}
      </h3>
      <div className="rank-result-art">
        {placing || !tierAfter ? (
          <PlacementEmblem done={result.placement?.played ?? 0} size={84} title={t('ranks.placing', { played: result.placement?.played ?? 0, of: result.placement?.of ?? 5 })} />
        ) : (
          <RankEmblem tier={tierAfter} division={result.divisionAfter} size={84} title={withMeaning(t, { ...rankTierNamed(t, tierAfter), name: label! })} />
        )}
      </div>
      <div className="rank-result-body">
        <p className="rank-result-line">
          <span className="rank-result-delta" aria-hidden="true">
            {signed(delta)}
          </span>
          {reason && <span className="rank-result-reason">{reason}</span>}
        </p>
        {/* the numbers move for the eye; a screen reader hears where they land, once */}
        <p className="sr-only" role="status">
          {phase === 'landed' ? t('rankResult.summary', { delta: signed(result.delta), reason: reason ?? '', points: result.pointsAfter }) : ''}
        </p>
        <p className="rank-result-standing" aria-hidden="true">
          {placing ? (
            t('ranks.placing', { played: result.placement?.played ?? 0, of: result.placement?.of ?? 5 })
          ) : (
            <>
              <span className="rank-result-tier">{label}</span>
              <span className="rank-result-points">{t('ranks.points', { points: points.toLocaleString() })}</span>
            </>
          )}
        </p>
        {!placing && (
          <div className="rank-progress">
            <div className="rank-progress-bar" aria-hidden="true">
              <span className={`rank-progress-fill${reduced ? '' : ' is-animated'}`} style={{ width: `${Math.max(3, bar * 100)}%` }} />
            </div>
            <span className="rank-progress-label">
              {next ? t('ranks.toNext', { points: after.pointsToGo ?? 0, next }) : t('ranks.topOfClimb')}
            </span>
          </div>
        )}
        {result.reason === 'shield' || (result.shieldGames > 0 && result.tierUp) ? (
          <p className="rank-shield">
            <span className="rank-shield-pips" aria-hidden="true">
              <span className="rank-shield-pip is-on">
                <ShieldIcon size={12} />
              </span>
            </span>
            <span>{t('ranks.shield', { count: result.shieldGames })}</span>
          </p>
        ) : null}
        {partWeight && <p className="rank-result-note">{t(PART_WEIGHT_NOTE[partWeight])}</p>}
      </div>
      {celebrate && tierAfter && (
        <Celebration
          open={celebrating}
          label={label!}
          tone={tierAfter}
          // a division is a nod, a new tier or a first rank a little more
          flecks={result.tierUp ? BURST.tier : placed ? BURST.placed : BURST.division}
          seed={tierAfter.length * 31 + (result.divisionAfter ?? 0)}
          art={<RankEmblem tier={tierAfter} division={result.divisionAfter} size={168} title={withMeaning(t, { ...rankTierNamed(t, tierAfter), name: label! })} />}
          kicker={placed ? t('rankResult.placedKicker') : result.tierUp ? t('rankResult.tierUpKicker') : t('rankResult.divisionUpKicker')}
          title={label!}
          body={
            result.tierUp || placed
              ? welcomeLine(t, tierAfter)
              : next
                ? t('ranks.toNext', { points: after.pointsToGo ?? 0, next })
                : null
          }
          extra={
            result.tierUp && result.shieldGames > 0 ? (
              <p className="celebrate-note">
                <ShieldIcon size={14} />
                {t('ranks.shieldHint', { count: result.shieldGames, tier: rankTierNamed(t, tierAfter).name })}
              </p>
            ) : null
          }
          action={t('rankResult.continue')}
          onClose={() => {
            setCelebrating(false);
            onSettled();
          }}
        />
      )}
    </section>
  );
}

/** "Welcome to Çiya — Mountain." */
function welcomeLine(t: ReturnType<typeof useT>, tier: RankTier): string {
  const named = rankTierNamed(t, tier);
  return named.meaning ? t('rankResult.welcomeMeaning', { tier: named.name, meaning: named.meaning }) : t('rankResult.welcome', { tier: named.name });
}

/** A number easing from `from` to `to` over COUNT_MS (at once under reduced motion). */
function useCountUp(from: number, to: number, reduced: boolean): number {
  const [value, setValue] = useState(reduced ? to : from);
  useEffect(() => {
    if (reduced || from === to) {
      setValue(to);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now: number): void => {
      const k = Math.min(1, (now - start) / COUNT_MS);
      const eased = 1 - Math.pow(1 - k, 3);
      setValue(Math.round(from + (to - from) * eased));
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [from, to, reduced]);
  return value;
}
