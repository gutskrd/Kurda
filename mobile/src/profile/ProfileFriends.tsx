import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '../theme/MotionParts';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { Avatar } from './Avatar';
import { spacing, typography } from '../theme/tokens';
import { sectionLabel } from '../theme/fonts';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';

/** Enough to show who someone knows without turning a profile into a directory. */
const SHOW = 12;

/** A friend as `GET /users/:id/friends` returns one: `userId`, not `id`, as the endpoint names it. */
interface FriendOf {
  userId: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

/**
 * Who this person knows. Privacy is the server's: a profile whose detail you may not see returns no friends, so there
 * is nothing to gate here. Nothing renders for an empty list, since "0 friends" is worse to publish than silence. Each
 * face opens that person's profile; in right-to-left languages the faces run from the right, starting scrolled to that
 * end.
 */
export function ProfileFriends({ userId }: { userId: string }): React.JSX.Element | null {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const mirrored = dir.row === 'row-reverse';
  const scroller = useRef<ScrollView>(null);

  const [friends, setFriends] = useState<FriendOf[] | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFriends(null);
    // Ask for the twelve this draws, not every friend; `total` comes back with the page for the line underneath.
    void client
      .get<{ friends: FriendOf[]; total?: number }>(`/users/${userId}/friends?limit=${SHOW}`)
      .then((res) => {
        if (cancelled) return;
        const list = res.ok ? (res.data.friends ?? []) : [];
        setFriends(list);
        // An API that predates paging sends no total; it sent every friend.
        setTotal(res.ok ? (res.data.total ?? list.length) : 0);
      });
    return () => {
      cancelled = true;
    };
  }, [client, userId]);

  if (!friends || friends.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.heading, dir.text, { color: colors.textSecondary }]}>
        {t('nav.friends')} {total}
      </Text>

      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        // Right to left, the first face is on the right: the row at least as wide as the screen, so a short one starts
        // there too, and a long one scrolled to its start.
        contentContainerStyle={[styles.row, { flexDirection: dir.row }, mirrored ? styles.rowMirrored : null]}
        onContentSizeChange={() => {
          if (mirrored) scroller.current?.scrollToEnd({ animated: false });
        }}
      >
        {friends.map((f) => (
          <PressableScale
            key={f.userId}
            onPress={() => navigation.navigate('UserProfile', { userId: f.userId })}
            accessibilityRole="button"
            accessibilityLabel={f.displayName || f.username}
            style={styles.friend}
          >
            <Avatar name={f.displayName || f.username} size={52} photoUrl={f.avatarUrl} />
            <Text style={[styles.name, { color: colors.textSecondary }]} numberOfLines={1}>
              {f.displayName || f.username}
            </Text>
          </PressableScale>
        ))}
      </ScrollView>

      {total > friends.length ? (
        <Text style={[styles.more, dir.text, { color: colors.textSecondary }]}>
          {t('profile.friendsMore', { count: total - friends.length })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', marginTop: spacing.lg, gap: spacing.sm },
  heading: { ...sectionLabel },
  row: { gap: spacing.md, paddingVertical: 2 },
  rowMirrored: { flexGrow: 1 },
  friend: { width: 60, alignItems: 'center', gap: 4 },
  name: { fontSize: typography.sizes.xs, textAlign: 'center' },
  more: { fontSize: typography.sizes.sm },
});
