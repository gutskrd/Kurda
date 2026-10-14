import { LEAGUE_TIERS, type LeagueTier } from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import { LeagueEmblem } from '../ranks/art';
import { leagueNamed, withMeaning } from '../ranks/names';

/**
 * Where you are on the ladder: the tier you are in, the ones you climbed
 * through, and the one above — four of the six water tiers, a drop to the
 * ocean (contract 4 §L1).
 *
 * Four rungs rather than all six: the question somebody brings to a league is
 * "where am I, and what is next", and six names in a row do not fit a phone.
 * At the bottom and the top the window slides rather than shrinks.
 *
 * The current rung is marked in words for a screen reader (`aria-current`)
 * as well as by its light, so the answer is never carried by colour alone.
 */
export function LeagueLadder({ tier }: { tier: LeagueTier }): React.JSX.Element {
  const t = useT();
  const at = LEAGUE_TIERS.indexOf(tier);
  const start = at < 0 ? 0 : Math.max(0, Math.min(at - 2, LEAGUE_TIERS.length - 4));
  const rungs = LEAGUE_TIERS.slice(start, start + 4);

  return (
    <ol className="ladder">
      {rungs.map((key) => {
        const i = LEAGUE_TIERS.indexOf(key);
        const named = leagueNamed(t, key);
        const state = i === at ? 'current' : i < at ? 'past' : 'next';
        return (
          <li key={key} className={`ladder-rung is-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="ladder-art" aria-hidden="true">
              <LeagueEmblem tier={key} size={30} title={withMeaning(t, named)} />
            </span>
            <span className="ladder-name">{named.name}</span>
          </li>
        );
      })}
    </ol>
  );
}
