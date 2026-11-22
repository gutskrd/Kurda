import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useDirection } from '../reports/direction';
import { Icon } from '../theme/Icon';
import { heldRow } from '../theme/MotionParts';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import type { Sense } from './types';

/** One collapsible sense. Long entries (20+ senses) start collapsed; tapping the header shows the examples. */
export function SenseSection({ sense, startCollapsed }: { sense: Sense; startCollapsed: boolean }) {
  const { colors } = useTheme();
  // Collapsed, the chevron points in the reading direction; the row and its indent start on the reading side too.
  const dir = useDirection();
  const flip = dir.flip;
  const indent = dir.row === 'row-reverse' ? { marginRight: INDENT } : { marginLeft: INDENT };
  const [open, setOpen] = useState(!startCollapsed);
  const hasExamples = sense.examples.length > 0;

  return (
    <View style={styles.sense}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [styles.header, { flexDirection: dir.row }, pressed && heldRow(colors.controlTrack)]}
        disabled={!hasExamples}
        // A sense with examples opens and closes; one without is only words.
        accessibilityRole={hasExamples ? 'button' : undefined}
        accessibilityState={hasExamples ? { expanded: open } : undefined}
      >
        <Text style={[styles.pos, { color: colors.primary }]}>{sense.pos}</Text>
        {/* English first when there is one, then the Kurdish; a word defined only in Kurdish (most of Wîkîferheng) shows that here. */}
        <Text style={[styles.def, dir.text, { color: colors.textPrimary }]}>
          {sense.position}. {sense.definitionEn ?? sense.definitionKu}
        </Text>
        {/* The set's own chevrons, as every expandable row uses. */}
        {hasExamples ? <Icon name={open ? 'chevron-down' : 'chevron-right'} size={16} color={colors.textSecondary} style={open ? undefined : (flip ?? undefined)} /> : null}
      </Pressable>
      {sense.definitionEn && sense.definitionKu ? (
        <Text style={[styles.defKu, indent, dir.text, { color: colors.textSecondary }]}>{sense.definitionKu}</Text>
      ) : null}
      {open && hasExamples ? (
        <View style={[styles.examples, indent]}>
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

/** The indent of definitions and examples: past the part of speech, which is this wide. */
const POS_WIDTH = 64;
const INDENT = POS_WIDTH + spacing.sm;

const styles = StyleSheet.create({
  sense: { paddingVertical: spacing.sm, gap: 4 },
  // Opens the examples: a fingertip tall.
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET },
  pos: {
    fontSize: typography.sizes.text,
    fontStyle: 'italic',
    minWidth: POS_WIDTH,
  },
  def: { flex: 1, fontSize: typography.sizes.text },
  defKu: { fontSize: typography.sizes.text },
  examples: { gap: spacing.xs, marginTop: spacing.xs },
  example: { borderRadius: radii.sm, padding: spacing.sm },
  exKu: { fontSize: typography.sizes.text },
  exEn: { fontSize: typography.sizes.text },
});
