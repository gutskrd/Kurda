import { Linking, StyleSheet, Text } from 'react-native';
import { spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';

const SOURCE = 'https://ku.wiktionary.org/';
const LICENCE = 'https://creativecommons.org/licenses/by-sa/4.0/';
// Names, not copy: a licence identifier and a wiki are the same in every language.
const SOURCE_NAME = 'Wîkîferheng';
const LICENCE_NAME = 'CC BY-SA 4.0';

/**
 * Where the words came from and under what licence. Most of the lexicon is from Wîkîferheng (CC BY-SA 4.0), whose
 * licence requires naming the source and linking the licence, so this belongs on every screen with a definition.
 * The sentence is translated whole with `{source}` and `{licence}` placeholders, because word order differs by
 * language; it is split here so each link stays tappable.
 */
export function SourceLine() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const parts = t('dictionary.source').split(/(\{source\}|\{licence\})/);

  const link = (url: string, label: string, key: number) => (
    <Text key={key} style={{ color: colors.primary }} onPress={() => void Linking.openURL(url)}>
      {label}
    </Text>
  );

  return (
    <Text style={[styles.line, { color: colors.textSecondary }]}>
      {parts.map((part, i) => {
        if (part === '{source}') return link(SOURCE, SOURCE_NAME, i);
        if (part === '{licence}') return link(LICENCE, LICENCE_NAME, i);
        return <Text key={i}>{part}</Text>;
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  line: {
    fontSize: typography.sizes.text,
    // An inline link cannot reach past its own line, so the line is taller than its type: each link answers over the full 24.
    lineHeight: 24,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
});
