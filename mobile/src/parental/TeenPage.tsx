import { useEffect, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { PARENTAL_BEDTIMES, PARENTAL_DAILY_LIMITS, PARENTAL_SWITCHES, type Bedtime } from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import type { Translate } from '../api/errors';
import { sayNotSaved } from '../api/optimistic';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import type { Locale } from '../i18n/translations';
import type { RootNavigation } from '../navigation/rootStack';
import { Avatar } from '../profile/Avatar';
import { useDirection } from '../reports/direction';
import { SettingsChoice, SettingsNote, SettingsNotRead, SettingsRow, SettingsSection, SettingsSwitch } from '../settings/list';
import { timing } from '../theme/animate';
import { BottomSheet } from '../theme/BottomSheet';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { Loading } from '../theme/Loading';
import { duration } from '../theme/motion';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { nameOf, stopSupervising, type TeenDay, type TeenDetail } from './api';
import { bedtimeLabel, lessonsLabel, limitLabel, minutesLabel, weekdayOf, weekSummary } from './format';
import { forgetParentalOverview } from './overview';
import { SWITCH_ICON } from './ParentalPage';
import { loosens, useTeen } from './teen';

/**
 * One teen, as a parent sees them: their week of learning, the two times (a daily limit and a bedtime, each chosen
 * on a page of its own), and the six switches, each saying what it turns off. Every change shows at once and is put
 * back if the server refuses it. Never their messages, letters, posts or friends, and the page says so.
 */
export function TeenPage({ teenId }: { teenId: string }): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { client, user } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const { detail, controls, failed, reload, change } = useTeen(teenId);
  const [stopping, setStopping] = useState<'ask' | 'busy' | null>(null);

  if (!detail || !controls) return failed ? <SettingsNotRead failed={failed} retry={reload} /> : <Loading style={styles.loading} />;
  const name = nameOf(detail.teen);

  const stop = (): void => {
    setStopping('busy');
    haptic('tap');
    void stopSupervising(client, teenId).then((res) => {
      // Already ended (the teen disconnected first) is as good as done.
      if (res.ok || res.error.status === 404) {
        setStopping(null);
        forgetParentalOverview();
        navigation.goBack();
        return;
      }
      setStopping('ask');
      haptic('error');
      sayNotSaved(res.error, t);
    });
  };

  // Any other parent connected to this teen, who sees and can change the same.
  const others = detail.parents.filter((p) => p.userId !== user?.id);
  const firstOnly = firstOnlyLine(detail, t);
  return (
    <>
      <View style={styles.head}>
        <Avatar name={name} photoUrl={detail.teen.avatarUrl} size={72} />
        <Text style={[styles.name, styles.center, { color: colors.textPrimary }]} accessibilityRole="header">
          {name}
        </Text>
        <Text style={[styles.handle, styles.center, { color: colors.textSecondary }]}>@{detail.teen.username}</Text>
      </View>

      <SettingsSection title={t('parental.week')} first>
        <View style={styles.week}>
          <WeekBars week={detail.week} limit={controls.dailyLimitMinutes} locale={locale} />
          <Text style={[styles.summary, dir.text, { color: colors.textPrimary }]} testID="teen-week-summary">
            {weekSummary(detail.week, t)}
          </Text>
          <View style={[styles.streak, { flexDirection: dir.row }]}>
            <Icon name="flame" size={18} color={colors.textSecondary} />
            <Text style={[styles.streakText, dir.text, { color: colors.textSecondary }]}>
              {detail.streak === 0
                ? t('parental.streakNone')
                : detail.streak === 1
                  ? t('parental.streakOne')
                  : t('parental.streak', { count: formatNumber(detail.streak, locale) })}
            </Text>
          </View>
        </View>
      </SettingsSection>

      <SettingsSection title={t('parental.time')} footer={firstOnly}>
        <SettingsRow
          icon="timer"
          title={t('parental.dailyLimit')}
          value={limitLabel(controls.dailyLimitMinutes, t)}
          onPress={() => navigation.navigate('SettingsPage', { page: 'parentalLimit', teenId })}
          testID="teen-limit"
        />
        <SettingsRow
          icon="moon"
          title={t('parental.bedtime')}
          value={bedtimeLabel(controls.bedtime, t, locale)}
          onPress={() => navigation.navigate('SettingsPage', { page: 'parentalBedtime', teenId })}
          testID="teen-bedtime"
        />
        {/* Where their day and bedtime are counted, and what the clock says there now. */}
        {detail.timeZone ? <SettingsRow icon="globe" title={t('parental.timeZone')} value={zoneLabel(detail.timeZone, locale)} testID="teen-zone" /> : null}
      </SettingsSection>

      <SettingsSection title={t('parental.safety')} footer={firstOnly}>
        {PARENTAL_SWITCHES.map((s) => (
          <SettingsSwitch
            key={s}
            icon={SWITCH_ICON[s]}
            title={t(`parental.switch.${s}`)}
            subtitle={t(`parental.switch.${s}.hint`)}
            value={controls[s]}
            // Turning a part back on is the first parent's to do; turning it off is anyone's.
            disabled={firstOnly !== undefined && !controls[s]}
            onValueChange={(on) => change(s, on)}
          />
        ))}
      </SettingsSection>
      <SettingsNote>{t('parental.privacy.parent')}</SettingsNote>

      {others.length > 0 ? (
        <SettingsSection>
          {others.map((p) => (
            <SettingsRow
              key={p.userId}
              icon="parental"
              title={t('parental.alsoConnected', { name: nameOf(p) })}
              subtitle={p.first ? t('parental.firstParent') : undefined}
            />
          ))}
        </SettingsSection>
      ) : null}

      <SettingsSection>
        <SettingsRow icon="sign-out" title={t('parental.stop')} destructive opens={false} onPress={() => setStopping('ask')} testID="teen-stop" />
      </SettingsSection>

      <BottomSheet
        visible={stopping !== null}
        onClose={() => setStopping(null)}
        dismissible={stopping !== 'busy'}
        title={t('parental.stop.title', { name })}
        testID="teen-stop-sheet"
      >
        <Text style={[styles.sheetBody, dir.text, { color: colors.textSecondary }]}>{t('parental.willBeTold', { name })}</Text>
        <View style={styles.sheetActions}>
          <ClayButton label={t('parental.stop')} tone="danger" size="large" busy={stopping === 'busy'} onPress={stop} testID="teen-stop-confirm" />
          <ClayButton label={t('common.cancel')} variant="outline" disabled={stopping === 'busy'} onPress={() => setStopping(null)} />
        </View>
      </BottomSheet>
    </>
  );
}

/** The tallest bar's height; a day with nothing still shows as a sliver, so the week keeps its shape. */
const BAR_HEIGHT = 88;
const BAR_FLOOR = 4;
/** The day's letter under each bar, and the room above it: where the bars' baseline sits. */
const DAY_LINE = 20;
const DAY_GAP = spacing.xs + 2;
/** Each bar grows in a beat after the one before it. */
const BAR_STAGGER_MS = 35;

/**
 * A week as seven slim bars of minutes, oldest first, today's in the ink and the others quieter, each read out with its
 * day and numbers. With a daily limit set, a faint line marks it.
 */
export function WeekBars({ week, limit, locale }: { week: readonly TeenDay[]; limit: number | null; locale: Locale }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const reduce = useReducedMotion();
  // A little headroom over the tallest bar or the limit, so the limit's line reads as a mark, not the chart's edge.
  const top = Math.max(15, limit ?? 0, ...week.map((d) => d.minutes)) * 1.15;
  const grow = useRef(week.map(() => new Animated.Value(reduce ? 1 : 0))).current;
  useEffect(() => {
    if (reduce) return;
    const runs = grow.map((v, i) => timing(v, 1, duration.progress, { delay: i * BAR_STAGGER_MS }));
    Animated.parallel(runs).start();
    return () => runs.forEach((r) => r.stop());
  }, [grow, reduce]);

  return (
    <View style={styles.bars}>
      <View style={[styles.barRow, { flexDirection: dir.row }]}>
        {limit != null ? (
          <View pointerEvents="none" style={[styles.limit, { bottom: DAY_LINE + DAY_GAP + (limit / top) * BAR_HEIGHT, backgroundColor: colors.textSecondary }]} />
        ) : null}
        {week.map((d, i) => {
          const today = i === week.length - 1;
          const height = Math.max(BAR_FLOOR, Math.round((d.minutes / top) * BAR_HEIGHT));
          return (
            <View
              key={d.day}
              style={styles.column}
              accessible
              accessibilityLabel={t('parental.bar', {
                day: weekdayOf(d.day, locale, 'long'),
                minutes: minutesLabel(d.minutes, t),
                lessons: lessonsLabel(d.lessons, t),
              })}
            >
              <View style={styles.barBox}>
                <Animated.View
                  style={[
                    styles.bar,
                    { height, backgroundColor: today ? colors.primary : colors.textSecondary, opacity: today ? 1 : 0.38 },
                    { transform: [{ scaleY: grow[i] ?? 1 }], transformOrigin: 'bottom center' },
                  ]}
                />
              </View>
              <Text style={[styles.day, today ? [styles.today, { color: colors.textPrimary }] : { color: colors.textSecondary }]} numberOfLines={1}>
                {weekdayOf(d.day, locale, 'narrow')}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** The daily limits a parent can choose, with No limit first, and what counts toward one. */
export function LimitPage({ teenId }: { teenId: string }): React.JSX.Element {
  const { t } = useI18n();
  const { detail, controls, failed, reload, change } = useTeen(teenId);
  if (!detail || !controls) return failed ? <SettingsNotRead failed={failed} retry={reload} /> : <Loading style={styles.loading} />;
  const options = ['none', ...PARENTAL_DAILY_LIMITS.map(String)];
  const of = (o: string): number | null => (o === 'none' ? null : Number(o));
  const firstOnly = firstOnlyLine(detail, t);
  return (
    <>
      <SettingsSection first footer={t('parental.limit.help')}>
        <SettingsChoice
          label={t('parental.dailyLimit')}
          options={options}
          value={controls.dailyLimitMinutes == null ? 'none' : String(controls.dailyLimitMinutes)}
          labelOf={(o) => limitLabel(of(o), t)}
          // A longer day, or none, is the first parent's to give; shown, not hidden, so the choice is understood.
          isDisabled={(o) => firstOnly !== undefined && loosens('dailyLimitMinutes', detail.controls.dailyLimitMinutes, of(o))}
          onChange={(o) => change('dailyLimitMinutes', of(o))}
        />
      </SettingsSection>
      {firstOnly ? <SettingsNote>{firstOnly}</SettingsNote> : null}
    </>
  );
}

const bedtimeKey = (b: Bedtime | null): string => (b ? `${b.from}-${b.to}` : 'none');

/** The bedtimes a parent can choose, with None first, each in the reader's own clock. */
export function BedtimePage({ teenId }: { teenId: string }): React.JSX.Element {
  const { t, locale } = useI18n();
  const { detail, controls, failed, reload, change } = useTeen(teenId);
  if (!detail || !controls) return failed ? <SettingsNotRead failed={failed} retry={reload} /> : <Loading style={styles.loading} />;
  const options = ['none', ...PARENTAL_BEDTIMES.map(bedtimeKey)];
  const of = (key: string): Bedtime | null => PARENTAL_BEDTIMES.find((b) => bedtimeKey(b) === key) ?? null;
  const firstOnly = firstOnlyLine(detail, t);
  return (
    <>
      <SettingsSection first footer={t('parental.bedtime.help')}>
        <SettingsChoice
          label={t('parental.bedtime')}
          options={options}
          value={bedtimeKey(controls.bedtime)}
          labelOf={(o) => bedtimeLabel(of(o), t, locale)}
          isDisabled={(o) => firstOnly !== undefined && loosens('bedtime', detail.controls.bedtime, of(o))}
          onChange={(o) => change('bedtime', of(o))}
        />
      </SettingsSection>
      {firstOnly ? <SettingsNote>{firstOnly}</SettingsNote> : null}
    </>
  );
}

/**
 * For a parent who is not the first: the one quiet line saying who can loosen what is set, under each list where
 * something is held back. Undefined for the first parent, who may do anything.
 */
function firstOnlyLine(detail: TeenDetail, t: Translate): string | undefined {
  if (detail.canLoosen !== false) return undefined;
  const first = detail.parents.find((p) => p.first);
  return first ? t('parental.firstOnly', { name: nameOf(first) }) : t('parental.firstOnlyAnyone');
}

/** A time zone as a place and the time there now: "Berlin · 21:40". */
function zoneLabel(zone: string, locale: Locale): string {
  const place = (zone.split('/').pop() ?? zone).replace(/_/g, ' ');
  try {
    return `${place} · ${new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: zone }).format(new Date())}`;
  } catch {
    return place;
  }
}

const styles = StyleSheet.create({
  loading: { paddingTop: spacing.xl },
  head: { alignItems: 'center', gap: spacing.xs, paddingTop: spacing.md, paddingHorizontal: layout.gutter },
  name: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, marginTop: spacing.sm },
  handle: { fontSize: typography.sizes.text },
  center: { textAlign: 'center' },
  week: { padding: spacing.md, gap: spacing.sm + 4 },
  summary: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  streak: { alignItems: 'center', gap: spacing.xs + 2 },
  streakText: { fontSize: typography.sizes.text },
  bars: { paddingTop: spacing.xs },
  barRow: { alignItems: 'flex-end', justifyContent: 'space-between' },
  column: { flex: 1, alignItems: 'center', gap: DAY_GAP },
  barBox: { height: BAR_HEIGHT, justifyContent: 'flex-end' },
  bar: { width: 14, borderRadius: radii.pill },
  // Across the bars only, not the day letters under them.
  limit: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth * 2, opacity: 0.35 },
  day: { fontSize: typography.sizes.text, lineHeight: DAY_LINE },
  today: { fontWeight: typography.weights.semibold },
  sheetBody: { fontSize: typography.sizes.text, lineHeight: 22 },
  sheetActions: { gap: spacing.sm, marginTop: spacing.sm },
});
