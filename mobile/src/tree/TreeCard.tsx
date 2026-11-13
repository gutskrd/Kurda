import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import type { RootNavigation } from '../navigation/rootStack';
import { useDirection } from '../reports/direction';
import { Icon } from '../theme/Icon';
import { PressableScale } from '../theme/MotionParts';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { getTree, type MyTree } from './api';
import { healthName, stageName, treeNamed, treeTitle } from './names';
import { TreeArt, WaterDrop } from './TreeArt';
import { TreePicture } from './TreeScene';

/** The tree's picture on the card. */
const ART = 52;

/**
 * The learner's tree on Learn, in one slim card that leads to it: the tree
 * as it stands, its name and stage, and the one thing worth knowing now —
 * that there is water to pour, that it is thirsty, or that it is doing well.
 * Before a tree is planted it is the invitation to plant one.
 *
 * Read each time Learn comes into view, so the water a lesson just earned is
 * on it. It takes no room until it knows what to say, and on a server that
 * has no trees yet it is never there at all.
 */
export function TreeCard(): React.JSX.Element | null {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const navigation = useNavigation<RootNavigation>();
  const [data, setData] = useState<MyTree | null>(null);

  const load = useCallback(() => {
    let live = true;
    void getTree(client).then((res) => {
      // a read that failed keeps what was shown; one that never worked shows nothing
      if (live && res.ok) setData(res.data);
    });
    return () => {
      live = false;
    };
  }, [client]);
  useFocusEffect(load);

  if (!data) return null;
  const tree = data.tree;
  const open = (): void => navigation.navigate('Tree');
  if (!tree) {
    return (
      <PressableScale onPress={open} accessibilityRole="button" accessibilityLabel={`${t('tree.card.plant')}. ${t('tree.card.plantSub')}`} style={[styles.card, { flexDirection: dir.row, backgroundColor: colors.surface }]} testID="tree-card">
        <View style={[styles.art, { backgroundColor: colors.controlTrack }]}>
          <TreeArt species="beru" stage={1} size={ART} />
        </View>
        <View style={styles.main}>
          <Text style={[styles.title, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
            {t('tree.card.plant')}
          </Text>
          <Text style={[styles.sub, dir.text, { color: colors.textSecondary }]} numberOfLines={2}>
            {t('tree.card.plantSub')}
          </Text>
        </View>
        <Icon name="chevron-right" size={16} color={colors.textSecondary} style={dir.flip ?? undefined} />
      </PressableScale>
    );
  }
  // water to pour comes first: it is what there is to do; then how it fares; then that all is well
  const sub =
    tree.water > 0
      ? tree.health === 'fresh'
        ? t('tree.card.hasWater')
        : t('tree.card.thirstyWater', { health: healthName(t, tree.health) })
      : tree.health === 'fresh'
        ? t('tree.card.well')
        : t('tree.card.thirsty', { health: healthName(t, tree.health) });
  return (
    <PressableScale onPress={open} accessibilityRole="button" accessibilityLabel={`${treeTitle(t, tree)}. ${sub}`} style={[styles.card, { flexDirection: dir.row, backgroundColor: colors.surface }]} testID="tree-card">
      <View style={[styles.art, { backgroundColor: colors.controlTrack }]}>
        <TreePicture species={tree.species} stage={tree.stage} health={tree.health} size={ART} />
      </View>
      <View style={styles.main}>
        <View style={[styles.head, { flexDirection: dir.row }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {treeNamed(t, tree.species).name}
          </Text>
          <Text style={[styles.stage, { color: colors.textSecondary }]} numberOfLines={1}>
            {stageName(t, tree.stage)}
          </Text>
        </View>
        <Text style={[styles.sub, dir.text, { color: colors.textSecondary }]} numberOfLines={2}>
          {sub}
        </Text>
      </View>
      {tree.water > 0 ? (
        <View style={[styles.water, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]} testID="tree-card-water">
          <WaterDrop size={15} />
          <Text style={[styles.waterText, { color: colors.textPrimary }]}>{formatNumber(tree.water, locale)}</Text>
        </View>
      ) : null}
      <Icon name="chevron-right" size={16} color={colors.textSecondary} style={dir.flip ?? undefined} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: spacing.sm + 4, borderRadius: radii.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm + 2 },
  art: { borderRadius: radii.md },
  main: { flex: 1, gap: 1 },
  head: { alignItems: 'baseline', gap: spacing.sm },
  title: { flexShrink: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  stage: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  sub: { fontSize: typography.sizes.sm, lineHeight: 20 },
  water: { alignItems: 'center', gap: 4, borderRadius: radii.pill, paddingVertical: 4, paddingHorizontal: 9 },
  waterText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
});
