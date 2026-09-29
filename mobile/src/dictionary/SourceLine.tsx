import { Linking, StyleSheet, Text } from 'react-native';
import { spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';

const SOURCE = 'https://ku.wiktionary.org/';
const LICENCE = 'https://creativecommons.org/licenses/by-sa/4.0/';
// names, not copy: a licence identifier and a wiki are the same in every language
const SOURCE_NAME = 'Wîkîferheng';
const LICENCE_NAME = 'CC BY-SA 4.0';

/**
 * Where the words came from, and under what.
 *
 * The bulk of the lexicon is imported from Wîkîferheng, which is CC BY-SA 4.0:
 * naming the source and linking the licence is the condition of using it, not a
 * courtesy, so this belongs on every screen that shows a definition.
 *
 * The sentence is translated whole, with `{source}` and `{licence}` still in it,
 * because word order differs in all nine languages — Turkish puts the source
 * first, Arabic reads the other way. Splitting it back apart here is what lets
 * each language keep its own shape and still have two tappable links in it.
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
    fontSize: typography.sizes.xs,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
});
