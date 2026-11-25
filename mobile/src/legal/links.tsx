import * as Clipboard from 'expo-clipboard';
import { Alert, Linking, StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useTheme } from '../theme/ThemeProvider';
import { typography } from '../theme/tokens';

/** The pages on hevalo.app the app links to instead of repeating them, so the app and the site never disagree. */
export const LEGAL_URLS = {
  terms: 'https://hevalo.app/terms',
  privacy: 'https://hevalo.app/privacy',
  copyright: 'https://hevalo.app/copyright',
  teaching: 'https://hevalo.app/how-hevalo-teaches',
  faq: 'https://hevalo.app/faq',
  about: 'https://hevalo.app/about',
} as const;

/** The support address; a person answers it. */
export const SUPPORT_EMAIL = 'support@hevalo.app';

/** Open one of the pages above, or the mail app for support; failing to open is not worth an error. */
export function openLegal(to: keyof typeof LEGAL_URLS | 'support'): void {
  const url = to === 'support' ? `mailto:${SUPPORT_EMAIL}` : LEGAL_URLS[to];
  void Linking.openURL(url).catch(() => undefined);
}

/**
 * Write to support in the mail app. Without a mail app the address is copied and the person is told so; if
 * copying fails too, they are told the address.
 */
export async function contactSupport(t: (key: TranslationKey, vars?: Record<string, string | number>) => string): Promise<void> {
  try {
    await Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
    return;
  } catch {
    // No mail app answered, so copy the address instead.
  }
  let copied = false;
  try {
    copied = await Clipboard.setStringAsync(SUPPORT_EMAIL);
  } catch {
    copied = false;
  }
  const body: TranslationKey = copied ? 'settings.support.noMail.copied' : 'settings.support.noMail.address';
  Alert.alert(t('settings.support.noMail.title'), t(body, { email: SUPPORT_EMAIL }));
}

// Placeholders that cannot appear in a translation, to find where each link goes.
const MARK = '\u0000';

/**
 * "By continuing you agree to Hevalo's Terms of Use and Privacy Policy", with both names as links, under every
 * way of creating an account. The sentence is translated whole with {terms} and {privacy} placeholders, because
 * word order differs between languages.
 */
export function AgreeLine({ style }: { style?: StyleProp<TextStyle> }): React.JSX.Element {
  const { t } = useI18n();
  const { colors } = useTheme();
  const sentence = t('auth.legal.agree', { terms: `${MARK}terms${MARK}`, privacy: `${MARK}privacy${MARK}` });
  const parts = sentence.split(MARK);
  return (
    <Text style={[styles.line, { color: colors.textSecondary }, style]}>
      {parts.map((part, i) =>
        // The odd-indexed pieces are the placeholder names.
        i % 2 === 1 && (part === 'terms' || part === 'privacy') ? (
          // Links are ink like everything pressable; the underline marks them without relying on colour.
          <Text
            key={i}
            accessibilityRole="link"
            onPress={() => openLegal(part)}
            style={[styles.link, { color: colors.primary }]}
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
  // An inline link has no hit slop of its own, so its line is made taller instead.
  line: { fontSize: typography.sizes.text, lineHeight: 24, textAlign: 'center' },
  link: { fontWeight: typography.weights.semibold, textDecorationLine: 'underline' },
});
