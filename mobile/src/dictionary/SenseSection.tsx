import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import type { Sense } from './types';

/**
 * One sense, collapsible. Long entries (20+ senses, KUR-045) start collapsed
 * so the page stays scannable; tap the header to expand examples.
 */
export function SenseSection({ sense, startCollapsed }: { sense: Sense; startCollapsed: boolean }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(!startCollapsed);
  const hasExamples = sense.examples.length > 0;

  return (
    <View style={[styles.sense, { borderBottomColor: colors.glassBorder }]}>
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.header} disabled={!hasExamples}>
        <Text style={[styles.pos, { color: colors.primary }]}>{sense.pos}</Text>
        <Text style={[styles.def, { color: colors.textPrimary }]}>
          {sense.position}. {sense.definitionEn}
        </Text>
        {hasExamples ? <Text style={[styles.chevron, { color: colors.textSecondary }]}>{open ? '▾' : '▸'}</Text> : null}
      </Pressable>
      {sense.definitionKu ? <Text style={[styles.defKu, { color: colors.textSecondary }]}>{sense.definitionKu}</Text> : null}
      {open && hasExamples ? (
        <View style={styles.examples}>
          {sense.examples.map((ex, i) => (
            <View key={i} style={[styles.example, { backgroundColor: colors.glassFill }]}>
              <Text style={[styles.exKu, { color: colors.textPrimary }]}>{ex.textKu}</Text>
              {ex.textEn ? <Text style={[styles.exEn, { color: colors.textSecondary }]}>{ex.textEn}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sense: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pos: {
    fontSize: typography.sizes.xs,
    fontStyle: 'italic',
    minWidth: 64,
  },
  def: { flex: 1, fontSize: typography.sizes.md },
  chevron: { fontSize: typography.sizes.md },
  defKu: { fontSize: typography.sizes.sm, marginLeft: 64 + spacing.sm },
  examples: { marginLeft: 64 + spacing.sm, gap: spacing.xs, marginTop: spacing.xs },
  example: { borderRadius: radii.sm, padding: spacing.sm },
  exKu: { fontSize: typography.sizes.md },
  exEn: { fontSize: typography.sizes.sm },
});
