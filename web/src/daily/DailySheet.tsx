import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  badgeDef,
  badgeTierKey,
  fireLadder,
  fireLevel,
  fireSizeToFit,
  freezeLine,
  nextFireStage,
  splitWeeks,
  weekInsights,
  weekStats,
  type FireLadderPlace,
  type TodayBadge,
} from '@kurda/shared';
import { Fire } from '../components/Fire';
import { ChevronIcon, IceIcon, XpIcon } from '../components/icons';
import { Sheet } from '../components/Sheet';
import { Skeleton } from '../components/Skeleton';
import { ErrorState } from '../components/states';
import { Medal } from '../badges/parts';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { FIRE_NEXT, FIRE_STAGE_NAME } from '../learn/fireWords';
import type { StreakSummary } from '../lib/types';
import { badgeNamed, badgeTierNamed } from '../ranks/names';
import { DailyZer } from './DailyZer';
import { Insights } from './Insights';
import { RepairOffer, Restored, takeWonBack } from './Repair';
import type { Today, TodayView } from './today';
import { WeekRow, thisWeek } from './WeekRow';
import './daily.css';

/**
 * The daily view, one sheet for the streak and the daily Zêr, opened from the home card, Learn's "Today" and the profile:
 * the fire with the streak under it, this week's days, today's Zêr, the week's stats, what the insights say, the latest
 * badge, and quietly the freezes, the way to win an ended streak back while it can be, the longest streak and the fire's
 * stages. A streak won back by today's learning is greeted once. The insights open as a second step in the same sheet.
 * `onStreak` hands a restored streak to the opener.
 */
export function DailySheet({
  open,
  onClose,
  today,
  onStreak,
}: {
  open: boolean;
  onClose: () => void;
  today: Today;
  onStreak?: (streak: StreakSummary) => void;
}): React.JSX.Element {
  const t = useT();
  return (
    <Sheet open={open} onClose={onClose} label={t('profile.stat.streak')} className="daily-sheet">
      {open ? <DailyBody today={today} onStreak={onStreak} onLearn={onClose} /> : null}
    </Sheet>
  );
}

/** The open sheet's contents, mounted only while open so a just-restored state and the step are forgotten on close. */
function DailyBody({ today, onStreak, onLearn }: { today: Today; onStreak?: (streak: StreakSummary) => void; onLearn: () => void }): React.JSX.Element {
  const t = useT();
  const [step, setStep] = useState<'view' | 'insights'>('view');
  const [restored, setRestored] = useState<StreakSummary | null>(null);
  const [wonBack, setWonBack] = useState(false);
  const view = today.view;
  useEffect(() => {
    if (view && !wonBack && takeWonBack(view.streak, view.today)) setWonBack(true);
  }, [view, wonBack]);
  if (!view) {
    return today.error ? <ErrorState message={today.error} onRetry={today.reload} /> : <DailySkeleton />;
  }
  const weeks = splitWeeks(view);
  const insights = weekInsights(weeks, view.streak.daysLearned ?? 0);
  if (step === 'insights') {
    return (
      <div className="daily daily-step">
        <button type="button" className="daily-back" onClick={() => setStep('view')}>
          <ChevronIcon size={18} className="daily-back-icon" />
          {t('daily.back')}
        </button>
        <h2 className="daily-step-title">{t('daily.insights.title')}</h2>
        <Insights weeks={weeks} insights={insights} />
      </div>
    );
  }
  const streak = restored ?? view.streak;
  const offer = restored ? null : (view.streak.repair ?? null);
  return (
    <div className="daily">
      {restored ? <Restored streak={restored} /> : wonBack ? <Restored streak={streak} wonBack /> : <DailyHead days={streak.current} />}
      <WeekRow week={thisWeek(view.days, view.today, view.weekStart)} />
      {offer && (
        <RepairOffer
          offer={offer}
          onRestored={(next) => {
            // greeted here, so a later look today does not greet it again as won back
            takeWonBack(next, view.today);
            setRestored(next);
            today.change({ streak: next });
            onStreak?.(next);
          }}
        />
      )}
      {/* everyone claims the day: a member for Zêr and a gift for the bag, anyone else for the gift */}
      <DailyZer daily={view.daily} onClaimed={(daily) => today.change({ daily })} onLearn={onLearn} />
      <WeekStatsCard view={view} />
      {insights.length > 0 && (
        <button type="button" className="daily-row" onClick={() => setStep('insights')}>
          <span className="daily-row-icon" aria-hidden="true">
            <XpIcon size={18} />
          </span>
          <span className="daily-row-words">
            {insights.length === 1 ? t('daily.insights.availableOne') : t('daily.insights.available', { count: insights.length })}
          </span>
          <ChevronIcon size={18} className="daily-row-go" />
        </button>
      )}
      {view.badge && <LatestBadge badge={view.badge} />}
      <FreezeLine streak={streak} />
      <FireSteps days={streak.current} longest={streak.longest} />
    </div>
  );
}

/** The head fire's square, whatever its stage. */
const HEAD_FIRE = 120;

/** The fire, the streak's number large under it, and one line: "day streak", or how a streak starts. */
function DailyHead({ days }: { days: number }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const number = new Intl.NumberFormat(locale).format(days);
  const level = fireLevel(days);
  return (
    <div className="daily-head">
      <span className="daily-fire" aria-hidden="true">
        <Fire size={fireSizeToFit(level.stage, HEAD_FIRE, HEAD_FIRE)} level={level} framed />
      </span>
      <h2 className="daily-title">
        <span className="daily-number" aria-hidden="true">
          {number}
        </span>
        <span className="daily-unit" aria-hidden="true">
          {days > 0 ? t(days === 1 ? 'daily.view.unitOne' : 'daily.view.unit') : t('learn.today.noStreak')}
        </span>
        <span className="sr-only">{days > 0 ? t('learn.today.streak', { count: number }) : t('learn.today.noStreak')}</span>
      </h2>
    </div>
  );
}

/** This week's four numbers, from the server's counts in the learner's own days. */
function WeekStatsCard({ view }: { view: TodayView }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const stats = weekStats(splitWeeks(view).current);
  const cells: Array<{ key: string; label: string; value: number }> = [
    { key: 'days', label: t('daily.stats.days'), value: stats.days },
    { key: 'lessons', label: t('daily.stats.lessons'), value: stats.lessons },
    { key: 'practice', label: t('daily.stats.practice'), value: stats.practice },
    { key: 'xp', label: t('profile.stat.xp'), value: stats.xp },
  ];
  return (
    <section className="daily-card daily-stats" aria-labelledby="daily-stats-title">
      <div className="daily-card-head">
        <h3 className="daily-card-title" id="daily-stats-title">
          {t('daily.stats.title')}
        </h3>
        <span className="daily-card-note">{t('daily.insights.thisWeek')}</span>
      </div>
      <dl className="daily-stats-grid">
        {cells.map((cell) => (
          <div key={cell.key} className="daily-stat">
            <dt>{cell.label}</dt>
            <dd>{new Intl.NumberFormat(locale).format(cell.value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The badge level earned last, with its picture, leading to every badge. */
function LatestBadge({ badge }: { badge: TodayBadge }): React.JSX.Element | null {
  const t = useT();
  const def = badgeDef(badge.key);
  if (!def) return null;
  const name = badgeNamed(t, badge.key);
  const tierKey = def.tiers.length > 1 ? badgeTierKey(def, badge.tier) : null;
  return (
    <Link to="/app/badges" className="daily-row daily-badge">
      <span className="daily-badge-art" aria-hidden="true">
        <Medal view={{ key: badge.key, tier: badge.tier }} size={44} shine={false} />
      </span>
      <span className="daily-row-words">
        <span className="daily-badge-label">{t('daily.badge.title')}</span>
        <span className="daily-badge-name">
          <span lang="ku">{name.name}</span>
          {tierKey && <> · {badgeTierNamed(t, tierKey).name}</>}
        </span>
        {name.meaning && <span className="daily-badge-meaning">{name.meaning}</span>}
      </span>
      <ChevronIcon size={18} className="daily-row-go" />
    </Link>
  );
}

/** The freezes in one quiet line: those saved, or how near the next one is. */
function FreezeLine({ streak }: { streak: StreakSummary }): React.JSX.Element | null {
  const t = useT();
  const locale = useLocale();
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);
  const freeze = freezeLine(streak);
  if (!freeze) return null;
  return (
    <p className="daily-quiet">
      <IceIcon size={16} />
      {freeze.kind === 'toward'
        ? t('lesson.streak.freeze', { done: number(freeze.done), per: number(freeze.per) })
        : freeze.count === 1
          ? t('lesson.streak.freezeReadyOne')
          : t('lesson.streak.freezeReady', { count: number(freeze.count) })}
    </p>
  );
}

/** How a screen reader hears a stage, by where it stands. */
const PLACE_WORDS: Record<FireLadderPlace, MessageKey> = {
  reached: 'fire.ladder.reached',
  now: 'fire.ladder.current',
  ahead: 'fire.ladder.ahead',
};

/** Each stage's fire fills a square this big, so the row is even. */
const STEP_FIRE = 30;

/**
 * The fire's stages in one row (shared `fireLadder`): each a small fire over its day, reached ones burning, the one now
 * ringed, those ahead still and quieter. Under it the stage's name with the next as a near goal, and the longest streak.
 */
function FireSteps({ days, longest }: { days: number; longest: number }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);
  const level = fireLevel(days);
  const next = nextFireStage(days);
  return (
    <section className="fire-steps" aria-labelledby="fire-steps-title">
      <h3 className="daily-card-title" id="fire-steps-title">
        {t('fire.ladder.title')}
      </h3>
      <ol className="fire-steps-list">
        {fireLadder(days).map((step) => {
          const name = t(FIRE_STAGE_NAME[step.stage]);
          return (
            <li key={step.stage} className={`fire-step is-${step.place}`}>
              <span className="fire-step-art" aria-hidden="true">
                <Fire size={fireSizeToFit(step.stage, STEP_FIRE, STEP_FIRE)} level={step.level} still={step.place === 'ahead'} framed />
              </span>
              <span className="fire-step-day" aria-hidden="true">
                {number(step.day)}
              </span>
              <span className="sr-only">{t(PLACE_WORDS[step.place], { stage: name, count: number(step.day) })}</span>
            </li>
          );
        })}
      </ol>
      <p className="daily-quiet fire-steps-now">
        {level.stage !== 'cold' && <span className="fire-steps-name">{t(FIRE_STAGE_NAME[level.stage])}</span>}
        {level.stage !== 'cold' && next && next.stage !== 'cold' && next.stage !== 'spark' && <span>· {t(FIRE_NEXT[next.stage], { count: number(next.at) })}</span>}
      </p>
      <p className="daily-longest">
        <span>{t('profile.stat.longestStreak')}</span>
        <strong>{number(longest)}</strong>
      </p>
    </section>
  );
}

/** The sheet's shape while the view is asked for: the fire's place, the week and the cards under it. */
function DailySkeleton(): React.JSX.Element {
  return (
    <div className="daily skeleton-late" aria-busy="true">
      <div className="daily-head">
        <Skeleton w={96} h={110} radius="var(--r-pill)" />
        <Skeleton w={72} h={44} />
      </div>
      <Skeleton h={56} radius="var(--r-lg)" />
      <Skeleton h={88} radius="var(--r-lg)" />
      <Skeleton h={104} radius="var(--r-lg)" />
    </div>
  );
}
