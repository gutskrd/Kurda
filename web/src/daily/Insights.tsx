import { useEffect, useId, useRef, useState } from 'react';
import { insightTrend, weekdayName, xpAxis, type Insight, type TodayWeeks } from '@kurda/shared';
import { useLocale, useT } from '../i18n/I18nProvider';

/** One thing the insights say, in words. */
export function useInsightWords(): (insight: Insight) => string {
  const t = useT();
  const locale = useLocale();
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);
  return (insight) => {
    if (insight.kind === 'firstWeek') return t('daily.insights.firstWeek');
    const trend = insightTrend(insight);
    const diff = insight.now - insight.then;
    if (insight.kind === 'xp') {
      if (trend === 'more') return t('daily.insights.xpMore', { count: number(diff) });
      if (trend === 'same') return t('daily.insights.xpSame');
      return t('daily.insights.xpBehind', { now: number(insight.now), then: number(insight.then) });
    }
    if (trend === 'more') return diff === 1 ? t('daily.insights.lessonsMoreOne') : t('daily.insights.lessonsMore', { count: number(diff) });
    if (trend === 'same') return t('daily.insights.lessonsSame');
    return t('daily.insights.lessonsBehind', { now: number(insight.now), then: number(insight.then) });
  };
}

/** The width the chart has, followed as the sheet changes size; jsdom has no layout, so a phone's width there. */
function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver !== 'function') return;
    const watch = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setWidth(Math.round(entry.contentRect.width));
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, [ref]);
  return width;
}

const HEIGHT = 168;
/** Room for the axis numbers at the start, the day initials under the plot, and today's label over it. */
const PAD = { start: 34, end: 14, top: 26, bottom: 28 };

/**
 * The insights: what this week says against last week in a line or two, then XP each day as two lines on one axis, this
 * week in the fire's gold up to today with its value at the end, last week in grey, and a legend for the two. A pointer
 * or the arrow keys pick a day and show both weeks' XP for it; the table under the chart gives every value to a screen
 * reader. Days run in reading order.
 */
export function Insights({ weeks, insights }: { weeks: TodayWeeks; insights: readonly Insight[] }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const words = useInsightWords();
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box);
  const [picked, setPicked] = useState<number | null>(null);
  const titleId = useId();

  const now = weeks.current.slice(0, weeks.at + 1).map((d) => d.xp);
  const then = weeks.last.map((d) => d.xp);
  const axis = xpAxis([...now, ...then]);
  const plotW = Math.max(1, width - PAD.start - PAD.end);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number): number => {
    const along = PAD.start + (plotW * i) / 6;
    return rtl ? width - along : along;
  };
  const y = (v: number): number => PAD.top + plotH * (1 - Math.min(v, axis.top) / axis.top);
  const line = (values: readonly number[]): string => values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line(now)} L${x(now.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const days = weeks.current.map((d) => new Date(`${d.date}T00:00:00Z`).getUTCDay());

  const pick = (clientX: number): void => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    const along = rtl ? rect.right - clientX : clientX - rect.left;
    setPicked(Math.max(0, Math.min(6, Math.round(((along - PAD.start) / plotW) * 6))));
  };
  const step = (e: React.KeyboardEvent): void => {
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (e.key !== forward && e.key !== back) return;
    e.preventDefault();
    setPicked((p) => Math.max(0, Math.min(6, (p ?? weeks.at) + (e.key === forward ? 1 : -1))));
  };

  return (
    <div className="insights">
      <div className="insights-said">
        {insights.map((insight, i) => (
          <p key={insight.kind} className={i === 0 ? 'insights-lead' : 'insights-line'}>
            {words(insight)}
          </p>
        ))}
      </div>
      <figure className="insights-chart" aria-labelledby={titleId}>
        <figcaption className="insights-head">
          <span className="insights-title" id={titleId}>
            {t('daily.insights.chart')}
          </span>
          <span className="insights-legend" aria-hidden="true">
            <span className="insights-key is-now">{t('daily.insights.thisWeek')}</span>
            <span className="insights-key is-then">{t('daily.insights.lastWeek')}</span>
          </span>
        </figcaption>
        <div
          className="insights-plot"
          ref={box}
          tabIndex={0}
          role="img"
          aria-labelledby={titleId}
          onPointerMove={(e) => pick(e.clientX)}
          onPointerDown={(e) => pick(e.clientX)}
          onPointerLeave={() => setPicked(null)}
          onFocus={() => setPicked(weeks.at)}
          onBlur={() => setPicked(null)}
          onKeyDown={step}
        >
          <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`}>
            {[0, axis.mid, axis.top].map((v) => (
              <g key={v}>
                <line className="insights-grid" x1={x(0)} x2={x(6)} y1={y(v)} y2={y(v)} />
                <text className="insights-tick" x={rtl ? width - 4 : 4} y={y(v) + 4} textAnchor="start">
                  {number(v)}
                </text>
              </g>
            ))}
            {picked !== null && <line className="insights-cross" x1={x(picked)} x2={x(picked)} y1={PAD.top - 8} y2={y(0)} />}
            <path className="insights-then" d={line(then)} />
            <path className="insights-area" d={area} />
            <path className="insights-now" d={line(now)} />
            <circle className="insights-end" cx={x(now.length - 1)} cy={y(now[now.length - 1] ?? 0)} r={4} />
            <text className="insights-value" x={x(now.length - 1)} y={y(now[now.length - 1] ?? 0) - 12} textAnchor="middle">
              {number(now[now.length - 1] ?? 0)}
            </text>
            {days.map((weekday, i) => (
              <text key={i} className={`insights-day${i === weeks.at ? ' is-today' : ''}`} x={x(i)} y={HEIGHT - 8} textAnchor="middle">
                {weekdayName(weekday, locale, 'narrow')}
              </text>
            ))}
          </svg>
          {picked !== null && (
            // Beside the picked day, on the side with more room, so the day's own point stays in sight.
            <div className={`insights-tip${picked > 3 ? ' is-before' : ''}`} style={{ insetInlineStart: rtl ? width - x(picked) : x(picked) }}>
              <span className="insights-tip-day">{weekdayName(days[picked]!, locale)}</span>
              <span className="insights-tip-row is-now">
                <strong>{picked <= weeks.at ? t('leagues.result.xp', { xp: number(now[picked] ?? 0) }) : '—'}</strong> {t('daily.insights.thisWeek')}
              </span>
              <span className="insights-tip-row is-then">
                <strong>{t('leagues.result.xp', { xp: number(then[picked] ?? 0) })}</strong> {t('daily.insights.lastWeek')}
              </span>
            </div>
          )}
        </div>
        <table className="sr-only">
          <thead>
            <tr>
              <th scope="col">{t('daily.insights.day')}</th>
              <th scope="col">{t('daily.insights.thisWeek')}</th>
              <th scope="col">{t('daily.insights.lastWeek')}</th>
            </tr>
          </thead>
          <tbody>
            {days.map((weekday, i) => (
              <tr key={i}>
                <th scope="row">{weekdayName(weekday, locale)}</th>
                <td>{i <= weeks.at ? t('leagues.result.xp', { xp: number(now[i] ?? 0) }) : ''}</td>
                <td>{t('leagues.result.xp', { xp: number(then[i] ?? 0) })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figure>
    </div>
  );
}
