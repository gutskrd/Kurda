import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SHOWCASE_SIZE, type BadgeView, type BadgesResponse } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { ClayButton, GlassCard, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { display, sectionLabel } from '../theme/fonts';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { Note, Sheet } from '../stories/ui';
import { BadgeMedal } from '../ranks/art';
import { getBadges, setShowcase } from '../ranks/api';
import { Meter } from '../ranks/Meter';
import { badgeTint } from '../ranks/tint';
import {
  FAMILY_KEY,
  UNIT_KEY,
  badgeLabel,
  badgeMeaning,
  badgeName,
  badgeTextKey,
  byFamily,
  nextFraction,
  progressText,
  rarityText,
  tierKeyAt,
  tierLabel,
  tierName,
} from './format';

/**
 * Badges (contract 4 §B, §U): every badge by family, the tier each has
 * reached, how far it is to the next ("7 / 30 days"), the secrets as "???"
 * until found (with a hint once one is), how rare each tier is once enough
 * people learn here, and the three chosen for the profile.
 *
 * Nothing here is a list of failures: a badge not earned yet is drawn quietly
 * with what it takes, and the page opens on what has been earned.
 */
export function BadgesScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const [data, setData] = useState<BadgesResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [open, setOpen] = useState<BadgeView | null>(null);
  const [picking, setPicking] = useState(false);

  const load = useCallback(() => {
    void getBadges(client).then((res) => {
      if (res.ok) {
        setData(res.data);
        setError(null);
      } else setError(res.error);
    });
  }, [client]);
  useFocusEffect(useCallback(() => load(), [load]));

  const columns = width >= 600 ? 5 : width >= 360 ? 3 : 2;
  const tile = Math.floor((Math.min(width, 720) - spacing.lg * 2 - spacing.sm * (columns - 1)) / columns);

  return (
    <GradientBackground>
      <ScreenHeader title={t('badges.title')} onBack={onExit} />
      <AsyncBoundary loading={!data && !error} error={!data ? error : null} onRetry={load} skeleton={<BadgesSkeleton columns={columns} tile={tile} />}>
        {() =>
          data ? (
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <Showcase data={data} onPick={() => setPicking(true)} onOpen={setOpen} />

              {byFamily(data.badges).map((group) => (
                <View key={group.family} style={styles.family}>
                  <View style={styles.familyHead}>
                    <Text style={[sectionLabel, { color: colors.textSecondary }]} accessibilityRole="header">
                      {t(FAMILY_KEY[group.family])}
                    </Text>
                    <Text style={[styles.familyCount, { color: colors.textSecondary }]}>
                      {t('badges.familyCount', { earned: group.badges.filter((b) => b.tier > 0).length, total: group.badges.length })}
                    </Text>
                  </View>
                  {group.family === 'events' ? (
                    <MonthlyChallenge month={data.monthlyChallenge} />
                  ) : null}
                  {group.family === 'secret' ? (
                    <Text style={[styles.secretLine, { color: colors.textSecondary }]}>
                      {t('badges.secretsFound', { found: data.secretsFound, total: data.secretsTotal })}
                    </Text>
                  ) : null}
                  <View style={styles.grid}>
                    {group.badges.map((b) => (
                      <BadgeTile key={b.key} badge={b} width={tile} onPress={() => setOpen(b)} />
                    ))}
                  </View>
                </View>
              ))}

              {data.legacy.length > 0 ? (
                <View style={styles.family}>
                  <Text style={[sectionLabel, { color: colors.textSecondary }]} accessibilityRole="header">
                    {t('badges.legacy')}
                  </Text>
                  {data.legacy.map((l) => (
                    <View key={l.key} style={[styles.legacy, { backgroundColor: colors.controlTrack }]}>
                      <Icon name="trophy" size={20} color={colors.gold} />
                      <Text style={[styles.legacyText, { color: colors.textPrimary }]}>{t('badges.legacy.tournamentWin')}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </ScrollView>
          ) : null
        }
      </AsyncBoundary>
      {open && data ? (
        <BadgeSheet
          badge={open}
          showcase={data.showcase}
          onClose={() => setOpen(null)}
          onShowcase={(keys) => setData({ ...data, showcase: keys })}
        />
      ) : null}
      {picking && data ? (
        <ShowcasePicker data={data} onClose={() => setPicking(false)} onSaved={(keys) => setData({ ...data, showcase: keys })} />
      ) : null}
    </GradientBackground>
  );
}

/** The three on the profile, in their order, and the way to choose them. */
function Showcase({ data, onPick, onOpen }: { data: BadgesResponse; onPick: () => void; onOpen: (b: BadgeView) => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const earned = data.badges.filter((b) => b.tier > 0).length;
  const chosen = data.showcase.map((k) => data.badges.find((b) => b.key === k)).filter((b): b is BadgeView => !!b);
  return (
    <GlassCard>
      <View style={styles.showHead}>
        <View style={styles.flex}>
          <Text style={[sectionLabel, { color: colors.textSecondary }]} accessibilityRole="header">
            {t('badges.showcase')}
          </Text>
          <Text style={[styles.summary, { color: colors.textPrimary }]}>{t('badges.earnedCount', { count: earned, total: data.badges.length })}</Text>
        </View>
        <ClayButton label={t('badges.showcaseChoose')} variant="outline" onPress={onPick} disabled={earned === 0} />
      </View>
      <View style={styles.slots}>
        {Array.from({ length: SHOWCASE_SIZE }, (_, i) => {
          const b = chosen[i];
          if (!b) {
            return (
              <Pressable
                key={i}
                onPress={onPick}
                disabled={earned === 0}
                accessibilityRole="button"
                accessibilityLabel={t('badges.showcaseEmpty')}
                style={({ pressed }) => [styles.slot, { opacity: pressed ? 0.7 : 1 }]}
              >
                <View style={[styles.emptySlot, { backgroundColor: colors.controlTrack }]}>
                  <Icon name="plus" size={20} color={colors.textSecondary} />
                </View>
              </Pressable>
            );
          }
          return (
            <Pressable key={b.key} onPress={() => onOpen(b)} accessibilityRole="button" accessibilityLabel={badgeLabel(t, b)} style={styles.slot}>
              <BadgeMedal badgeKey={b.key} tier={b.tier} tierCount={b.tierCount} size={84} label={badgeLabel(t, b)} shine="loop" />
              <Text style={[styles.slotName, { color: colors.textPrimary }]} numberOfLines={1}>
                {badgeName(t, b.key)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {earned === 0 ? <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('badges.showcaseNone')}</Text> : null}
    </GlassCard>
  );
}

function MonthlyChallenge({ month }: { month: BadgesResponse['monthlyChallenge'] }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t } = useI18n();
  const done = month.days >= month.goal;
  return (
    <View style={[styles.month, { backgroundColor: colors.controlTrack }]}>
      <View style={styles.monthHead}>
        <Icon name="calendar" size={16} color={colors.textSecondary} />
        <Text style={[styles.monthText, { color: colors.textPrimary }]}>{t('badges.monthly', { days: Math.min(month.days, month.goal), goal: month.goal })}</Text>
        {done ? <Icon name="seal-check" size={16} color={colors.success} /> : null}
      </View>
      <Meter fraction={month.goal > 0 ? month.days / month.goal : 0} tint={badgeTint(3, scheme)} height={6} />
    </View>
  );
}

/**
 * The badges while they load: the showcase card with its three places, then
 * each family's heading over a grid of the same number of columns and the
 * same tile width the real grid will use, so a phone and a tablet each get
 * their own grey.
 */
function BadgesSkeleton({ columns, tile }: { columns: number; tile: number }): React.JSX.Element {
  const { t } = useI18n();
  const medal = Math.min(76, tile - spacing.sm * 2);
  const { height } = useWindowDimensions();
  // a family is its heading and two rows of tiles: as many as reach the foot of the screen
  const families = Math.max(2, Math.ceil((height - 260) / (2 * (medal + 64) + 40)));
  return (
    <View style={styles.content} accessibilityLabel={t('common.loading')}>
      <GlassCard>
        <View style={styles.showHead}>
          <View style={styles.flex}>
            <SkeletonText size={typography.sizes.xs} width={96} />
            <SkeletonText size={typography.sizes.lg} lineHeight={SUMMARY_LINE} width="52%" />
          </View>
        </View>
        <View style={styles.slots}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.slot}>
              <Skeleton width={72} height={72} radius={radii.pill} style={styles.slotSkeleton} />
              <SkeletonText size={typography.sizes.xs} width={56} align="center" />
            </View>
          ))}
        </View>
      </GlassCard>
      {Array.from({ length: families }, (_, f) => (
        <View key={f} style={styles.family}>
          <View style={styles.familyHead}>
            <SkeletonText size={typography.sizes.xs} width={88} />
            <SkeletonText size={typography.sizes.xs} width={40} />
          </View>
          <View style={styles.grid}>
            {Array.from({ length: columns * 2 }, (_, i) => (
              <View key={i} style={[styles.tile, { width: tile }]}>
                <Skeleton width={medal} height={medal} radius={radii.pill} />
                <SkeletonText size={typography.sizes.sm} width="70%" align="center" style={styles.tileNameSkeleton} />
                <SkeletonText size={typography.sizes.xs} width="44%" align="center" style={styles.tileTierSkeleton} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

/** display(22) sets 1.12 */
const SUMMARY_LINE = Math.round(typography.sizes.lg * typography.displayLineHeight);

function BadgeTile({ badge, width, onPress }: { badge: BadgeView; width: number; onPress: () => void }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t } = useI18n();
  const label = badgeLabel(t, badge);
  const name = badge.hidden ? t('badges.secretName') : badgeName(t, badge.key);
  const tier = badge.hidden ? null : tierName(t, badge.tierKey, badge.tierCount);
  const progress = badge.hidden ? null : progressText(t, badge);
  const size = Math.min(76, width - spacing.sm * 2);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[label, progress].filter(Boolean).join('. ')}
      style={({ pressed }) => [styles.tile, { width, opacity: pressed ? 0.7 : 1 }]}
    >
      <BadgeMedal badgeKey={badge.key} tier={badge.tier} tierCount={badge.tierCount} hidden={badge.hidden} size={size} label={label} />
      <Text style={[styles.tileName, { color: badge.tier > 0 ? colors.textPrimary : colors.textSecondary }]} numberOfLines={2}>
        {name}
      </Text>
      {tier ? <Text style={[styles.tileTier, { color: colors.textSecondary }]}>{tier}</Text> : null}
      {!badge.hidden && badge.next !== null ? (
        <Meter fraction={nextFraction(badge)} tint={badgeTint(badge.tier + 1, scheme)} height={4} style={styles.tileMeter} />
      ) : null}
    </Pressable>
  );
}

/** One badge up close: what it is, what it takes, each tier with when it was earned, how rare. */
function BadgeSheet({
  badge,
  showcase,
  onClose,
  onShowcase,
}: {
  badge: BadgeView;
  showcase: string[];
  onClose: () => void;
  onShowcase: (keys: string[]) => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = showcase.includes(badge.key);
  const full = !shown && showcase.length >= SHOWCASE_SIZE;
  const name = badge.hidden ? t('badges.secretName') : badgeName(t, badge.key);
  const meaning = badge.hidden ? null : badgeMeaning(t, badge.key);

  const toggle = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const keys = shown ? showcase.filter((k) => k !== badge.key) : [...showcase, badge.key];
    const res = await setShowcase(client, keys);
    setBusy(false);
    if (res.ok) onShowcase(res.data.showcase);
    else setError(describeError(res.error, t));
  };

  return (
    <Sheet title={name} onClose={onClose}>
      <View style={styles.sheetHero}>
        <BadgeMedal
          badgeKey={badge.key}
          tier={badge.tier}
          tierCount={badge.tierCount}
          hidden={badge.hidden}
          size={152}
          label={badgeLabel(t, badge)}
          shine="once"
        />
        {meaning ? <Text style={[styles.sheetMeaning, { color: colors.textSecondary }]}>{meaning}</Text> : null}
        {badge.hidden ? (
          <Text style={[styles.sheetHow, { color: colors.textPrimary }]}>
            {badge.hintKey ? t('badges.hint', { hint: t(badgeTextKey(badge.key, 'hint')) }) : t('badges.secretBody')}
          </Text>
        ) : (
          <Text style={[styles.sheetHow, { color: colors.textPrimary }]}>{t(badgeTextKey(badge.key, 'how'))}</Text>
        )}
      </View>

      {!badge.hidden && badge.next !== null ? (
        <View style={styles.sheetProgress}>
          <Text style={[styles.sheetProgressText, { color: colors.textPrimary }]}>{progressText(t, badge)}</Text>
          <Meter fraction={nextFraction(badge)} tint={badgeTint(badge.tier + 1, scheme)} height={8} label={progressText(t, badge) ?? undefined} />
        </View>
      ) : null}
      {!badge.hidden && badge.next === null && badge.tier > 0 ? (
        <Note icon="seal-check">{badge.tierCount > 1 ? t('badges.complete') : t('badges.earnedOn', { date: dateOf(badge.earnedAt, locale) })}</Note>
      ) : null}

      {!badge.hidden && badge.tierCount > 1 ? (
        <View style={styles.ladder}>
          {badge.thresholds.map((threshold, i) => {
            const n = i + 1;
            const reached = badge.tier >= n;
            const key = tierKeyAt(n);
            const when = badge.tierEarnedAt[i];
            const rare = badge.rarity?.[i];
            return (
              <View key={n} style={[styles.rung, { backgroundColor: colors.controlTrack }]}>
                <BadgeMedal badgeKey={badge.key} tier={reached ? n : 0} tierCount={badge.tierCount} size={40} label={`${badgeName(t, badge.key)} · ${tierLabel(t, key)}`} />
                <View style={styles.flex}>
                  <Text style={[styles.rungName, { color: colors.textPrimary }]}>{tierLabel(t, key)}</Text>
                  <Text style={[styles.rungFact, { color: colors.textSecondary }]}>
                    {[
                      threshold > 0 ? `${threshold} ${t(UNIT_KEY[badge.unit])}` : null,
                      reached && when ? t('badges.earnedOn', { date: dateOf(when, locale) }) : null,
                      rare !== undefined ? rarityText(t, rare) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <Icon name={reached ? 'seal-check' : 'lock'} size={18} color={reached ? colors.success : colors.textSecondary} />
              </View>
            );
          })}
        </View>
      ) : null}

      {!badge.hidden && badge.tierCount <= 1 && badge.rarity?.[0] !== undefined ? (
        <Text style={[styles.hint, { color: colors.textSecondary }]}>{rarityText(t, badge.rarity[0]!)}</Text>
      ) : null}

      {badge.tier > 0 && !badge.hidden ? (
        <View style={styles.showcaseAction}>
          <ClayButton
            label={shown ? t('badges.showcaseRemove') : t('badges.showcaseAdd')}
            icon={shown ? 'check' : 'plus'}
            tone={shown ? 'neutral' : 'primary'}
            variant={shown ? 'outline' : 'solid'}
            busy={busy}
            disabled={full}
            onPress={() => void toggle()}
          />
          {full ? <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('badges.showcaseFull')}</Text> : null}
          {error ? <Note tone="danger" icon="alert">{error}</Note> : null}
        </View>
      ) : null}
    </Sheet>
  );
}

/** Choosing the profile's three, in order: tap to add, tap again to take out. */
function ShowcasePicker({ data, onClose, onSaved }: { data: BadgesResponse; onClose: () => void; onSaved: (keys: string[]) => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [keys, setKeys] = useState<string[]>(data.showcase);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const earned = data.badges.filter((b) => b.tier > 0 && !b.hidden);

  const toggle = (key: string): void =>
    setKeys((k) => (k.includes(key) ? k.filter((x) => x !== key) : k.length >= SHOWCASE_SIZE ? k : [...k, key]));

  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const res = await setShowcase(client, keys);
    setBusy(false);
    if (res.ok) {
      onSaved(res.data.showcase);
      onClose();
    } else setError(describeError(res.error, t));
  };

  return (
    <Sheet
      title={t('badges.showcaseTitle')}
      onClose={onClose}
      footer={
        <>
          {error ? <Note tone="danger" icon="alert">{error}</Note> : null}
          <ClayButton label={t('badges.showcaseSave')} tone="primary" size="large" busy={busy} onPress={() => void save()} />
        </>
      }
    >
      <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('badges.showcaseHint', { count: SHOWCASE_SIZE })}</Text>
      <View style={styles.pickGrid}>
        {earned.map((b) => {
          const at = keys.indexOf(b.key);
          const on = at !== -1;
          return (
            <Pressable
              key={b.key}
              onPress={() => toggle(b.key)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: !on && keys.length >= SHOWCASE_SIZE }}
              accessibilityLabel={badgeLabel(t, b)}
              style={({ pressed }) => [
                styles.pick,
                { backgroundColor: colors.controlTrack, borderColor: on ? colors.textPrimary : 'transparent', opacity: pressed ? 0.8 : !on && keys.length >= SHOWCASE_SIZE ? 0.5 : 1 },
              ]}
            >
              <BadgeMedal badgeKey={b.key} tier={b.tier} tierCount={b.tierCount} size={56} label={badgeLabel(t, b)} />
              <Text style={[styles.pickName, { color: colors.textPrimary }]} numberOfLines={1}>
                {badgeName(t, b.key)}
              </Text>
              {on ? (
                <View style={[styles.order, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.orderText, { color: colors.textOnPrimary }]}>{at + 1}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

function dateOf(iso: string | null | undefined, locale: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.gutter, paddingVertical: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg, width: '100%', maxWidth: 720, alignSelf: 'center' },
  flex: { flex: 1, gap: 2 },
  showHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  summary: { ...display(typography.sizes.lg) },
  slots: { flexDirection: 'row', justifyContent: 'space-around', marginTop: spacing.md },
  slot: { alignItems: 'center', gap: spacing.xs, width: 96, minHeight: MIN_TOUCH_TARGET },
  emptySlot: { width: 72, height: 72, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', margin: 6 },
  slotName: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  hint: { fontSize: typography.sizes.sm, lineHeight: 19, marginTop: spacing.sm },
  family: { gap: spacing.sm },
  familyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  familyCount: { fontSize: typography.sizes.xs, fontVariant: ['tabular-nums'] },
  secretLine: { fontSize: typography.sizes.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { alignItems: 'center', gap: 2, paddingVertical: spacing.sm },
  tileName: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, textAlign: 'center', marginTop: spacing.xs },
  tileTier: { fontSize: typography.sizes.xs },
  tileMeter: { width: '62%', alignSelf: 'center', marginTop: 4 },
  tileNameSkeleton: { alignSelf: 'stretch', marginTop: spacing.xs },
  tileTierSkeleton: { alignSelf: 'stretch' },
  slotSkeleton: { margin: 6 },
  month: { borderRadius: radii.md, padding: spacing.md, gap: spacing.sm },
  monthHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  monthText: { flex: 1, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  legacy: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radii.md, padding: spacing.md },
  legacyText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  sheetHero: { alignItems: 'center', gap: spacing.sm },
  sheetMeaning: { fontSize: typography.sizes.md },
  sheetHow: { fontSize: typography.sizes.md, textAlign: 'center', lineHeight: 22 },
  sheetProgress: { gap: spacing.sm },
  sheetProgressText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, fontVariant: ['tabular-nums'] },
  ladder: { gap: spacing.sm },
  rung: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radii.md, padding: spacing.sm },
  rungName: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  rungFact: { fontSize: typography.sizes.xs },
  showcaseAction: { gap: spacing.xs },
  pickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pick: { width: '31%', alignItems: 'center', gap: spacing.xs, borderRadius: radii.md, borderWidth: 1.5, padding: spacing.sm, minHeight: MIN_TOUCH_TARGET },
  pickName: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  order: { position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  orderText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
});
