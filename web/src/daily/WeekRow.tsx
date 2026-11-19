import { recentDays, streakWeek, weekdayName, type TodayDay, type WeekDay, type WeekDayState } from '@kurda/shared';
import { CheckIcon, IceIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

/** How a screen reader hears each day, as the lesson's end says it. */
export const DAY_WORDS: Record<WeekDayState, MessageKey> = {
  learned: 'lesson.streak.week.learned',
  frozen: 'lesson.streak.week.frozen',
  today: 'lesson.streak.week.today',
  missed: 'lesson.streak.week.missed',
  ahead: 'lesson.streak.week.ahead',
};

/** This week's seven days from the view's fourteen, laid out as the streak's week (shared `streakWeek`). */
export function thisWeek(days: readonly TodayDay[], today: string, startsOn: number): WeekDay[] {
  return streakWeek({ today, recent: recentDays(days), startsOn });
}

/**
 * The week in reading order: each day's initial over a circle, filled with a check once learned, with a snowflake when a
 * freeze kept it, today ringed, the rest empty. `mini` is the home card's: the circles alone, the card saying the rest.
 */
export function WeekRow({ week, mini = false }: { week: readonly WeekDay[]; mini?: boolean }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  if (mini) {
    return (
      <span className="week-row is-mini" aria-hidden="true">
        {week.map((day) => (
          <span key={day.date} className={`week-dot is-${day.state}${day.isToday ? ' is-today' : ''}${day.state === 'frozen' ? ' hue-blue' : ''}`} />
        ))}
      </span>
    );
  }
  return (
    <ol className="week-row" aria-label={t('lesson.streak.week')}>
      {week.map((day) => {
        const name = weekdayName(day.weekday, locale);
        const words = day.isToday && day.state === 'learned' ? t('lesson.streak.week.learnedToday', { day: name }) : t(DAY_WORDS[day.state], { day: name });
        return (
          <li key={day.date} className={`week-day is-${day.state}${day.isToday ? ' is-today' : ''}${day.state === 'frozen' ? ' hue-blue' : ''}`} aria-label={words}>
            <span className="week-day-name" aria-hidden="true">
              {weekdayName(day.weekday, locale, 'narrow')}
            </span>
            <span className="week-dot" aria-hidden="true">
              {day.state === 'learned' ? <CheckIcon size={18} /> : day.state === 'frozen' ? <IceIcon size={18} /> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
