import { StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '../theme/MotionParts';
import { useDirection } from '../reports/direction';
import { badgeDef, type ProfileLeague, type ShowcaseBadge } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useTheme } from '../theme/ThemeProvider';
import { sectionLabel } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { BadgeMedal, LeagueEmblem } from '../ranks/art';
import { badgeLabel, badgeName } from '../badges/format';
import { NewChip } from '../badges/NewChip';
import { knownTier, leagueLabel, leagueName } from '../leagues/format';
import { Icon } from '../theme/Icon';

/**
 * What a profile shows of the climb: the three badges chosen for it and the league, every name translated and nothing
 * invented for somebody not in a league (no "bronze" for an empty one). Games are played for fun, so they have no
 * place here. `own` is your own profile: the empty showcase then offers to choose, and each part opens its page.
 */
export function ProgressShowcase({
  league,
  badges,
  fresh,
  own,
  onBadges,
  onLeague,
}: {
  league: ProfileLeague | null | undefined;
  badges: ShowcaseBadge[];
  /** Badges earned since the app opened (`useFreshBadges`), which wear a "New" chip. */
  fresh?: ReadonlySet<string>;
  own: boolean;
  onBadges?: () => void;
  onLeague?: () => void;
}): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  // Right to left, everything starts on the right: the badges in the chosen order and the row offering to choose them.
  const dir = useDirection();
  const leagueTier = knownTier(league?.tier);
  if (badges.length === 0 && !leagueTier && !own) return null;

  return (
    <View style={styles.wrap}>
      {badges.length > 0 || own ? (
        <View style={styles.section}>
          <Text style={[sectionLabel, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
            {t('profile.showcase')}
          </Text>
          {badges.length > 0 ? (
            <PressableScale
              onPress={onBadges}
              disabled={!onBadges}
              accessibilityRole={onBadges ? 'button' : undefined}
              accessibilityLabel={t('profile.showcaseA11y', { badges: badges.map((b) => showcaseLabel(t, b)).join(', ') })}
              style={[styles.badges, { flexDirection: dir.row }]}
            >
              {badges.map((b, i) => (
                <View key={b.key} style={styles.badge}>
                  <View style={styles.medal}>
                    <BadgeMedal badgeKey={b.key} tier={b.tier} tierCount={badgeDef(b.key)?.tiers.length ?? 4} size={68} label={showcaseLabel(t, b)} shine="loop" />
                    {fresh?.has(b.key) ? <NewChip delayMs={120 + i * 80} /> : null}
                  </View>
                  <Text style={[styles.badgeName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {badgeName(t, b.key)}
                  </Text>
                </View>
              ))}
            </PressableScale>
          ) : (
            <PressableScale
              onPress={onBadges}
              accessibilityRole="button"
              style={[styles.empty, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]}
            >
              <Icon name="medal" size={18} color={colors.textSecondary} />
              <Text style={[styles.emptyText, dir.text, { color: colors.textPrimary }]}>{t('profile.showcaseChoose')}</Text>
              <View style={dir.flip}>
                <Icon name="chevron-right" size={14} color={colors.textSecondary} />
              </View>
            </PressableScale>
          )}
        </View>
      ) : null}

      {leagueTier ? (
        <View style={styles.section}>
          <Text style={[sectionLabel, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
            {t('profile.progress')}
          </Text>
          <View style={{ flexDirection: dir.row }}>
            <Chip
              onPress={onLeague}
              label={leagueLabel(t, leagueTier)}
              art={<LeagueEmblem tier={leagueTier} size={44} label={leagueLabel(t, leagueTier)} />}
              kicker={t('profile.league')}
              title={leagueName(t, leagueTier)}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function showcaseLabel(t: Parameters<typeof badgeName>[0], b: ShowcaseBadge): string {
  return badgeLabel(t, { key: b.key, tier: b.tier, tierKey: b.tierKey, tierCount: badgeDef(b.key)?.tiers.length ?? 4, hidden: false });
}

function Chip({
  art,
  kicker,
  title,
  label,
  onPress,
}: {
  art: React.ReactNode;
  kicker: string;
  title: string;
  label: string;
  onPress?: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
      style={[styles.chip, dir.row === 'row-reverse' ? styles.chipMirrored : null, { backgroundColor: colors.controlTrack }]}
    >
      {art}
      <View style={styles.chipText}>
        <Text style={[styles.kicker, dir.text, { color: colors.textSecondary }]} numberOfLines={1}>
          {kicker}
        </Text>
        <Text style={[styles.title, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', gap: spacing.lg, marginTop: spacing.md },
  section: { gap: spacing.sm },
  badges: { flexDirection: 'row', justifyContent: 'space-around' },
  badge: { alignItems: 'center', gap: 4, width: 96 },
  medal: { width: 68, height: 68 },
  badgeName: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  empty: { alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: MIN_TOUCH_TARGET },
  emptyText: { flex: 1, fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, paddingVertical: spacing.sm, paddingLeft: spacing.sm, paddingRight: spacing.md, minWidth: 150 },
  // The emblem on the right, with the narrow side of the padding beside it.
  chipMirrored: { flexDirection: 'row-reverse', paddingLeft: spacing.md, paddingRight: spacing.sm },
  chipText: { gap: 1, maxWidth: 140 },
  kicker: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, letterSpacing: 0.4, textTransform: 'uppercase' },
  title: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
});
