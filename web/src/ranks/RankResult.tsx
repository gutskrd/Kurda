import { useEffect, useRef, useState } from 'react';
import { BURST, isRankedGame, partWeightReason, progressToNext, type PartWeightReason, type PlayGame, type RankResult as RankResultData, type RankTier } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { ShieldIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { prefersReducedMotion } from '../lib/motion';
import { PlacementEmblem, RankEmblem } from './art';
import { Celebration, useCelebrationHold } from './Celebration';
import { friendlyReason, rankLabel, rankTierNamed, reasonLine, withMeaning } from './names';
import { signed } from './rated';

/** How long the numbers take to count, and how often a pending result is fetched again. */
const COUNT_MS = 1100;
const POLL_MS = 1500;
const POLL_TRIES = 12;

/** The line under a result that moved less than a full game: the reason that applied. */
const PART_WEIGHT_NOTE = {
  'repeat-opponent': 'rankResult.dampedRepeat',
  'new-account': 'rankResult.dampedNew',
  both: 'rankResult.dampedBoth',
} as const satisfies Record<PartWeightReason, string>;

type Load = { state: 'loading' } | { state: 'none' } | { state: 'ready'; result: RankResultData };

/**
 * What a finished game did to the reader's rank: the change counting up, the bar filling, and one reason, such as
 * "+24 · you beat a higher-ranked player". A new division or tier is celebrated once the numbers land, with badges
 * waiting until then. A loss is drawn as calmly as a win, with no red or shake. A friendly game says so, and why if the
 * host chose Rated. The result can lag the game's end, so a pending answer is fetched again a few times.
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
      // Not in it, or an answer without the expected shape: nothing to show.
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

  // Badges this game earned wait while the result is shown.
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

  // The bar eases from where it was; across a division it fills, then starts again.
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
  }, []); // Once, since a result does not change.

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
        {/* The numbers animate visually; screen readers hear the final values once. */}
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
              <span className={`rank-progress-fill${reduced ? '' : ' is-animated'}`} style={{ '--p': Math.min(1, Math.max(0.03, bar)) } as React.CSSProperties} />
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
          // A division gets a small burst, a new tier or first rank a larger one.
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

/** A number easing from `from` to `to` over COUNT_MS, or at once under Reduce Motion. */
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
