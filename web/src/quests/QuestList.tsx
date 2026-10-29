import { useCountUp } from '../lib/motion';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { Chest } from './Chest';
import { justDone, type QuestKind, type QuestRow } from '@kurda/shared';
import './quests.css';

/** What each kind of quest asks, with the server's target as its number. */
const ASKS: Record<QuestKind, MessageKey> = {
  streak: 'quests.kind.streak',
  lessons: 'quests.kind.lessons',
  accuracy: 'quests.kind.accuracy',
  xp: 'quests.kind.xp',
  listening: 'quests.kind.listening',
  perfect: 'quests.kind.perfect',
};

/** One quest's words: "Finish 2 lessons". */
export function useQuestWords(): (kind: QuestKind, target: number) => string {
  const t = useT();
  const locale = useLocale();
  return (kind, target) => t(ASKS[kind], { target: new Intl.NumberFormat(locale).format(target) });
}

/** How long one row's bar takes to fill, and how far apart the rows start. */
const FILL_MS = 600;
const ROW_STAGGER_MS = 220;

/**
 * Today's quests, one row each: what it asks, a thick bar of how far it has
 * got with "x / y" on it, and its chest at the bar's end.
 *
 * `moving` (the end of a lesson): each bar fills from where the quest stood
 * before the session to where it is now, a row after the one above, the
 * number counting with it; a quest finished just now lifts and glows once its
 * bar is full. Elsewhere the bars simply stand where they are. A chest to open
 * is said in words as well as drawn; one opened stands open.
 */
export function QuestList({ rows, moving = false, startMs = 0 }: { rows: QuestRow[]; moving?: boolean; startMs?: number }): React.JSX.Element {
  return (
    <ul className="quest-list">
      {rows.map((row, i) => (
        <QuestItem key={row.id} row={row} moving={moving} delayMs={startMs + i * ROW_STAGGER_MS} />
      ))}
    </ul>
  );
}

function QuestItem({ row, moving, delayMs }: { row: QuestRow; moving: boolean; delayMs: number }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const words = useQuestWords();
  const from = moving ? row.from : row.to;
  const shown = useCountUp(row.to, { from, delayMs });
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);
  const done = row.to >= row.target;
  const fresh = moving && justDone(row);
  const share = (n: number): number => (row.target > 0 ? Math.min(1, n / row.target) : 1);
  const style = { '--from': share(from), '--to': share(row.to), '--fill-delay': `${delayMs}ms`, '--fill-ms': `${FILL_MS}ms` } as React.CSSProperties;
  return (
    <li className={`quest-row${done ? ' is-done' : ''}${fresh ? ' is-fresh' : ''}${row.claimable ? ' is-claimable' : ''}`} style={style}>
      <p className="quest-ask">{words(row.kind, row.target)}</p>
      <div className="quest-track">
        <span
          className="quest-bar"
          role="progressbar"
          aria-label={words(row.kind, row.target)}
          aria-valuemin={0}
          aria-valuemax={row.target}
          aria-valuenow={row.to}
          aria-valuetext={t('quests.barText', { progress: number(row.to), target: number(row.target) })}
        >
          {/* the count twice: light over the track, dark over the gold, each clipped to its own part */}
          <span className="quest-count" aria-hidden="true" dir="ltr">
            {number(shown)} / {number(row.target)}
          </span>
          <span className={`quest-fill${moving && from !== row.to ? ' is-moving' : ''}`}>
            <span className="quest-count is-on" aria-hidden="true" dir="ltr">
              {number(shown)} / {number(row.target)}
            </span>
          </span>
        </span>
        <span className="quest-chest">
          <Chest tier={row.chest} open={row.claimed} size={52} />
          {(row.claimable || row.claimed) && <span className="sr-only">{row.claimable ? t('quests.chestReady') : t('quests.chestOpened')}</span>}
        </span>
      </div>
    </li>
  );
}
