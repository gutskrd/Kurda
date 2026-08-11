import { StyleSheet, Text, View } from 'react-native';
import { spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { parseMarkdown, type Span } from './markdown';

function Inline({ spans }: { spans: Span[] }) {
  const { colors } = useTheme();
  return (
    <Text>
      {spans.map((s, i) => (
        <Text key={i} style={[s.bold && styles.bold, s.code && [styles.code, { backgroundColor: colors.glassFill, color: colors.primaryStrong }]]}>
          {s.text}
        </Text>
      ))}
    </Text>
  );
}

/** Renders a grammar note's markdown with the system font (no tofu). */
export function MarkdownView({ source }: { source: string }) {
  const { colors } = useTheme();
  const blocks = parseMarkdown(source);
  return (
    <View style={styles.container}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'heading':
            return (
              <Text key={i} style={[styles.heading, headingSize(block.level), { color: colors.textPrimary }]}>
                <Inline spans={block.spans} />
              </Text>
            );
          case 'paragraph':
            return (
              <Text key={i} style={[styles.paragraph, { color: colors.textPrimary }]}>
                <Inline spans={block.spans} />
              </Text>
            );
          case 'bullets':
            return (
              <View key={i} style={styles.bullets}>
                {block.items.map((item, j) => (
                  <View key={j} style={styles.bulletRow}>
                    <Text style={[styles.bulletDot, { color: colors.primary }]}>•</Text>
                    <Text style={[styles.bulletText, { color: colors.textPrimary }]}>
                      <Inline spans={item} />
                    </Text>
                  </View>
                ))}
              </View>
            );
          case 'code':
            return (
              <View key={i} style={[styles.codeBlock, { backgroundColor: colors.glassFill }]}>
                <Text style={[styles.codeText, { color: colors.textPrimary }]}>{block.text}</Text>
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
  heading: { fontFamily: typography.fontFamily, fontWeight: typography.weights.bold },
  paragraph: { fontFamily: typography.fontFamily, fontSize: typography.sizes.md, lineHeight: 24 },
  bold: { fontWeight: typography.weights.bold },
  code: { fontFamily: typography.fontFamily },
  bullets: { gap: spacing.xs },
  bulletRow: { flexDirection: 'row', gap: spacing.sm },
  bulletDot: { fontSize: typography.sizes.md },
  bulletText: { flex: 1, fontSize: typography.sizes.md, lineHeight: 24 },
  codeBlock: { borderRadius: 8, padding: spacing.md },
  codeText: { fontFamily: typography.fontFamily, fontSize: typography.sizes.md },
});
