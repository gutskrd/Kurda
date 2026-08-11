import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { stateIcon } from './node';
import type { SkillNode } from './types';

const NODE = 72;

/** A single skill node on the map; ring/fill reflect its state (KUR-040). */
export function SkillNodeView({ node, onPress }: { node: SkillNode; onPress: () => void }) {
  const { colors } = useTheme();
  const s = node.state;
  const ringColor =
    s === 'gold' ? colors.gold : s === 'decayed' ? colors.danger : s === 'locked' ? colors.glassBorder : colors.primary;
  const fill = s === 'locked' ? colors.controlTrack : s === 'unlocked' ? colors.glassFill : colors.primary;
  const cracked = s === 'decayed';

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${node.title}, ${s}`}
        style={[styles.node, { borderColor: ringColor, backgroundColor: fill }, cracked && styles.cracked]}
      >
        <Text style={[styles.icon, { color: s === 'unlocked' ? colors.primary : colors.textOnPrimary }]}>{stateIcon(s) || node.level}</Text>
      </Pressable>
      <View style={styles.meta}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{node.title}</Text>
        {node.state !== 'locked' ? (
          <Text style={[styles.strength, { color: colors.textSecondary }]}>Strength {node.strength}%{cracked ? ' · cracked' : ''}</Text>
        ) : (
          <Text style={[styles.locked, { color: colors.textSecondary }]}>Locked</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: radii.pill,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cracked: { borderStyle: 'dashed' },
  icon: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  meta: { flex: 1, gap: 2 },
  title: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  strength: { fontSize: typography.sizes.sm },
  locked: { fontSize: typography.sizes.sm },
});
