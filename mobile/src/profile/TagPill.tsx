import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { shopItemDescription, type ProfileWordTag } from '@kurda/shared';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';

/**
 * A word tag worn by the name (shared shop-tags.ts), as the website draws it: the Kurmancî word in the page's ink on its
 * own quiet ground, never a colour of its own, with the kilim's diamond before it. A screen reader hears the word and
 * what it means in the reader's language.
 */
export function TagPill({
  tag,
  solid = false,
  style,
}: {
  tag: Pick<ProfileWordTag, 'label' | 'meaning'>;
  /** On a picture, where the pill needs a ground of its own to be read. */
  solid?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const meaning = shopItemDescription({ name: tag.label, description: tag.meaning }, locale);
  return (
    <View
      style={[styles.pill, { borderColor: colors.glassBorder, backgroundColor: solid ? colors.background : colors.glassFill }, style]}
      accessible
      accessibilityLabel={meaning ? t('tag.withMeaning', { word: tag.label, meaning }) : tag.label}
    >
      <View style={[styles.mark, { borderColor: colors.textPrimary }]} />
      <Text style={[styles.word, { color: colors.textPrimary }]} numberOfLines={1} accessibilityLanguage="ku">
        {tag.label}
      </Text>
    </View>
  );
}

/** The pill's diamond alone, where the word is written beside it. */
export function TagMark(): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={[styles.pill, styles.markOnly, { borderColor: colors.glassBorder, backgroundColor: colors.glassFill }]}>
      <View style={[styles.mark, { borderColor: colors.textPrimary }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs + 2,
    maxWidth: '100%',
    paddingVertical: 2,
    paddingStart: spacing.sm,
    paddingEnd: spacing.sm + 2,
    borderWidth: 1,
    borderRadius: radii.pill,
  },
  markOnly: { paddingVertical: spacing.xs + 2, paddingStart: spacing.md, paddingEnd: spacing.md },
  mark: { width: 7, height: 7, borderWidth: 1.5, borderRadius: radii.none, transform: [{ rotate: '45deg' }], opacity: 0.7 },
  word: { flexShrink: 1, fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
});
