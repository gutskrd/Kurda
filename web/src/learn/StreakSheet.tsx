import { fireLadder, fireLevel, type FireLadderPlace } from '@kurda/shared';
import { Fire } from '../components/Fire';
import { CheckIcon } from '../components/icons';
import { Sheet } from '../components/Sheet';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import type { StreakSummary } from '../lib/types';
import { FIRE_STAGE_NAME } from './fireWords';
import './streak.css';

/** What the server pays a freeze for, when it does not say (older responses). */
const SESSIONS_PER_FREEZE = 5;

/**
 * The streak's whole story, in a sheet opened from the streak in Learn's
 * "Today" — the same as the phone's: the streak in words beside its fire, the
 * three numbers a missed day never takes away (the longest run, the days
 * learned in all, the freezes learning has earned) with what a freeze costs,
 * and the ladder of the fire's stages. `streak` null keeps it closed.
 */
export function StreakSheet({ streak, onClose }: { streak: StreakSummary | null; onClose: () => void }): React.JSX.Element {
  const t = useT();
  return (
    <Sheet open={streak !== null} onClose={onClose} label={t('profile.stat.streak')} className="streak-sheet">
      {streak && <StreakDetail streak={streak} />}
    </Sheet>
  );
}

function StreakDetail({ streak }: { streak: StreakSummary }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);
  const days = streak.current;
  const cells = [
    { label: t('profile.stat.longestStreak'), value: streak.longest },
    { label: t('profile.stat.daysLearned'), value: streak.daysLearned ?? 0 },
    { label: t('profile.stat.freezes'), value: streak.freezes },
  ];
  return (
    <>
      <div className="streak-sheet-head">
        <Fire size={48} level={fireLevel(days)} />
        <h2 className="streak-sheet-title">{days > 0 ? t('learn.today.streak', { count: number(days) }) : t('learn.today.noStreak')}</h2>
      </div>
      <dl className="streak-sheet-stats">
        {cells.map((cell) => (
          <div key={cell.label} className="streak-sheet-stat">
            <dt>{cell.label}</dt>
            <dd>{number(cell.value)}</dd>
          </div>
        ))}
      </dl>
      <p className="streak-sheet-hint">{t('profile.freezeHint', { count: number(streak.sessionsPerFreeze ?? SESSIONS_PER_FREEZE) })}</p>
      <FireLadder days={days} />
    </>
  );
}

/** How a screen reader hears a stage, by where it stands. */
const PLACE_WORDS: Record<FireLadderPlace, MessageKey> = {
  reached: 'fire.ladder.reached',
  now: 'fire.ladder.current',
  ahead: 'fire.ladder.ahead',
};

/** Each stage's fire on the ladder: big enough to show its drawing. */
const RUNG_FIRE = 44;

/**
 * The fire's stages from the spark to the Newroz fire (shared `fireLadder`),
 * each a small fire with its name and the day it comes: the ones reached
 * burning with a check, the one burning now ringed and marked "Now", the
 * ones ahead standing still and dimmed — something to look forward to.
 */
export function FireLadder({ days }: { days: number }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);
  return (
    <section className="fire-ladder" aria-labelledby="fire-ladder-title">
      <h3 className="fire-ladder-title" id="fire-ladder-title">
        {t('fire.ladder.title')}
      </h3>
      <ol className="fire-ladder-list">
        {fireLadder(days).map((step) => {
          const name = t(FIRE_STAGE_NAME[step.stage]);
          return (
            <li key={step.stage} className={`fire-rung is-${step.place}`}>
              <span className="fire-rung-art" aria-hidden="true">
                <Fire size={RUNG_FIRE} level={step.level} still={step.place === 'ahead'} />
              </span>
              <span className="fire-rung-words" aria-hidden="true">
                <span className="fire-rung-name">
                  {name}
                  {step.place === 'reached' && <CheckIcon size={16} className="fire-rung-check" />}
                </span>
                <span className="fire-rung-day">{t('fire.ladder.day', { count: number(step.day) })}</span>
              </span>
              {step.place === 'now' && (
                <span className="fire-rung-now" aria-hidden="true">
                  {t('fire.ladder.now')}
                </span>
              )}
              <span className="sr-only">{t(PLACE_WORDS[step.place], { stage: name, count: number(step.day) })}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
