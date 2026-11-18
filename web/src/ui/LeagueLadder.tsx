import { LEAGUE_TIERS, type LeagueTier } from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import { LeagueEmblem } from '../ranks/art';
import { leagueNamed, withMeaning } from '../ranks/names';

/**
 * Four of the six league tiers around the reader's own, with the next one above; six names do not fit a phone. At
 * either end the window slides rather than shrinks. The current rung has `aria-current` as well as its highlight.
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
