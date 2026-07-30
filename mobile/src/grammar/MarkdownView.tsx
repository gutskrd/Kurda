import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme/tokens';
import { parseMarkdown, type Span } from './markdown';

function Inline({ spans }: { spans: Span[] }) {
  return (
    <Text>
      {spans.map((s, i) => (
        <Text key={i} style={[s.bold && styles.bold, s.code && styles.code]}>
          {s.text}
        </Text>
      ))}
    </Text>
  );
}

/** Renders a grammar note's markdown with the system font (no tofu). */
export function MarkdownView({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  return (
    <View style={styles.container}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'heading':
            return (
              <Text key={i} style={[styles.heading, headingSize(block.level)]}>
                <Inline spans={block.spans} />
              </Text>
            );
          case 'paragraph':
            return (
              <Text key={i} style={styles.paragraph}>
                <Inline spans={block.spans} />
              </Text>
            );
          case 'bullets':
            return (
              <View key={i} style={styles.bullets}>
                {block.items.map((item, j) => (
                  <View key={j} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>
                      <Inline spans={item} />
                    </Text>
                  </View>
                ))}
              </View>
            );
          case 'code':
            return (
              <View key={i} style={styles.codeBlock}>
                <Text style={styles.codeText}>{block.text}</Text>
              </View>
            );
        }
      })}
    </View>
  );
}

function headingSize(level: 1 | 2 | 3) {
  return { fontSize: level === 1 ? typography.sizes.xl : level === 2 ? typography.sizes.lg : typography.sizes.md };
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  heading: { fontFamily: typography.fontFamily, fontWeight: typography.weights.bold, color: colors.textPrimary },
  paragraph: { fontFamily: typography.fontFamily, fontSize: typography.sizes.md, color: colors.textPrimary, lineHeight: 24 },
  bold: { fontWeight: typography.weights.bold },
  code: { fontFamily: typography.fontFamily, backgroundColor: colors.surface, color: colors.primaryDark },
  bullets: { gap: spacing.xs },
  bulletRow: { flexDirection: 'row', gap: spacing.sm },
  bulletDot: { color: colors.primary, fontSize: typography.sizes.md },
  bulletText: { flex: 1, fontSize: typography.sizes.md, color: colors.textPrimary, lineHeight: 24 },
  codeBlock: { backgroundColor: colors.surface, borderRadius: 8, padding: spacing.md },
  codeText: { fontFamily: typography.fontFamily, fontSize: typography.sizes.md, color: colors.textPrimary },
});
