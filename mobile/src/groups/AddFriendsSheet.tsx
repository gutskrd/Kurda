import { useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useDirection } from '../reports/direction';
import { BottomSheet, SheetScrollView } from '../theme/BottomSheet';
import { ClayButton } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { layout, spacing, typography } from '../theme/tokens';
import { addToGroup } from './api';
import { groupError } from './groupError';
import { Pill } from './Pill';

interface Friend {
  userId: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

/**
 * Bringing friends into a group, which is the only way anyone gets in: the
 * reader's friends who are not in it yet, each with Add. One added says Added
 * and stays in the list, so a second tap is never a second request; one the
 * server will not take says why under the list. Done, at the foot, closes the
 * sheet onto the group's chat.
 *
 * It opens by itself on a group made a moment ago, so it must never be an
 * empty sheet: someone with no friends yet is told so in a sentence, with the
 * way to find people (`onFindPeople`) as the one button.
 */
export function AddFriendsSheet({
  visible,
  groupId,
  memberIds,
  onClose,
  onFindPeople,
}: {
  visible: boolean;
  groupId: string;
  /** who is in the group already, left out of the list */
  memberIds: readonly string[];
  onClose: () => void;
  /** to where people are found and made friends, for someone who has none yet */
  onFindPeople: () => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    setError(null);
    void client.get<{ friends: Friend[] }>('/friends?limit=500').then((res) => {
      if (!live) return;
      setFriends(res.ok ? res.data.friends : []);
      if (!res.ok) setError(groupError(res.error, t));
    });
    return () => {
      live = false;
    };
  }, [client, visible, t]);

  const add = async (friend: Friend): Promise<void> => {
    setAdding(friend.userId);
    setError(null);
    const res = await addToGroup(client, groupId, friend.userId);
    setAdding(null);
    if (!res.ok) {
      haptic('wrong');
      setError(res.error.code === 'MEMBER_BANNED' ? t('groups.addFriends.banned', { name: friend.username }) : groupError(res.error, t));
      return;
    }
    haptic('correct');
    AccessibilityInfo.announceForAccessibility?.(t('groups.addFriends.addedName', { name: friend.username }));
    setAdded((prev) => new Set(prev).add(friend.userId));
  };

  const shown = (friends ?? []).filter((f) => !memberIds.includes(f.userId) || added.has(f.userId));
  // nobody to list because they have no friends at all, which is not the same as every friend being in already
  const friendless = friends !== null && friends.length === 0 && error === null;
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('groups.addFriends.title')} detents={['medium', 'large']} contentStyle={styles.sheet}>
      <SheetScrollView contentContainerStyle={styles.body}>
        {friends === null ? (
          <ActivityIndicator color={colors.textSecondary} style={styles.loading} accessibilityLabel={t('common.loading')} />
        ) : friendless ? (
          <Text style={[styles.empty, { color: colors.textPrimary }]}>{t('groups.addFriends.noFriends')}</Text>
        ) : shown.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('groups.addFriends.empty')}</Text>
        ) : (
          shown.map((f) => {
            const done = added.has(f.userId);
            return (
              <View key={f.userId} style={[styles.row, { flexDirection: dir.row }]}>
                <InitialsAvatar name={f.username} id={f.userId} size={40} photoUrl={f.avatarUrl ?? null} />
                <View style={styles.words}>
                  <Text style={[styles.name, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
                    {f.displayName || f.username}
                  </Text>
                  {f.displayName ? (
                    <Text style={[styles.sub, dir.text, { color: colors.textSecondary }]} numberOfLines={1}>
                      {f.username}
                    </Text>
                  ) : null}
                </View>
                <Pill
                  label={done ? t('groups.addFriends.added') : t('groups.addFriends.add')}
                  filled={!done}
                  busy={adding === f.userId}
                  disabled={done || (adding !== null && adding !== f.userId)}
                  onPress={() => void add(f)}
                  accessibilityLabel={done ? t('groups.addFriends.addedName', { name: f.username }) : t('groups.addFriends.addName', { name: f.username })}
                />
              </View>
            );
          })
        )}
        {error ? (
          <Text style={[styles.error, dir.text, { color: colors.danger }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </SheetScrollView>
      {friends === null ? null : (
        <View style={styles.foot}>
          {friendless ? (
            <ClayButton label={t('rail.findPeople')} icon="search" tone="primary" size="large" onPress={onFindPeople} />
          ) : (
            <ClayButton label={t('common.done')} tone="primary" size="large" onPress={onClose} />
          )}
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 0 },
  body: { paddingBottom: spacing.md },
  loading: { marginVertical: spacing.xl },
  empty: { fontSize: typography.sizes.md, lineHeight: 23, textAlign: 'center', paddingHorizontal: layout.gutter, paddingVertical: spacing.xl },
  row: { alignItems: 'center', gap: spacing.md, minHeight: 60, paddingHorizontal: layout.gutter, paddingVertical: spacing.sm },
  words: { flex: 1, minWidth: 0, gap: 1 },
  name: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  sub: { fontSize: typography.sizes.xs },
  error: { fontSize: typography.sizes.sm, lineHeight: 20, paddingHorizontal: layout.gutter, paddingTop: spacing.sm },
  // the one button of the sheet, clear of the list and inside the gutter the rows keep
  foot: { paddingHorizontal: layout.gutter, paddingTop: spacing.sm },
});
