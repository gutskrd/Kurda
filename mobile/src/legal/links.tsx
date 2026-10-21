import { Linking, StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeProvider';
import { typography } from '../theme/tokens';

/**
 * The pages on hevalo.app the app points to rather than repeating: the rules
 * for using Hevalo, what happens to your data, and how it teaches. One copy
 * of each, kept on the website, so the app and the site can never say two
 * different things.
 */
export const LEGAL_URLS = {
  terms: 'https://hevalo.app/terms',
  privacy: 'https://hevalo.app/privacy',
  copyright: 'https://hevalo.app/copyright',
  teaching: 'https://hevalo.app/how-hevalo-teaches',
} as const;

/** Where a person writes to when something is wrong: answered by a person. */
export const SUPPORT_EMAIL = 'support@hevalo.app';

/** Open one of the pages above, or the mail app for support; a failure to open is not worth an error. */
export function openLegal(to: keyof typeof LEGAL_URLS | 'support'): void {
  const url = to === 'support' ? `mailto:${SUPPORT_EMAIL}` : LEGAL_URLS[to];
  void Linking.openURL(url).catch(() => undefined);
}

// placeholders that cannot appear in a translation, to find where each link goes
const MARK = '\u0000';

/**
 * "By continuing you agree to Hevalo's Terms of Use and Privacy Policy", with
 * the two names as links, under every way of creating an account: the email
 * form and the Apple and Google buttons alike.
 *
 * The sentence is translated whole, with {terms} and {privacy} where the
 * links go, because the order of the two (and the words round them) is not
 * the same in every language.
 */
export function AgreeLine({ style }: { style?: StyleProp<TextStyle> }): React.JSX.Element {
  const { t } = useI18n();
  const { colors } = useTheme();
  const sentence = t('auth.legal.agree', { terms: `${MARK}terms${MARK}`, privacy: `${MARK}privacy${MARK}` });
  const parts = sentence.split(MARK);
  return (
    <Text style={[styles.line, { color: colors.textSecondary }, style]}>
      {parts.map((part, i) =>
        // the odd pieces are the placeholders' names
        i % 2 === 1 && (part === 'terms' || part === 'privacy') ? (
          <Text
            key={i}
            accessibilityRole="link"
            onPress={() => openLegal(part)}
            style={[styles.link, { color: colors.textPrimary }]}
          >
            {t(part === 'terms' ? 'auth.legal.terms' : 'auth.legal.privacy')}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  line: { fontSize: typography.sizes.xs, lineHeight: 18, textAlign: 'center' },
  link: { fontWeight: typography.weights.semibold, textDecorationLine: 'underline' },
});
