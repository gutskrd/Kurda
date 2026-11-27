import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { RootNavigation } from '../navigation/rootStack';
import { Avatar } from './Avatar';
import { BottomSheet, SheetScrollView } from '../theme/BottomSheet';
import { pressedDim } from '../theme/motion';
import { Pressable } from '../theme/Pressable';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { formatCompact } from '../i18n/format';
import { useDirection } from '../reports/direction';
import { Skeleton, SkeletonText } from '../theme/Skeleton';

/** Enough to show who someone knows without turning a profile into a directory. */
export const PROFILE_FRIENDS_SHOWN = 12;
/** The faces stacked in the line. */
const FACES = 3;
const FACE = 28;

/** A friend as `GET /users/:id/friends` returns one: `userId`, not `id`, as the endpoint names it. */
export interface FriendOf {
  userId: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

/**
 * Who this person knows, as one line of stacked faces with the first names that opens the list, as on the website. The
 * profile reads the list with itself (`PROFILE_FRIENDS_SHOWN` of them and the total); with nobody to show, the line is
 * left out and the figure beside the face says 0.
 */
export function ProfileFriends({ friends, total }: { friends: readonly FriendOf[]; total: number }): React.JSX.Element | null {
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const [open, setOpen] = useState(false);

  if (friends.length === 0) return null;
  const nameOf = (f: FriendOf): string => f.displayName || f.username;
  const count = `${t('nav.friends')} · ${formatCompact(total, locale)}`;
  const names = friends.slice(0, 2).map(nameOf).join(', ');

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${count}, ${names}`}
        testID="profile-friends"
        style={({ pressed }) => [styles.line, { flexDirection: dir.row, opacity: pressed ? pressedDim : 1 }]}
      >
        <View style={[styles.faces, { flexDirection: dir.row }]}>
          {friends.slice(0, FACES).map((f, i) => (
            <View key={f.userId} style={[styles.face, { borderColor: colors.background }, i > 0 ? (dir.row === 'row' ? styles.overlap : styles.overlapEnd) : null]}>
              <Avatar name="" size={FACE} photoUrl={f.avatarUrl} />
            </View>
          ))}
        </View>
        <View style={styles.said}>
          <Text style={[styles.count, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
            {count}
          </Text>
          <Text style={[styles.names, dir.text, { color: colors.textSecondary }]} numberOfLines={1}>
            {names}
          </Text>
        </View>
      </Pressable>

      <BottomSheet visible={open} onClose={() => setOpen(false)} title={count}>
        <SheetScrollView contentContainerStyle={styles.list}>
          {friends.map((f) => (
            <Pressable
              key={f.userId}
              onPress={() => {
                setOpen(false);
                navigation.navigate('UserProfile', { userId: f.userId });
              }}
              accessibilityRole="button"
              accessibilityLabel={nameOf(f)}
              style={({ pressed }) => [styles.row, { flexDirection: dir.row, opacity: pressed ? pressedDim : 1 }]}
            >
              <Avatar name={nameOf(f)} size={44} photoUrl={f.avatarUrl} />
              <View style={styles.said}>
                <Text style={[styles.count, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
                  {nameOf(f)}
                </Text>
                <Text style={[styles.names, dir.text, { color: colors.textSecondary }]} numberOfLines={1}>
                  {`@${f.username}`}
                </Text>
              </View>
            </Pressable>
          ))}
          {total > friends.length ? (
            <Text style={[styles.names, dir.text, { color: colors.textSecondary }]}>{t('profile.friendsMore', { count: total - friends.length })}</Text>
          ) : null}
        </SheetScrollView>
      </BottomSheet>
    </>
  );
}

/** The friends line while the profile loads: one face, the count and a name, in the line's own shape. */
export function ProfileFriendsSkeleton(): React.JSX.Element {
  const dir = useDirection();
  return (
    <View style={[styles.line, { flexDirection: dir.row }]}>
      <Skeleton width={FACE} height={FACE} radius={radii.pill} />
      <View style={styles.said}>
        <SkeletonText size={typography.sizes.text} width={72} />
        <SkeletonText size={typography.sizes.text} width={48} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { alignItems: 'center', gap: spacing.sm + 2, minHeight: 48 },
  faces: { flexShrink: 0 },
  // Ringed in the page's colour, so each face reads as cut out of the one under it.
  face: { borderWidth: 2, borderRadius: radii.pill },
  overlap: { marginLeft: -10 },
  overlapEnd: { marginRight: -10 },
  said: { flex: 1, minWidth: 0 },
  count: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  names: { fontSize: typography.sizes.text },
  list: { gap: spacing.md, paddingBottom: spacing.md },
  row: { alignItems: 'center', gap: spacing.md },
});
