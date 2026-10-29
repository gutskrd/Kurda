import { useState } from 'react';
import { Button } from '../components/Button';
import { ChevronIcon } from '../components/icons';
import { Sheet } from '../components/Sheet';
import { Skeleton } from '../components/Skeleton';
import { useLocale, useT } from '../i18n/I18nProvider';
import { Chest } from './Chest';
import { ChestScreen } from './ChestScreen';
import { QuestList } from './QuestList';
import { earlierRows, questRows, withOpened } from './rows';
import { useQuestDay } from './useQuestDay';
import './quests.css';

/**
 * Today's quests on Learn, in one slim card under today's row: a chest, how
 * many of the three are done, and a small bar for each. A gold dot on the
 * chest — and words for a screen reader — says a chest is waiting.
 *
 * It opens a sheet with the three in full, how many quests this month has
 * seen done, the quests of the last week whose chests are still shut
 * ("Earlier", so a chest is never lost at midnight), and "Open chest" while
 * one waits; the chests open over the whole screen (ChestScreen.tsx), today's
 * first, and it comes back to the sheet. While the day is read
 * the card keeps its shape, so the path under it does not jump when it lands;
 * a day that could not be read says so, with a way to try again.
 */
export function QuestsCard(): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { day, error, loading, reload } = useQuestDay();
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const [view, setView] = useState<'card' | 'sheet' | 'chest'>('card');
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);

  if (!day) {
    return (
      <section className={`quests-card is-quiet${loading ? ' skeleton-late' : ''}`} aria-labelledby="quests-card-title" aria-busy={loading}>
        <span className="quests-card-chest">
          <Chest tier="common" size={40} />
        </span>
        <span className="quests-card-text">
          <span className="quests-card-title" id="quests-card-title">
            {t('quests.title')}
          </span>
          {loading ? <Skeleton line w="60%" /> : <span className="quests-card-sub">{error ?? t('quests.loadFailed')}</span>}
        </span>
        {!loading && (
          <Button variant="secondary" size="sm" onClick={reload}>
            {t('common.retry')}
          </Button>
        )}
      </section>
    );
  }

  const rows = withOpened(questRows(day), opened);
  const earlier = withOpened(earlierRows(day), opened);
  if (rows.length === 0 && earlier.length === 0) {
    return (
      <section className="quests-card is-quiet" aria-labelledby="quests-card-title">
        <span className="quests-card-chest">
          <Chest tier="common" size={40} />
        </span>
        <span className="quests-card-text">
          <span className="quests-card-title" id="quests-card-title">
            {t('quests.title')}
          </span>
          <span className="quests-card-sub">{t('quests.none')}</span>
        </span>
      </section>
    );
  }

  // today's chests first, then those still waiting from earlier days, newest first
  const chests = [...rows, ...earlier].filter((r) => r.claimable);
  const done = rows.filter((r) => r.to >= r.target).length;
  const allOpen = rows.length > 0 && rows.every((r) => r.claimed);
  return (
    <>
      <button type="button" className={`quests-card${chests.length > 0 ? ' has-chest' : ''}`} aria-haspopup="dialog" onClick={() => setView('sheet')}>
        <span className="quests-card-chest">
          <Chest tier={(chests[0] ?? rows[rows.length - 1] ?? earlier[0]!).chest} open={allOpen} size={40} />
          {chests.length > 0 && <span className="quests-card-dot" aria-hidden="true" />}
        </span>
        <span className="quests-card-text">
          <span className="quests-card-head">
            <span className="quests-card-title">{t('quests.title')}</span>
            <span className="quests-card-sub">
              {chests.length > 1
                ? t('quests.card.chests', { count: number(chests.length) })
                : chests.length === 1
                  ? t('quests.card.chest')
                  : t('quests.card.done', { done: number(done), total: number(rows.length) })}
            </span>
          </span>
          <span className="quests-card-bars" aria-hidden="true">
            {rows.map((r) => (
              <span key={r.id} className={`quests-mini${r.to >= r.target ? ' is-done' : ''}`}>
                <span style={{ '--to': r.target > 0 ? Math.min(1, r.to / r.target) : 1 } as React.CSSProperties} />
              </span>
            ))}
          </span>
          {chests.length > 0 && <span className="sr-only">{t('quests.card.done', { done: number(done), total: number(rows.length) })}</span>}
        </span>
        <ChevronIcon size={18} className="quests-card-go" />
      </button>

      <Sheet open={view === 'sheet'} onClose={() => setView('card')} label={t('quests.title')} className="quests-sheet">
        <h2 className="quests-sheet-title">{t('quests.title')}</h2>
        {rows.length > 0 ? <QuestList rows={rows} /> : <p className="quests-month">{t('quests.none')}</p>}
        <p className="quests-month">{t('quests.month', { count: number(day.monthDone) })}</p>
        {earlier.length > 0 && (
          <section className="quests-earlier" aria-labelledby="quests-earlier-title">
            <h3 className="quests-earlier-title" id="quests-earlier-title">
              {t('quests.earlier')}
            </h3>
            <p className="quests-earlier-note">{t('quests.earlierNote')}</p>
            <QuestList rows={earlier} />
          </section>
        )}
        {chests.length > 0 && (
          <Button size="lg" block onClick={() => setView('chest')}>
            {t('quests.openChest')}
          </Button>
        )}
      </Sheet>

      {view === 'chest' && (
        <ChestScreen
          chests={chests}
          onOpened={(id) => setOpened((s) => new Set(s).add(id))}
          onClose={() => setView('sheet')}
          doneLabel={t('common.done')}
        />
      )}
    </>
  );
}
