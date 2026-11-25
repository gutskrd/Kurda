import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useI18n } from '../i18n/I18nContext';
import type { RootNavigation } from '../navigation/rootStack';
import { useDirection } from '../reports/direction';
import { Icon } from '../theme/Icon';
import { heldDim } from '../theme/MotionParts';
import { Pressable } from '../theme/Pressable';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import type { FavoriteRef } from './types';

/** A favourite's chip: as tall as a line of text, answering a fingertip past it (theme/Pressable). */
const CHIP = 34;

/**
 * The favourite poem and story under the bio, as two small links to the posts, as on the website's profile. Nothing
 * shows for one that is not set.
 */
export function Favourites({ poem, story }: { poem?: FavoriteRef | null; story?: FavoriteRef | null }): React.JSX.Element | null {
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const shown = [
    poem ? { key: 'poem', ref: poem, icon: 'quotes' as const, kind: t('profile.favoritePoem') } : null,
    story ? { key: 'story', ref: story, icon: 'book' as const, kind: t('profile.favoriteStory') } : null,
  ].filter((f) => f !== null);
  if (shown.length === 0) return null;
  return (
    <View style={[styles.row, { flexDirection: dir.row }]}>
      {shown.map((f) => (
        <Pressable
          key={f.key}
          onPress={() => navigation.navigate('LibraryPost', { postId: f.ref.id })}
          accessibilityRole="link"
          accessibilityLabel={`${f.kind}: ${f.ref.title}`}
          testID={`profile-favourite-${f.key}`}
          style={({ pressed }) => [styles.chip, { flexDirection: dir.row, backgroundColor: colors.controlTrack }, pressed && heldDim]}
        >
          <Icon name={f.icon} size={16} tone="secondary" />
          <Text style={[styles.title, dir.free, { color: colors.textPrimary }]} numberOfLines={1}>
            {f.ref.title}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexWrap: 'wrap', gap: spacing.sm },
  chip: { maxWidth: '100%', height: CHIP, alignItems: 'center', gap: spacing.xs + 2, paddingHorizontal: spacing.md - 4, borderRadius: radii.pill },
  title: { flexShrink: 1, fontSize: typography.sizes.text },
});
