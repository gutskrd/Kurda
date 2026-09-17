import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { InitialsAvatar } from './InitialsAvatar';
import { spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';

/** Enough to show who someone knows without turning a profile into a directory. */
const SHOW = 12;

/**
 * A friend, as `GET /users/:id/friends` actually returns one.
 *
 * `userId`, not `id`. The browser's copy of this type said `id` once and every
 * face in its list opened `/users/undefined` — the one thing the list is for
 * did not work, and nothing in the types noticed, because the shape was
 * declared by hand rather than taken from the endpoint.
 */
interface FriendOf {
  userId: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

/**
 * Who this person knows (KUR-090).
 *
 * A profile that shows a level, a streak and what someone is wearing but not
 * who they know is a profile of an account rather than of a person — and on a
 * community app, who someone knows is most of what makes anyone else findable.
 *
 * The privacy rules are the profile's own and live on the server: a profile
 * whose detail you may not see returns no friends at all, so there is nothing
 * to gate here. Nothing is rendered when the list is empty, because "0 friends"
 * on somebody's profile is a worse thing to publish than silence.
 *
 * Each face opens that person's own profile, which is how you get from one
 * person to the next without going back to search.
 */
export function ProfileFriends({ userId }: { userId: string }): React.JSX.Element | null {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();

  const [friends, setFriends] = useState<FriendOf[] | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFriends(null);
    // ask for the twelve this draws, not all five hundred somebody may have;
    // `total` is what the line underneath needs, and it comes back with the page
    void client
      .get<{ friends: FriendOf[]; total?: number }>(`/users/${userId}/friends?limit=${SHOW}`)
      .then((res) => {
        if (cancelled) return;
        const list = res.ok ? (res.data.friends ?? []) : [];
        setFriends(list);
        // an API that predates paging sends no total — it sent every friend
        setTotal(res.ok ? (res.data.total ?? list.length) : 0);
      });
    return () => {
      cancelled = true;
    };
  }, [client, userId]);

  if (!friends || friends.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.heading, { color: colors.textSecondary }]}>
        {t('nav.friends')} {total}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {friends.map((f) => (
          <Pressable
            key={f.userId}
            onPress={() => navigation.navigate('UserProfile', { userId: f.userId })}
            accessibilityRole="button"
            accessibilityLabel={f.displayName || f.username}
            style={styles.friend}
          >
            <InitialsAvatar
              name={f.displayName || f.username}
              id={f.userId}
              size={52}
              photoUrl={f.avatarUrl ?? null}
            />
            <Text style={[styles.name, { color: colors.textSecondary }]} numberOfLines={1}>
              {f.displayName || f.username}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {total > friends.length ? (
        <Text style={[styles.more, { color: colors.textSecondary }]}>
          {t('profile.friendsMore', { count: total - friends.length })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', marginTop: spacing.lg, gap: spacing.sm },
  heading: { fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: typography.weights.bold },
  row: { gap: spacing.md, paddingVertical: 2 },
  friend: { width: 60, alignItems: 'center', gap: 4 },
  name: { fontSize: typography.sizes.xs, textAlign: 'center' },
  more: { fontSize: typography.sizes.sm },
});
