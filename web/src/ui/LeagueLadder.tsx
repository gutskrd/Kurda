import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { TIERS, tierMeta } from '../leagues/format';

/**
 * "Gold League", in the reader's language and word order.
 *
 * Without the medal emoji the catalogue's template leaves room for: the front
 * page names leagues in words, and the app now does too. The template still
 * carries the `{emoji}` hole so every catalogue keeps its word order — it is
 * filled with nothing and the edge trimmed.
 */
export function leagueName(t: (key: MessageKey, vars?: Record<string, string | number>) => string, tier: string): string {
  const meta = tierMeta(tier);
  return t('leagues.tierName', { emoji: '', tier: meta.labelKey ? t(meta.labelKey) : meta.label }).trim();
}

/**
 * Where you are on the ladder: the tier you are in, the two you climbed through
 * to get there, and the one above.
 *
 * Four rungs rather than all ten. The whole ladder at a glance is ten words in a
 * row that no phone has room for, and the question somebody brings to a league
 * is never "what is eighth" — it is "where am I, and what is next". At the
 * bottom and the top the window slides rather than shrinks, so it is always
 * four.
 *
 * The current rung is gold, because the league is progress and gold is the
 * colour this app keeps for progress. It is also `aria-current`, so the answer
 * is not carried by colour alone.
 */
export function LeagueLadder({ tier }: { tier: string }): React.JSX.Element {
  const t = useT();
  const at = (TIERS as readonly string[]).indexOf(tier);
  const start = at < 0 ? 0 : Math.max(0, Math.min(at - 2, TIERS.length - 4));
  const rungs = TIERS.slice(start, start + 4);

  return (
    <ol className="ladder">
      {rungs.map((key) => {
        const i = (TIERS as readonly string[]).indexOf(key);
        const meta = tierMeta(key);
        const state = i === at ? 'current' : i < at ? 'past' : 'next';
        return (
          <li key={key} className={`ladder-rung is-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="ladder-dot" aria-hidden />
            <span className="ladder-name">{meta.labelKey ? t(meta.labelKey) : meta.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
