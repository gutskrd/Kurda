import { useNavigation } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { FeedImage, PostMediaView } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import type { RootNavigation } from '../navigation/rootStack';
import { Icon } from '../theme/Icon';
import { spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';

/**
 * The pieces of a post's own page that came with pictures on written posts:
 * the pictures as the grid takes them, the "Source / credit" line, and a way
 * for the author to edit.
 */

/** A post's pictures, as the grid shows them; a picture the server could not address is left out. */
export function postImages(post: { media?: PostMediaView[] }): FeedImage[] {
  return (post.media ?? [])
    .filter((m): m is PostMediaView & { url: string } => !!m.url)
    .map((m) => ({ url: m.url, alt: m.altText, width: m.width, height: m.height }));
}

/** "Source: …", under the post — where a quote or a picture came from. */
export function SourceCredit({ text }: { text: string }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.credit}>
      <Icon name="quotes" size={14} color={colors.textSecondary} />
      <Text style={[styles.creditText, { color: colors.textSecondary }]}>{t('composer.source', { source: text })}</Text>
    </View>
  );
}

/** "Edit", in the post's header — only on your own post. */
export function EditPostButton({ post }: { post: { id: string; authorId: string } }): React.JSX.Element | null {
  const { user } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();
  if (!user || user.id !== post.authorId) return null;
  return (
    <Pressable
      onPress={() => navigation.navigate('Compose', { postId: post.id })}
      accessibilityRole="button"
      accessibilityLabel={t('composer.edit')}
      style={styles.edit}
    >
      <Icon name="pencil" size={20} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  credit: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  creditText: { flex: 1, fontSize: typography.sizes.sm, fontStyle: 'italic' },
  edit: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
});
