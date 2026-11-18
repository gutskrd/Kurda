import { Fragment, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { useDirection } from '../reports/direction';
import { sectionLabel, statValue } from '../theme/fonts';
import { Icon } from '../theme/Icon';
import { pressedDim } from '../theme/motion';
import { Pressable } from '../theme/Pressable';
import { SkeletonText } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import type { LevelInfo } from './types';

/**
 * The parts of a profile laid out as on the website (web/src/profile/FullProfile.tsx): the level and how far to the
 * next, a row of figures split by hairlines, and a section only its owner sees.
 */

/** One figure and what it counts; a button where there is a page or a sheet behind it. */
export interface ProfileFact {
  key: string;
  label: string;
  /** Null while it loads. */
  value: string | null;
  /** Drawn before the figure, such as the streak's fire. */
  art?: ReactNode;
  /** How a screen reader says it, where the figure alone would not do ("12 days"). */
  spoken?: string;
  onPress?: () => void;
}

/** Up to four figures in a row, the figure over its label, with a hairline between each. */
export function ProfileFacts({ facts, testID }: { facts: readonly ProfileFact[]; testID?: string }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <View style={[styles.facts, { flexDirection: dir.row }]} testID={testID}>
      {facts.map((fact, i) => (
        <Fragment key={fact.key}>
          {i > 0 ? <View style={[styles.divider, { backgroundColor: colors.separator }]} /> : null}
          <Fact fact={fact} />
        </Fragment>
      ))}
    </View>
  );
}

function Fact({ fact }: { fact: ProfileFact }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const body = (
    <>
      {fact.value === null ? (
        <SkeletonText size={typography.sizes.lg} width={28} align="center" />
      ) : (
        <View style={[styles.figureRow, { flexDirection: dir.row }]}>
          {fact.art}
          <Text style={[styles.figure, { color: colors.textPrimary }]} numberOfLines={1}>
            {fact.value}
          </Text>
        </View>
      )}
      <Text style={[styles.label, { color: colors.textSecondary }, fact.onPress ? styles.labelLink : null]} numberOfLines={1}>
        {fact.label}
      </Text>
    </>
  );
  // "23 Friends", or the label first where the figure needs words of its own ("Streak, 6 days").
  const spoken = fact.spoken ? `${fact.label}, ${fact.spoken}` : `${fact.value ?? '—'} ${fact.label}`;
  if (!fact.onPress) {
    return (
      <View style={styles.fact} accessible accessibilityLabel={spoken}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={fact.onPress}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      style={({ pressed }) => [styles.fact, pressed && { opacity: pressedDim }]}
    >
      {body}
    </Pressable>
  );
}

/** The level, a bar towards the next one, and how much XP is left to it. */
export function LevelBar({ level }: { level: Pick<LevelInfo, 'level' | 'xp' | 'nextLevelXp' | 'progress'> }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const share = Math.min(1, Math.max(0, level.progress));
  const next = t('profile.xpToLevel', { xp: formatNumber(Math.max(0, level.nextLevelXp - level.xp), locale), level: formatNumber(level.level + 1, locale) });
  return (
    <View
      style={styles.level}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${t('profile.levelN', { level: formatNumber(level.level, locale) })}, ${next}`}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(share * 100) }}
    >
      <View style={[styles.levelHead, { flexDirection: dir.row }]}>
        <Text style={[styles.levelName, { color: colors.goldText }]}>{t('profile.levelN', { level: formatNumber(level.level, locale) })}</Text>
        <Text style={[styles.levelNext, { color: colors.textSecondary }]} numberOfLines={1}>
          {next}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.controlTrack, flexDirection: dir.row }]}>
        <View style={[styles.fill, { width: `${share * 100}%`, backgroundColor: colors.gold }]} />
      </View>
    </View>
  );
}

/** A section of your own profile nobody else is shown, saying so beside its title. */
export function OnlyYou({ title, children }: { title: string; children: ReactNode }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  return (
    <View style={styles.yours}>
      <View style={[styles.yoursHead, { flexDirection: dir.row }]}>
        <Text style={[sectionLabel, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
          {title}
        </Text>
        <View style={[styles.onlyYou, { flexDirection: dir.row }]}>
          <Icon name="lock" size={12} tone="secondary" />
          <Text style={[styles.onlyYouText, { color: colors.textSecondary }]}>{t('profile.onlyYou')}</Text>
        </View>
      </View>
      <View style={[styles.yoursCard, { backgroundColor: colors.controlTrack }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  facts: { alignSelf: 'stretch', alignItems: 'stretch' },
  divider: { width: StyleSheet.hairlineWidth, marginVertical: spacing.xs },
  fact: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: spacing.xs },
  figureRow: { alignItems: 'center', gap: 4 },
  figure: { ...statValue },
  label: { fontSize: typography.sizes.sm },
  // A figure with a page behind it is underlined, as a link on the website.
  labelLink: { textDecorationLine: 'underline' },
  level: { alignSelf: 'stretch', gap: spacing.xs },
  levelHead: { justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm },
  levelName: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  levelNext: { flexShrink: 1, fontSize: typography.sizes.sm },
  track: { height: 6, borderRadius: radii.pill, overflow: 'hidden' },
  fill: { height: 6, borderRadius: radii.pill },
  yours: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.md },
  yoursHead: { justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  onlyYou: { alignItems: 'center', gap: 4 },
  onlyYouText: { fontSize: typography.sizes.xs },
  yoursCard: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.md },
});
