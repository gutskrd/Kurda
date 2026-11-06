import { useCallback, useEffect, useState } from 'react';
import { VILLAGE_LEVELS, type VillageFeature, type VillageStanding } from '@kurda/shared';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

/**
 * The village's own level on the website: the badge and bar in the top bar
 * with a hint of what comes next, the sheet of every level and what it
 * brings, the banner of a level just reached, and the memory, on this device,
 * of the last level the learner was shown.
 */

/** Each piece's name in the catalogues, spelled out so the catalogue checks can see every key is read. */
const UNLOCK_KEY: Readonly<Record<VillageFeature, MessageKey>> = {
  camp: 'kingdom.unlock.camp',
  plots: 'kingdom.unlock.plots',
  shepherd: 'kingdom.unlock.shepherd',
  wheat: 'kingdom.unlock.wheat',
  baker: 'kingdom.unlock.baker',
  hens: 'kingdom.unlock.hens',
  sheepfold: 'kingdom.unlock.sheepfold',
  farmer: 'kingdom.unlock.farmer',
  laundry: 'kingdom.unlock.laundry',
  haystack: 'kingdom.unlock.haystack',
  chickpeas: 'kingdom.unlock.chickpeas',
  chicks: 'kingdom.unlock.chicks',
  children: 'kingdom.unlock.children',
  goatfold: 'kingdom.unlock.goatfold',
  signs: 'kingdom.unlock.signs',
  waterCarrier: 'kingdom.unlock.waterCarrier',
  mill: 'kingdom.unlock.mill',
  tomatoes: 'kingdom.unlock.tomatoes',
  benches: 'kingdom.unlock.benches',
  dock: 'kingdom.unlock.dock',
  cow: 'kingdom.unlock.cow',
  boat: 'kingdom.unlock.boat',
  elder: 'kingdom.unlock.elder',
  lanterns: 'kingdom.unlock.lanterns',
  hives: 'kingdom.unlock.hives',
  onions: 'kingdom.unlock.onions',
  threshing: 'kingdom.unlock.threshing',
  donkey: 'kingdom.unlock.donkey',
  rider: 'kingdom.unlock.rider',
  orchardRows: 'kingdom.unlock.orchardRows',
  kilims: 'kingdom.unlock.kilims',
  jars: 'kingdom.unlock.jars',
  flowers: 'kingdom.unlock.flowers',
  poplars: 'kingdom.unlock.poplars',
  bigFlock: 'kingdom.unlock.bigFlock',
  bridge: 'kingdom.unlock.bridge',
  dovecote: 'kingdom.unlock.dovecote',
  loom: 'kingdom.unlock.loom',
  weaver: 'kingdom.unlock.weaver',
  festival: 'kingdom.unlock.festival',
};
const unlockKey = (f: VillageFeature): MessageKey => UNLOCK_KEY[f];

/** What a level brings, in words: its first piece (the one the camera goes to show), and the rest after it. */
export function unlockText(t: ReturnType<typeof useT>, unlocks: readonly VillageFeature[]): string {
  return unlocks.map((f) => t(unlockKey(f))).join(' · ');
}

/**
 * The last village level this learner was shown on this device, kept so a
 * level-up is celebrated once. A device that has never shown the village
 * starts at the level the village stands at now, so a new device does not
 * replay old levels. Storage that fails (a private window) only means the
 * village is never celebrated there, never an error.
 */
export function useVillageSeen(user: string | null, level: number): { seen: number; markSeen: (level: number) => void } {
  const key = `kurda.village.seen.${user ?? 'guest'}`;
  const [seen, setSeen] = useState<number>(() => {
    try {
      const kept = Number(window.localStorage.getItem(key));
      if (Number.isInteger(kept) && kept >= 1) return kept;
      window.localStorage.setItem(key, String(level));
    } catch {
      // nothing kept: nothing to celebrate on this device
    }
    return level;
  });
  const markSeen = useCallback(
    (l: number) => {
      setSeen(l);
      try {
        window.localStorage.setItem(key, String(l));
      } catch {
        // not kept; it will be shown again next time, which is harmless
      }
    },
    [key],
  );
  // a level that drops below what was seen (another learner's level kept under the same key, or storage edited) is not celebrated again
  useEffect(() => {
    if (seen > level && level >= 1) markSeen(level);
  }, [seen, level, markSeen]);
  return { seen, markSeen };
}

/** The badge in the top bar: the village's level on a shield, a bar to the next, and what the next brings; a tap opens the levels. */
export function LevelBadge({ standing, shown, bump, onOpen }: { standing: VillageStanding; shown: number; bump: boolean; onOpen: () => void }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const number = (v: number): string => new Intl.NumberFormat(locale).format(v);
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(shown < standing.level ? 1 : standing.share);
  const next = shown < standing.level ? VILLAGE_LEVELS[shown] : standing.next;
  const hint = next ? t('kingdom.village.next', { thing: t(unlockKey(next.unlocks[0]!)) }) : t('kingdom.village.top');
  const share = shown < standing.level ? 1 : standing.share;
  return (
    <button type="button" className="kingdom-level" onClick={onOpen} data-testid="kingdom-level" aria-label={`${t('kingdom.village.level', { level: number(shown) })}. ${next ? t('kingdom.village.bar', { percent, level: number(next.level) }) : ''} ${hint}`}>
      <span className={`kingdom-level-badge${bump ? ' is-ticked' : ''}`} aria-hidden="true">
        {number(shown)}
      </span>
      <span className="kingdom-level-text" aria-hidden="true">
        <span className="kingdom-level-bar">
          <span style={{ width: `${Math.round(share * 100)}%` }} />
        </span>
        <span className="kingdom-level-next">{hint}</span>
      </span>
    </button>
  );
}

/** The sheet of every level: those reached ticked, the next one lit, the rest still to come as silhouettes; and how the village earns its experience. */
export function LevelSheet({ level }: { level: number }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const number = (v: number): string => new Intl.NumberFormat(locale).format(v);
  return (
    <div className="kingdom-levels">
      <p className="kingdom-levels-how">{t('kingdom.village.how')}</p>
      <ol className="kingdom-levels-list">
        {VILLAGE_LEVELS.map((l) => {
          const state = l.level <= level ? 'reached' : l.level === level + 1 ? 'next' : 'later';
          return (
            <li key={l.level} className={`kingdom-levels-row is-${state}`}>
              <span className="kingdom-levels-n" aria-hidden="true">
                {state === 'reached' ? (
                  <svg viewBox="0 0 16 16" width="14" height="14">
                    <path d="M3 8.4l3.2 3.2L13 4.6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  number(l.level)
                )}
              </span>
              <span className="kingdom-levels-what">
                <span className="kingdom-levels-level">{t('kingdom.village.level', { level: number(l.level) })}</span>
                {state === 'later' ? (
                  <span className="kingdom-levels-silhouette" aria-label={t('kingdom.village.locked')}>
                    {l.unlocks.map((f) => (
                      <span key={f} aria-hidden="true" />
                    ))}
                  </span>
                ) : (
                  <span className="kingdom-levels-unlock">
                    {unlockText(t, l.unlocks)}
                    {state === 'reached' && <span className="sr-only">, {t('kingdom.village.reached')}</span>}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The banner of a level just reached: the level, and what it brought, for a moment over the village while the camera shows it. */
export function LevelUp({ level, unlocks }: { level: number; unlocks: readonly VillageFeature[] }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  return (
    <div className="kingdom-levelup" role="status" aria-live="polite">
      <span className="kingdom-levelup-kicker">{t('kingdom.celebrate.kicker')}</span>
      <span className="kingdom-levelup-title">{t('kingdom.village.level', { level: new Intl.NumberFormat(locale).format(level) })}</span>
      <span className="kingdom-levelup-new">{t('kingdom.village.new', { thing: unlockText(t, unlocks) })}</span>
    </div>
  );
}
