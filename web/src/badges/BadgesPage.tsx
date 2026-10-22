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
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ErrorState } from '../components/states';
import { BadgesSkeleton } from '../components/skeletons';
import { CheckIcon, LockIcon, SparkleIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import { FAMILY_KEY, badgeDesc, badgeHint, badgeNamed, badgeTierNamed, unitWord } from '../ranks/names';
import { Medal, TierPips, progressFraction, progressText, tierClass } from './parts';

/**
 * Badges (contract 4 §B, §U): every badge in its family, what each tier
 * needs, how far along you are, the secrets as "???" until found, and the
 * three you show on your profile.
 *
 * A badge not earned yet is drawn in quiet grey with its progress — never
 * hidden, so there is always a next thing in reach, and never styled as
 * missing. The few nearest their next tier come first ("Almost there"):
 * people try hardest when a goal is close. Rarity appears only once enough
 * people are active for a percentage to mean something (the server decides;
 * it sends null before).
 */
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

  const byFamily = useMemo(() => {
    const groups = new Map<BadgeFamily, BadgeView[]>();
    for (const f of BADGE_FAMILIES) groups.set(f, []);
    for (const b of data?.badges ?? []) groups.get(b.family)?.push(b);
    return groups;
  }, [data]);

  // the heading is the page's own from the first frame; only what is yours waits
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
  const showcase = data.showcase.map((k) => data.badges.find((b) => b.key === k)).filter((b): b is BadgeView => Boolean(b));
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
          initial={data.showcase}
          onClose={() => setPicking(false)}
          onSaved={(keys) => {
            setData((d) => (d ? { ...d, showcase: keys } : d));
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
    <button type="button" className={`badge-tile ${tierClass(view)}`} onClick={onOpen}>
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

/** A badge up close: what it is, each tier and what it needs, and when it was earned. */
function BadgeDetail({ view, onClose }: { view: BadgeView; onClose: () => void }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const named = view.hidden ? null : badgeNamed(t, view.key);
  const title = named ? named.name : t('badges.secretName');
  const def = badgeDef(view.key);
  const hint = view.hidden ? badgeHint(t, view.hintKey) : null;
  const date = (iso: string | undefined) => (iso ? new Date(iso).toLocaleDateString(locale, { dateStyle: 'medium' }) : null);
  return (
    <Modal open onClose={onClose} label={title}>
      <div className={`badge-detail ${tierClass(view)}`}>
        <div className="badge-detail-art badge-medal is-hovered">
          <Medal view={view} size={148} playing />
        </div>
        <h2 className="badge-detail-name">{title}</h2>
        {named?.meaning && <p className="badge-detail-meaning">{named.meaning}</p>}
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
        {!view.hidden && view.thresholds.length <= 1 && view.earnedAt && (
          <p className="badge-detail-when">{t('badges.earnedOn', { date: date(view.earnedAt) ?? '' })}</p>
        )}
        {progressText(t, view) && (
          <div className="badge-detail-progress">
            <span className="badge-bar" aria-hidden="true">
              <span style={{ width: `${Math.max(4, progressFraction(view) * 100)}%` }} />
            </span>
            <span>{progressText(t, view)}</span>
          </div>
        )}
        {view.rarity && view.tier > 0 && view.rarity[view.tier - 1] != null && (
          <p className="badge-detail-rarity">
            <SparkleIcon size={14} />
            {t('badges.rarity', { percent: formatRarity(view.rarity[view.tier - 1]!) })}
          </p>
        )}
      </div>
    </Modal>
  );
}

function formatRarity(percent: number): string {
  return percent < 1 ? '<1' : String(Math.round(percent));
}

/**
 * Choosing the profile's three: tap to add, tap again to take off, in the
 * order chosen. A fourth is refused with a line saying why rather than
 * silently replacing one.
 */
function ShowcasePicker({
  badges,
  initial,
  onClose,
  onSaved,
}: {
  badges: BadgeView[];
  initial: string[];
  onClose: () => void;
  onSaved: (keys: string[]) => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [keys, setKeys] = useState<string[]>(initial.filter((k) => badges.some((b) => b.key === k)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = keys.length >= SHOWCASE_SIZE;

  function toggle(key: string): void {
    setKeys((k) => (k.includes(key) ? k.filter((x) => x !== key) : k.length >= SHOWCASE_SIZE ? k : [...k, key]));
  }

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await client.request<{ showcase: string[] }>('PUT', '/me/badges/showcase', { body: { keys } });
    setBusy(false);
    if (res.ok) onSaved(res.data.showcase ?? keys);
    else setError(describeError(res.error, t));
  }

  return (
    <Modal open onClose={onClose} label={t('badges.showcase.title')}>
      <div className="showcase-picker">
        <h2 className="story-setup-title">{t('badges.showcase.title')}</h2>
        <p className="muted">{t('badges.showcase.help')}</p>
        <p className="showcase-picker-count" aria-live="polite">
          {t('badges.showcase.chosen', { count: keys.length, max: SHOWCASE_SIZE })}
        </p>
        <ul className="showcase-picker-grid">
          {badges.map((b) => {
            const on = keys.includes(b.key);
            const name = badgeNamed(t, b.key).name;
            return (
              <li key={b.key}>
                <button
                  type="button"
                  className={`showcase-pick${on ? ' is-on' : ''}`}
                  aria-pressed={on}
                  disabled={!on && full}
                  onClick={() => toggle(b.key)}
                >
                  <Medal view={b} size={60} shine={false} />
                  <span className="showcase-pick-name">{name}</span>
                  {on && <span className="showcase-pick-order">{keys.indexOf(b.key) + 1}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        {full && <p className="story-setup-note">{t('badges.showcase.full')}</p>}
        {error && (
          <p className="msg msg-error" role="alert">
            {error}
          </p>
        )}
        <div className="story-setup-submit">
          <Button size="lg" block disabled={busy} onClick={() => void save()}>
            {busy ? t('common.loading') : t('badges.showcase.save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
