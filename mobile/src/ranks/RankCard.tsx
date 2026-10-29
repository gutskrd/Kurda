import { StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '../theme/MotionParts';
import { SHIELD_GAMES, progressToNext, type RankCard } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { display } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { GAME_NAME_KEY } from '../play/labels';
import { PlacementEmblem, RankEmblem } from './art';
import { cardHeadline, nextStepText, rankLabel, rankName, tierMeaning } from './format';
import { Meter } from './Meter';
import { PLACING_TINT, rankTint } from './tint';

/**
 * One game's rank (contract 4 §U, Play tab): the emblem, the tier and its
 * division in words, the points, and the bar to the next division — or, for
 * the first five rated games, "Placing 3/5" and the five segments filling.
 * Beside it the small facts a rank can carry, each in words as well as a
 * mark: the "?" while the points are still settling, the shield's games after
 * a new tier, and Resting after four weeks without a rated game (which others
 * see in place of the rank; you still see yours).
 */
export function RankCardView({ card, onPress, compact = false }: { card: RankCard; onPress?: () => void; compact?: boolean }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const head = cardHeadline(card);
  const game = t(GAME_NAME_KEY[card.game]);
  const emblemSize = compact ? 56 : 76;

  const title = head.kind === 'placing' ? t('ranks.placing', { played: head.played, of: head.of }) : rankName(t, head.tier, head.division);
  const meaning = head.kind === 'ranked' ? tierMeaning(t, head.tier) : null;
  const next = nextStepText(t, card);
  const fraction = head.kind === 'placing' ? head.played / Math.max(1, head.of) : (card.progress ?? progressToNext(card.points)).fraction;
  const tint = head.kind === 'placing' ? PLACING_TINT[scheme] : rankTint(head.tier, scheme);
  const sub =
    head.kind === 'placing'
      ? t('ranks.placingHint', { count: Math.max(0, head.of - head.played) })
      : [meaning, t('ranks.pointsCount', { count: formatNumber(card.points, locale) })].filter(Boolean).join(' · ');

  const a11y = [
    game,
    head.kind === 'placing' ? title : rankLabel(t, head.tier, head.division),
    head.kind === 'ranked' ? t('ranks.pointsCount', { count: card.points }) : null,
    card.provisional ? t('ranks.provisional') : null,
    card.shieldGames > 0 ? t('ranks.shieldA11y', { count: card.shieldGames }) : null,
    card.resting ? t('ranks.restingOwn') : null,
    next,
  ]
    .filter(Boolean)
    .join('. ');

  const body = (
    <View style={styles.row}>
      {head.kind === 'placing' ? (
        <PlacementEmblem done={head.played} size={emblemSize} label={title} />
      ) : (
        <RankEmblem tier={head.tier} division={head.division} size={emblemSize} label={rankLabel(t, head.tier, head.division)} />
      )}
      <View style={styles.main}>
        <Text style={[styles.game, { color: colors.textSecondary }]} numberOfLines={1}>
          {game}
        </Text>
        <View style={styles.titleRow}>
          <Text style={[compact ? styles.titleCompact : styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {title}
          </Text>
          {card.provisional && head.kind === 'ranked' ? (
            <View style={[styles.question, { backgroundColor: colors.controlTrack }]}>
              <Text style={[styles.questionText, { color: colors.textSecondary }]}>?</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={head.kind === 'placing' ? 2 : 1}>
          {sub}
        </Text>
        <Meter fraction={fraction} tint={tint} height={6} style={styles.meter} />
        {next || card.shieldGames > 0 || card.resting ? (
          <View style={styles.facts}>
            {next ? (
              <Text style={[styles.fact, { color: colors.textSecondary }]} numberOfLines={1}>
                {next}
              </Text>
            ) : null}
            {card.shieldGames > 0 ? <ShieldPips count={card.shieldGames} /> : null}
            {card.resting ? (
              <Text style={[styles.fact, { color: colors.textSecondary }]} numberOfLines={1}>
                {t('ranks.resting')}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
      {onPress ? <Icon name="chevron-right" size={16} color={colors.textSecondary} /> : null}
    </View>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={a11y}>
        {body}
      </View>
    );
  }
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={[styles.press]}
    >
      {body}
    </PressableScale>
  );
}

/** The shield's games left, as pips — three, filled for each game it still covers — and the word. */
export function ShieldPips({ count }: { count: number }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.shield} accessible accessibilityLabel={t('ranks.shieldA11y', { count })}>
      {Array.from({ length: SHIELD_GAMES }, (_, i) => (
        <Icon key={i} name={i < count ? 'shield-fill' : 'shield'} size={13} color={i < count ? colors.textPrimary : colors.textSecondary} />
      ))}
      <Text style={[styles.fact, { color: colors.textSecondary }]}>{t('ranks.shield')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  press: { minHeight: MIN_TOUCH_TARGET },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  main: { flex: 1, gap: 2 },
  game: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 0.6, textTransform: 'uppercase' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  title: { ...display(typography.sizes.xl) },
  titleCompact: { ...display(typography.sizes.lg) },
  question: { width: 20, height: 20, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  questionText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
  sub: { fontSize: typography.sizes.sm },
  meter: { marginTop: spacing.xs },
  facts: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.md, rowGap: 2, marginTop: 2 },
  fact: { fontSize: typography.sizes.xs },
  shield: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});
