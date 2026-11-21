import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
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

/** Enough to show who someone knows without turning a profile into a directory. */
const SHOW = 12;
/** The faces stacked in the line. */
const FACES = 3;
const FACE = 28;

/** A friend as `GET /users/:id/friends` returns one: `userId`, not `id`, as the endpoint names it. */
interface FriendOf {
  userId: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

/**
 * Who this person knows, as one line of stacked faces with the first names that opens the list, as on the website.
 * Privacy is the server's: a profile whose detail you may not see returns no friends. Nothing renders for an empty
 * list, since "0 friends" is worse to publish than silence.
 */
export function ProfileFriends({ userId }: { userId: string }): React.JSX.Element | null {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const [friends, setFriends] = useState<FriendOf[] | null>(null);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFriends(null);
    // Ask for the twelve the list shows, not every friend; `total` comes back with the page.
    void client.get<{ friends: FriendOf[]; total?: number }>(`/users/${userId}/friends?limit=${SHOW}`).then((res) => {
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
