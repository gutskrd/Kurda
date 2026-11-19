import { useState } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { insightTrend, weekdayName, xpAxis, type Insight, type TodayWeeks } from '@kurda/shared';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { Pressable } from '../theme/Pressable';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';

/** The two weeks' colours, as on the website: this one in the fire's gold, last one in grey, both 3:1 or more on the sheet. */
const CHART = {
  light: { now: '#B98300', then: '#8F8DA3' },
  dark: { now: '#E8B739', then: '#6F6C84' },
} as const;

/** One thing the insights say, in words. */
export function insightWords(t: ReturnType<typeof useI18n>['t'], n: (v: number) => string, insight: Insight): string {
  if (insight.kind === 'firstWeek') return t('daily.insights.firstWeek');
  const trend = insightTrend(insight);
  const diff = insight.now - insight.then;
  if (insight.kind === 'xp') {
    if (trend === 'more') return t('daily.insights.xpMore', { count: n(diff) });
    if (trend === 'same') return t('daily.insights.xpSame');
    return t('daily.insights.xpBehind', { now: n(insight.now), then: n(insight.then) });
  }
  if (trend === 'more') return diff === 1 ? t('daily.insights.lessonsMoreOne') : t('daily.insights.lessonsMore', { count: n(diff) });
  if (trend === 'same') return t('daily.insights.lessonsSame');
  return t('daily.insights.lessonsBehind', { now: n(insight.now), then: n(insight.then) });
}

const HEIGHT = 168;
/** Room for the axis numbers at the start, the day initials under the plot, and today's value over it. */
const PAD = { start: 34, end: 14, top: 26, bottom: 28 };

/**
 * The insights, as on the website: what this week says against last week, then XP each day as two lines on one axis,
 * this week in gold up to today with its value at the end, last week in grey, and a legend. A tap picks a day, and the
 * line over the chart gives both weeks' XP for it (today's until then). A screen reader hears every day's numbers.
 * Days run in reading order.
 */
export function Insights({ weeks, insights }: { weeks: TodayWeeks; insights: readonly Insight[] }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const n = (v: number) => formatNumber(v, locale);
  const tone = CHART[scheme];
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState(weeks.at);

  const now = weeks.current.slice(0, weeks.at + 1).map((d) => d.xp);
  const then = weeks.last.map((d) => d.xp);
  const axis = xpAxis([...now, ...then]);
  const plotW = Math.max(1, width - PAD.start - PAD.end);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => {
    const along = PAD.start + (plotW * i) / 6;
    return dir.rtl ? width - along : along;
  };
  const y = (v: number) => PAD.top + plotH * (1 - Math.min(v, axis.top) / axis.top);
  const line = (values: readonly number[]) => values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line(now)} L${x(now.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const weekdays = weeks.current.map((d) => new Date(`${d.date}T00:00:00Z`).getUTCDay());
  const dayLine = (i: number) =>
    i <= weeks.at
      ? t('daily.insights.dayLine', { day: weekdayName(weekdays[i]!, locale), now: n(now[i] ?? 0), then: n(then[i] ?? 0) })
      : t('daily.insights.dayLineAhead', { day: weekdayName(weekdays[i]!, locale), then: n(then[i] ?? 0) });
  const pick = (e: GestureResponderEvent) => {
    const along = dir.rtl ? width - e.nativeEvent.locationX : e.nativeEvent.locationX;
    setPicked(Math.max(0, Math.min(6, Math.round(((along - PAD.start) / plotW) * 6))));
  };
  const last = now.length - 1;

  return (
    <View style={styles.box}>
      <View style={styles.said}>
        {insights.map((insight, i) => (
          <Text key={insight.kind} style={[i === 0 ? styles.lead : styles.line, dir.text, { color: i === 0 ? colors.textPrimary : colors.textSecondary }]}>
            {insightWords(t, n, insight)}
          </Text>
        ))}
      </View>
      <View style={styles.chart}>
        <View style={[styles.head, { flexDirection: dir.row }]}>
          <Text style={[styles.title, dir.text, { color: colors.textSecondary }]}>{t('daily.insights.chart')}</Text>
          <View style={[styles.legend, { flexDirection: dir.row }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            {(['now', 'then'] as const).map((week) => (
              <View key={week} style={[styles.key, { flexDirection: dir.row }]}>
                <View style={[styles.keyLine, { backgroundColor: tone[week] }]} />
                <Text style={[styles.keyText, { color: colors.textSecondary }]}>{t(week === 'now' ? 'daily.insights.thisWeek' : 'daily.insights.lastWeek')}</Text>
              </View>
            ))}
          </View>
        </View>
        <Text style={[styles.readout, dir.text, { color: colors.textPrimary }]} importantForAccessibility="no" accessibilityElementsHidden>
          {dayLine(picked)}
        </Text>
        <Pressable
          onPressIn={pick}
          accessible
          accessibilityLabel={`${t('daily.insights.chart')}. ${weekdays.map((_, i) => dayLine(i)).join('. ')}`}
          testID="insights-chart"
          onLayout={(e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width))}
          style={styles.plot}
        >
          {width > 0 ? (
            <>
              <Svg width={width} height={HEIGHT}>
                {[0, axis.mid, axis.top].map((v) => (
                  <Line key={v} x1={x(0)} x2={x(6)} y1={y(v)} y2={y(v)} stroke={colors.separator} strokeWidth={1} />
                ))}
                <Line x1={x(picked)} x2={x(picked)} y1={PAD.top - 8} y2={y(0)} stroke={colors.lockedMark} strokeWidth={1} />
                <Path d={line(then)} stroke={tone.then} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <Path d={area} fill={tone.now} fillOpacity={0.1} />
                <Path d={line(now)} stroke={tone.now} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <Circle cx={x(last)} cy={y(now[last] ?? 0)} r={4} fill={tone.now} stroke={colors.background} strokeWidth={2} />
              </Svg>
              {[0, axis.mid, axis.top].map((v) => (
                <Text key={v} style={[styles.tick, { top: y(v) - 8, [dir.rtl ? 'right' : 'left']: 0, color: colors.textSecondary }]}>
                  {n(v)}
                </Text>
              ))}
              <Text style={[styles.value, { top: y(now[last] ?? 0) - 26, left: x(last) - 30, color: colors.textPrimary }]}>{n(now[last] ?? 0)}</Text>
              {weekdays.map((weekday, i) => (
                <Text
                  key={i}
                  style={[styles.day, { left: x(i) - 15, color: i === weeks.at ? colors.textPrimary : colors.textSecondary }, i === weeks.at && styles.today]}
                >
                  {weekdayName(weekday, locale, 'narrow')}
                </Text>
              ))}
            </>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.md + 2 },
  said: { gap: 6 },
  lead: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, lineHeight: 23 },
  line: { fontSize: typography.sizes.sm, lineHeight: 21 },
  chart: { gap: spacing.sm },
  head: { flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.xs },
  title: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  legend: { gap: spacing.sm + 4 },
  key: { alignItems: 'center', gap: 6 },
  keyLine: { width: 14, height: 2, borderRadius: radii.xs },
  keyText: { fontSize: typography.sizes.xs },
  readout: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, fontVariant: ['tabular-nums'] },
  plot: { height: HEIGHT, borderRadius: radii.md },
  tick: { position: 'absolute', width: 30, fontSize: 11, fontVariant: ['tabular-nums'] },
  value: { position: 'absolute', width: 60, textAlign: 'center', fontSize: 12, fontWeight: typography.weights.bold },
  day: { position: 'absolute', top: HEIGHT - 20, width: 30, textAlign: 'center', fontSize: 11 },
  today: { fontWeight: typography.weights.bold },
});
