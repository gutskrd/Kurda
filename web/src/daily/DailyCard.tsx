import { useState } from 'react';
import { fireLevel, fireSizeToFit } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Fire } from '../components/Fire';
import { CheckIcon, ChevronIcon, CoinIcon } from '../components/icons';
import { Skeleton } from '../components/Skeleton';
import { useLocale, useT } from '../i18n/I18nProvider';
import { DailySheet } from './DailySheet';
import { dailyAction, useToday } from './today';
import { WeekRow, thisWeek } from './WeekRow';
import './daily.css';

/** The small fire's square on the card. */
const CARD_FIRE = 44;

/**
 * The daily view's card at the top of Home: the small fire with the streak, this week as seven dots, and today's Zêr in
 * one mark (to claim, after a lesson, or taken). One press opens the whole view (`DailySheet`). Nothing for a visitor,
 * and nothing in place of a view that failed to load, since the wall is the page.
 */
export function DailyCard(): React.JSX.Element | null {
  const { status } = useAuth();
  const t = useT();
  const locale = useLocale();
  const today = useToday(status === 'signedIn');
  const [open, setOpen] = useState(false);
  if (status !== 'signedIn') return null;
  const view = today.view;
  if (!view) return today.loading ? <Skeleton h={76} radius="var(--r-lg)" className="daily-home-skeleton" /> : null;
  const days = view.streak.current;
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);
  const action = dailyAction(view.daily);
  const level = fireLevel(days);
  const streakWords = days > 0 ? t('learn.today.streak', { count: number(days) }) : t('learn.today.noStreak');
  const zerWords =
    action === 'claim'
      ? t('daily.card.claim', { amount: number(view.daily.reward) })
      : action === 'learnFirst'
        ? t('daily.card.learn', { amount: number(view.daily.reward) })
        : t('daily.card.taken');
  return (
    <>
      <button type="button" className="daily-home" aria-haspopup="dialog" aria-label={`${streakWords}. ${zerWords}`} onClick={() => setOpen(true)}>
        <span className="daily-home-fire" aria-hidden="true">
          <Fire size={fireSizeToFit(level.stage, CARD_FIRE, CARD_FIRE)} level={level} framed />
        </span>
        <span className="daily-home-words" aria-hidden="true">
          <span className="daily-home-number">{number(days)}</span>
          <span className="daily-home-unit">{days === 1 ? t('daily.view.unitOne') : t('daily.view.unit')}</span>
        </span>
        <WeekRow week={thisWeek(view.days, view.today, view.weekStart)} mini />
        <span className={`daily-home-zer is-${action}`} aria-hidden="true" title={zerWords}>
          <CoinIcon size={18} />
          {action === 'claimed' ? <CheckIcon size={14} /> : `+${number(view.daily.reward)}`}
        </span>
        <ChevronIcon size={18} className="daily-home-go" />
      </button>
      <DailySheet open={open} onClose={() => setOpen(false)} today={today} />
    </>
  );
}
