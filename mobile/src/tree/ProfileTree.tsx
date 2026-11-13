import { StyleSheet, Text, View } from 'react-native';
import { hasTreeArt, type TreeGlimpse } from '@kurda/shared';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { sectionLabel } from '../theme/fonts';
import { Icon } from '../theme/Icon';
import { PressableScale } from '../theme/MotionParts';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { healthName, stageName, treeNamed, treeTitle } from './names';
import { TreeArt } from './TreeArt';
import { TreePicture } from './TreeScene';

/**
 * Somebody's tree on their profile: the tree as it stands today, its kind,
 * how far it has grown, how long it has stood and what it has borne. How it
 * fares is said only when that is not well, and then plainly. On one's own
 * profile it leads to the tree (`onOpen`), and before one is planted invites
 * planting; on anybody else's, nothing is shown until they have a tree.
 *
 * `tree` is undefined on a server that has no trees yet: then there is no
 * such part of a profile.
 */
export function ProfileTree({ tree, onOpen }: { tree: TreeGlimpse | null | undefined; onOpen?: () => void }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  if (tree === undefined) return null;
  const planted = tree !== null && hasTreeArt(tree.species) ? tree : null;
  if (!planted) {
    if (!onOpen || tree !== null) return null;
    return (
      <View style={styles.block} testID="profile-tree">
        <Text style={[sectionLabel, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
          {t('tree.profile.title')}
        </Text>
        <PressableScale onPress={onOpen} accessibilityRole="button" accessibilityLabel={t('tree.card.plant')} style={[styles.card, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]}>
          <TreeArt species="beru" stage={1} size={56} />
          <Text style={[styles.plant, dir.text, { color: colors.textPrimary }]}>{t('tree.card.plant')}</Text>
          <Icon name="chevron-right" size={16} color={colors.textSecondary} style={dir.flip ?? undefined} />
        </PressableScale>
      </View>
    );
  }
  const named = treeNamed(t, planted.species);
  const facts = [stageName(t, planted.stage), t('tree.day', { count: formatNumber(planted.age + 1, locale) }), planted.harvests > 0 ? t('tree.harvests', { count: formatNumber(planted.harvests, locale) }) : null]
    .filter(Boolean)
    .join(' · ');
  const body = (
    <>
      <TreePicture species={planted.species} stage={planted.stage} health={planted.health} size={112} label={treeTitle(t, planted)} />
      <View style={styles.text}>
        <Text style={[styles.name, dir.text, { color: colors.textPrimary }]}>{named.name}</Text>
        {named.meaning ? <Text style={[styles.meaning, dir.text, { color: colors.textSecondary }]}>{named.meaning}</Text> : null}
        <Text style={[styles.facts, dir.text, { color: colors.textSecondary }]}>{facts}</Text>
        {planted.health !== 'fresh' ? (
          <View style={[styles.health, { backgroundColor: colors.surface, alignSelf: dir.rtl ? 'flex-end' : 'flex-start' }]}>
            <Text style={[styles.healthText, { color: colors.textPrimary }]}>{healthName(t, planted.health)}</Text>
          </View>
        ) : null}
      </View>
      {onOpen ? <Icon name="chevron-right" size={16} color={colors.textSecondary} style={dir.flip ?? undefined} /> : null}
    </>
  );
  return (
    <View style={styles.block} testID="profile-tree">
      <Text style={[sectionLabel, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
        {t('tree.profile.title')}
      </Text>
      {onOpen ? (
        <PressableScale onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${t('tree.title')}: ${treeTitle(t, planted)}`} style={[styles.card, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]}>
          {body}
        </PressableScale>
      ) : (
        <View style={[styles.card, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]}>{body}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { alignSelf: 'stretch', gap: spacing.sm },
  card: { alignItems: 'center', gap: spacing.sm + 4, borderRadius: radii.lg, padding: spacing.sm + 2 },
  text: { flex: 1, gap: 2 },
  name: { fontSize: typography.sizes.md + 1, fontWeight: typography.weights.bold },
  meaning: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  facts: { fontSize: typography.sizes.sm, lineHeight: 20 },
  health: { marginTop: 4, borderRadius: radii.pill, paddingVertical: 2, paddingHorizontal: 9 },
  healthText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
  plant: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
});
