import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../theme/tokens';
import type { Sense } from './types';

/**
 * One sense, collapsible. Long entries (20+ senses, KUR-045) start collapsed
 * so the page stays scannable; tap the header to expand examples.
 */
export function SenseSection({ sense, startCollapsed }: { sense: Sense; startCollapsed: boolean }) {
  const [open, setOpen] = useState(!startCollapsed);
  const hasExamples = sense.examples.length > 0;

  return (
    <View style={styles.sense}>
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.header} disabled={!hasExamples}>
        <Text style={styles.pos}>{sense.pos}</Text>
        <Text style={styles.def}>
          {sense.position}. {sense.definitionEn}
        </Text>
        {hasExamples ? <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text> : null}
      </Pressable>
      {sense.definitionKu ? <Text style={styles.defKu}>{sense.definitionKu}</Text> : null}
      {open && hasExamples ? (
        <View style={styles.examples}>
          {sense.examples.map((ex, i) => (
            <View key={i} style={styles.example}>
              <Text style={styles.exKu}>{ex.textKu}</Text>
              {ex.textEn ? <Text style={styles.exEn}>{ex.textEn}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sense: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pos: {
    fontSize: typography.sizes.xs,
    color: colors.primary,
    fontStyle: 'italic',
    minWidth: 64,
  },
  def: { flex: 1, fontSize: typography.sizes.md, color: colors.textPrimary },
  chevron: { fontSize: typography.sizes.md, color: colors.textSecondary },
  defKu: { fontSize: typography.sizes.sm, color: colors.textSecondary, marginLeft: 64 + spacing.sm },
  examples: { marginLeft: 64 + spacing.sm, gap: spacing.xs, marginTop: spacing.xs },
  example: { backgroundColor: colors.surface, borderRadius: radii.sm, padding: spacing.sm },
  exKu: { fontSize: typography.sizes.md, color: colors.textPrimary },
  exEn: { fontSize: typography.sizes.sm, color: colors.textSecondary },
});
