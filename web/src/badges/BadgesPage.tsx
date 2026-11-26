import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BADGE_FAMILIES,
  SHOWCASE_SIZE,
  badgeTierKey,
  badgeDef,
  nearestBadges,
  type BadgeFamily,
  type BadgeView,
  type BadgesResponse,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { useOptimistic } from '../lib/optimistic';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { ErrorState } from '../components/states';
import { BadgesSkeleton } from '../components/skeletons';
import { CheckIcon, LockIcon, SparkleIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import { FAMILY_KEY, badgeDesc, badgeHint, badgeNamed, badgeTierNamed, unitWord } from '../ranks/names';
import { Medal, TierPips, badgeWash, formatRarity, progressFraction, progressText, tierClass } from './parts';
import { ShowcasePicker } from './ShowcasePicker';

/**
 * The badges page: every badge by family with each tier's requirement and the reader's progress, secrets as "???"
 * until found, and the three shown on the profile. Unearned badges are grey with their progress, never hidden, and
 * the few nearest their next tier come first. Rarity shows only when the server sends it.
 */
/** No badges on show; one array, so an empty showcase is the same value from render to render. */
const NONE: string[] = [];

export function BadgesPage(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [data, setData] = useState<BadgesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<BadgeView | null>(null);
  const [picking, setPicking] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const res = await client.get<BadgesResponse>('/me/badges');
    if (res.ok) setData(res.data);
    else setError(describeError(res.error, t));
  }, [client, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // The three on the profile change as the picker closes (lib/optimistic.ts); the server's answer has the last word.
  const [showcaseKeys, wantShowcase] = useOptimistic<string[], { showcase?: string[] }>(
    data?.showcase ?? NONE,
    (keys) => client.request<{ showcase?: string[] }>('PUT', '/me/badges/showcase', { body: { keys } }),
    { fromAnswer: (answer, sent) => answer.showcase ?? sent },
  );

  const byFamily = useMemo(() => {
    const groups = new Map<BadgeFamily, BadgeView[]>();
    for (const f of BADGE_FAMILIES) groups.set(f, []);
    for (const b of data?.badges ?? []) groups.get(b.family)?.push(b);
    return groups;
  }, [data]);

  // The heading shows from the first frame; only the reader's data waits.
  const header = (
    <div className="page-header">
      <span className="eyebrow">{t('badges.eyebrow')}</span>
      <h1 className="page-title">{t('badges.title')}</h1>
      <p className="page-sub">{t('badges.sub')}</p>
    </div>
  );

  if (error && !data) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!data)
    return (
      <div className="container badges-page">
        {header}
        <BadgesSkeleton />
      </div>
    );

  const earned = data.badges.filter((b) => b.tier > 0).length;
  const showcase = showcaseKeys.map((k) => data.badges.find((b) => b.key === k)).filter((b): b is BadgeView => Boolean(b));
  const month = data.monthlyChallenge;
  const nearest = nearestBadges(data.badges);

  return (
    <div className="container badges-page">
      {header}

      <div className="badges-top">
        <section className="badges-showcase" aria-labelledby="showcase-title">
          <div className="badges-showcase-head">
            <h2 id="showcase-title" className="badges-section-title">
              {t('badges.showcase.title')}
            </h2>
            <Button variant="secondary" size="sm" onClick={() => setPicking(true)} disabled={earned === 0}>
              {t('badges.showcase.choose')}
            </Button>
          </div>
          <ol className="badges-showcase-slots">
            {Array.from({ length: SHOWCASE_SIZE }, (_, i) => {
              const b = showcase[i];
              return (
                <li key={i} className={`badges-slot${b ? ' is-filled' : ''}`}>
                  {b ? (
                    <>
                      <Medal view={b} size={76} />
                      <span className="badges-slot-name">{badgeNamed(t, b.key).name}</span>
                    </>
                  ) : (
                    <span className="badges-slot-empty">{t('badges.showcase.slot')}</span>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="badges-showcase-help">{earned === 0 ? t('badges.showcase.none') : t('badges.showcase.help')}</p>
        </section>

        <dl className="badges-stats">
          <div className="badges-stat">
            <dt>{t('badges.stat.earned')}</dt>
            <dd>{t('badges.stat.of', { count: earned, total: data.badges.length })}</dd>
          </div>
          <div className="badges-stat">
            <dt>{t('badges.stat.secrets')}</dt>
            <dd>{t('badges.stat.of', { count: data.secretsFound, total: data.secretsTotal })}</dd>
          </div>
          <div className="badges-stat">
            <dt>{t('badges.stat.month')}</dt>
            <dd>{t('badges.stat.monthDays', { days: month.days, goal: month.goal })}</dd>
            <span className="badges-stat-bar" aria-hidden="true">
              <span style={{ width: `${Math.min(100, (month.days / Math.max(1, month.goal)) * 100)}%` }} />
            </span>
          </div>
        </dl>
      </div>

      {nearest.length > 0 && (
        <section className="badges-family badges-nearest" aria-labelledby="nearest-title">
          <h2 id="nearest-title" className="badges-section-title">
            {t('badges.nearest')}
          </h2>
          <ul className="badges-grid">
            {nearest.map((b) => (
              <li key={b.key}>
                <BadgeTile view={b} onOpen={() => setOpen(b)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {BADGE_FAMILIES.map((family) => {
        const list = byFamily.get(family) ?? [];
        if (list.length === 0) return null;
        return (
          <section key={family} className={`badges-family family-${family}`} aria-labelledby={`family-${family}`}>
            <h2 id={`family-${family}`} className="badges-section-title">
              {t(FAMILY_KEY[family])}
              <span className="badges-family-count">
                {t('badges.stat.of', { count: list.filter((b) => b.tier > 0).length, total: list.length })}
              </span>
            </h2>
            <ul className="badges-grid">
              {list.map((b) => (
                <li key={b.key}>
                  <BadgeTile view={b} onOpen={() => setOpen(b)} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {data.legacy.length > 0 && (
        <section className="badges-family" aria-labelledby="legacy-title">
          <h2 id="legacy-title" className="badges-section-title">
            {t('badges.legacy')}
          </h2>
          <ul className="badges-legacy">
            {data.legacy.map((l) => (
              <li key={l.key}>{l.key === 'tournament-win' ? t('badges.legacy.tournamentWin') : l.key}</li>
            ))}
          </ul>
        </section>
      )}

      {open && <BadgeDetail view={open} onClose={() => setOpen(null)} />}
      {picking && (
        <ShowcasePicker
          badges={data.badges.filter((b) => b.tier > 0)}
          initial={showcaseKeys}
          onClose={() => setPicking(false)}
          onSaved={(keys) => {
            wantShowcase(keys);
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}

/** One badge in its family's grid: a button that opens its details. */
function BadgeTile({ view, onOpen }: { view: BadgeView; onOpen: () => void }): React.JSX.Element {
  const t = useT();
  const named = view.hidden ? null : badgeNamed(t, view.key);
  const progress = progressText(t, view);
  const tierName = view.tier > 0 && view.tierKey && view.tierCount > 1 ? badgeTierNamed(t, view.tierKey).name : null;
  return (
    <button type="button" className={`badge-tile ${tierClass(view)}`} style={badgeWash(view)} onClick={onOpen}>
      <span className="badge-tile-art badge-medal">
        <Medal view={view} size={96} />
      </span>
      <span className="badge-tile-name">{named ? named.name : t('badges.secretName')}</span>
      {named?.meaning && <span className="badge-tile-meaning">{named.meaning}</span>}
      <TierPips tier={view.tier} count={view.tierCount} />
      {tierName && <span className="badge-tile-tier">{tierName}</span>}
      {progress ? (
        <span className="badge-tile-progress">
          <span className="badge-bar" aria-hidden="true">
            <span style={{ width: `${Math.max(4, progressFraction(view) * 100)}%` }} />
          </span>
          <span className="badge-tile-progress-text">{progress}</span>
        </span>
      ) : view.tier > 0 ? (
        <span className="badge-tile-done">
          <CheckIcon size={13} />
          {view.tierCount > 1 ? t('badges.complete') : t('badges.earned')}
        </span>
      ) : view.hidden ? (
        <span className="badge-tile-progress-text">{view.hintKey ? t('badges.hintAvailable') : t('badges.secretKeep')}</span>
      ) : null}
    </button>
  );
}

/**
 * A badge up close in a bottom sheet: the badge on a wash of its own colour, when it was earned or how far is left,
 * its description, each tier's requirement, and a close button. Only the wash takes the badge's colour.
 */
function BadgeDetail({ view, onClose }: { view: BadgeView; onClose: () => void }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const named = view.hidden ? null : badgeNamed(t, view.key);
  const title = named ? named.name : t('badges.secretName');
  const def = badgeDef(view.key);
  const hint = view.hidden ? badgeHint(t, view.hintKey) : null;
  const date = (iso: string | undefined | null) => (iso ? new Date(iso).toLocaleDateString(locale, { dateStyle: 'medium' }) : null);
  const progress = progressText(t, view);
  // When the shown tier was earned; an unearned badge shows its progress instead.
  const earned = view.tier > 0 ? date(view.tierEarnedAt[view.tier - 1] ?? view.earnedAt) : null;
  const kicker = view.hidden ? t('badges.secret') : earned ? t('badges.earnedOn', { date: earned }) : view.tier > 0 ? t('badges.earned') : progress;
  return (
    <Sheet open onClose={onClose} label={title} className="badge-sheet">
      <div className={`badge-detail ${tierClass(view)}`} style={badgeWash(view)}>
        <div className="badge-detail-top">
          <div className="badge-detail-art badge-medal is-hovered">
            <Medal view={view} size={148} playing />
          </div>
        </div>
        <div className="badge-detail-body">
          {kicker && <p className="badge-detail-kicker">{kicker}</p>}
          <h2 className="badge-detail-name">{title}</h2>
          {named?.meaning && <p className="badge-detail-meaning">{named.meaning}</p>}
          <span className="badge-detail-rule" aria-hidden="true" />
          <p className="badge-detail-desc">
            {view.hidden ? (hint ? t('badges.hint', { hint }) : t('badges.secretKeep')) : badgeDesc(t, view.key)}
          </p>
          {!view.hidden && view.thresholds.length > 1 && def && (
            <ol className="badge-ladder">
              {view.thresholds.map((need, i) => {
                const tierNo = i + 1;
                const key = badgeTierKey(def, tierNo);
                const reached = view.tier >= tierNo;
                const rarity = view.rarity?.[i];
                return (
                  <li key={tierNo} className={`badge-ladder-row${reached ? ' is-reached' : ''}${key ? ` metal-${key}` : ''}`}>
                    <span className="badge-ladder-mark" aria-hidden="true">
                      {reached ? <CheckIcon size={13} /> : <LockIcon size={12} />}
                    </span>
                    <span className="badge-ladder-tier">{key ? badgeTierNamed(t, key).name : tierNo}</span>
                    <span className="badge-ladder-need">
                      {need > 0 ? t('badges.need', { count: need.toLocaleString(), unit: unitWord(t, view.unit, need) }) : t('badges.needAll')}
                    </span>
                    <span className="badge-ladder-when">
                      {reached ? date(view.tierEarnedAt[i]) : rarity != null ? t('badges.rarity', { percent: formatRarity(rarity) }) : null}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
          {progress && (
            <div className="badge-detail-progress">
              <span className="badge-bar" aria-hidden="true">
                <span style={{ width: `${Math.max(4, progressFraction(view) * 100)}%` }} />
              </span>
              {/* For an unearned badge the line above the name already shows this. */}
              {view.tier > 0 && <span>{progress}</span>}
            </div>
          )}
          {view.rarity && view.tier > 0 && view.rarity[view.tier - 1] != null && (
            <p className="badge-detail-rarity">
              <SparkleIcon size={14} />
              {t('badges.rarity', { percent: formatRarity(view.rarity[view.tier - 1]!) })}
            </p>
          )}
          <Button size="lg" block className="badge-detail-done" onClick={onClose}>
            {t('common.done')}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
