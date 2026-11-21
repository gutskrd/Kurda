import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { Avatar } from '../profile/Avatar';
import { useDirection } from '../reports/direction';
import { Note } from '../stories/ui';
import { Icon } from '../theme/Icon';
import { pressedDim } from '../theme/motion';
import { Pressable } from '../theme/Pressable';
import { SearchField } from '../theme/SearchField';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import type { InviteLists } from '@kurda/shared';
import { listFriends, listInvites, type FriendSummary } from './api';

/** Friends who recently joined your games through an accepted invite, newest first; declined or expired invites do not count. */
export function recentPlayers(lists: InviteLists): string[] {
  return lists.outgoing.flatMap((o) => o.invitees.filter((i) => i.status === 'accepted').map((i) => i.userId));
}

/** Friends ordered: most recently played with first, then everyone by name. */
export function orderFriends(friends: readonly FriendSummary[], recentIds: readonly string[], query: string): {
  recent: FriendSummary[];
  rest: FriendSummary[];
} {
  const q = query.trim().toLowerCase();
  const match = (f: FriendSummary) =>
    !q || f.username.toLowerCase().includes(q) || (f.displayName ?? '').toLowerCase().includes(q);
  const byId = new Map(friends.map((f) => [f.userId, f]));
  const recent = [...new Set(recentIds)].map((id) => byId.get(id)).filter((f): f is FriendSummary => !!f && match(f)).slice(0, 5);
  const shown = new Set(recent.map((f) => f.userId));
  const rest = friends
    .filter((f) => !shown.has(f.userId) && match(f))
    .sort((a, b) => Number(b.online) - Number(a.online) || (a.displayName ?? a.username).localeCompare(b.displayName ?? b.username));
  return { recent, rest };
}

/** Your friends and who you played with lately, read once for a picker; `friends` is null until it has answered. */
export function useFriendsToAsk(): { friends: FriendSummary[] | null; recentIds: string[] } {
  const { client } = useAuth();
  const [friends, setFriends] = useState<FriendSummary[] | null>(null);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    void listFriends(client).then((res) => {
      if (live) setFriends(res.ok ? res.data.friends : []);
    });
    void listInvites(client).then((res) => {
      if (live && res.ok) setRecentIds(recentPlayers(res.data));
    });
    return () => {
      live = false;
    };
  }, [client]);
  return { friends, recentIds };
}

/**
 * Choosing friends to ask to a game: a search, those played with lately first, then everyone with who is online
 * first, as the website's picker orders them. Checkboxes, or radios where only one may be asked, when choosing another
 * swaps them. `locked` is a friend who is asked whatever is ticked (the one a chat is with), shown first and fixed.
 */
export function FriendPicker({
  friends,
  recentIds,
  picked,
  onToggle,
  single = false,
  limit,
  locked,
  offerOthers = true,
}: {
  friends: FriendSummary[] | null;
  recentIds: readonly string[];
  picked: readonly string[];
  onToggle: (id: string) => void;
  single?: boolean;
  limit: number;
  locked?: FriendSummary;
  /** False where only `locked` may be asked: no search and no list. */
  offerOthers?: boolean;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [query, setQuery] = useState('');
  const others = useMemo(() => (friends ?? []).filter((f) => f.userId !== locked?.userId), [friends, locked]);
  const { recent, rest } = useMemo(() => orderFriends(others, recentIds, query), [others, recentIds, query]);

  const row = (f: FriendSummary) => {
    const fixed = f.userId === locked?.userId;
    const on = fixed || picked.includes(f.userId);
    const name = f.displayName ?? f.username;
    return (
      <Pressable
        key={f.userId}
        onPress={() => onToggle(f.userId)}
        disabled={fixed}
        accessibilityRole={single ? 'radio' : 'checkbox'}
        accessibilityState={{ checked: on, disabled: fixed }}
        accessibilityLabel={f.online ? t('play.sheet.friendOnline', { name }) : name}
        style={({ pressed }) => [styles.friend, { flexDirection: dir.row, backgroundColor: on ? colors.controlTrack : 'transparent', opacity: pressed ? pressedDim : 1 }]}
      >
        <View>
          <Avatar name={name} size={36} photoUrl={f.avatarUrl} />
          {f.online ? <View style={[styles.online, { backgroundColor: colors.success, borderColor: colors.background }]} /> : null}
        </View>
        <View style={styles.friendText}>
          <Text style={[styles.friendName, dir.free, { color: colors.textPrimary }]} numberOfLines={1}>
            {name}
          </Text>
          {f.displayName ? (
            <Text style={[styles.friendHandle, dir.free, { color: colors.textSecondary }]} numberOfLines={1}>
              @{f.username}
            </Text>
          ) : null}
        </View>
        <View style={[styles.check, { borderColor: on ? colors.primary : colors.textSecondary, backgroundColor: on ? colors.primary : 'transparent' }]}>
          {on ? <Icon name="check" size={14} color={colors.textOnPrimary} /> : null}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.picker}>
      {locked ? row(locked) : null}
      {offerOthers ? <SearchField value={query} onChangeText={setQuery} label={t('play.sheet.search')} returnKeyType="done" /> : null}
      {friends === null || !offerOthers ? null : friends.length === 0 ? (
        <Note>{t('play.sheet.noFriends')}</Note>
      ) : (
        <>
          {recent.length > 0 ? (
            <>
              <Text style={[styles.subhead, dir.text, { color: colors.textSecondary }]}>{t('play.sheet.recent')}</Text>
              {recent.map(row)}
              <Text style={[styles.subhead, dir.text, { color: colors.textSecondary }]}>{t('play.sheet.allFriends')}</Text>
            </>
          ) : null}
          {rest.map(row)}
        </>
      )}
      {!single && picked.length >= limit ? <Text style={[styles.hint, dir.text, { color: colors.textSecondary }]}>{t('play.sheet.limit', { count: limit })}</Text> : null}
    </View>
  );
}

/** The next set of picks after a tap: a radio swaps, a checkbox adds up to `limit` or takes away. */
export function togglePick(picked: readonly string[], id: string, single: boolean, limit: number): string[] {
  if (picked.includes(id)) return picked.filter((x) => x !== id);
  if (single) return [id];
  return picked.length >= limit ? [...picked] : [...picked, id];
}

const styles = StyleSheet.create({
  picker: { gap: spacing.sm },
  hint: { fontSize: typography.sizes.text, lineHeight: 22 },
  subhead: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, marginTop: spacing.xs },
  friend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
  },
  online: { position: 'absolute', right: -1, bottom: -1, width: 12, height: 12, borderRadius: radii.pill, borderWidth: 2 },
  friendText: { flex: 1 },
  friendName: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  friendHandle: { fontSize: typography.sizes.text },
  check: { width: 24, height: 24, borderRadius: radii.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
