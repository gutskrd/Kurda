import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { canManage, canSetRole, roleRank, type Role } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { radii, spacing, typography } from '../theme/tokens';
import { GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useTheme } from '../theme/ThemeProvider';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useI18n } from '../i18n/I18nContext';
import {
  groupDetail,
  leaveGroup,
  removeMember,
  setMemberRole,
  transferOwnership,
  type GroupDetail,
  type GroupMember,
} from './api';

/**
 * A club's roster, and what you may do about it (KUR-084).
 *
 * The permission rules come from `@kurda/shared`, which is also what the API
 * decides with. This screen only chooses what to *show*; if it decided
 * separately it would eventually offer a button the server refuses, which is
 * worse than not offering it.
 *
 * Leaving lives here because it is the one action about you rather than about
 * somebody else — and joining a club on the phone without being able to leave
 * it was a trap this screen exists to close.
 */
export function GroupMembersScreen({
  groupId,
  onExit,
  onLeft,
}: {
  groupId: string;
  onExit: () => void;
  onLeft: () => void;
}): React.JSX.Element {
  const { client, user } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const me = user?.id ?? '';

  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    void groupDetail(client, groupId).then((res) => {
      if (res.ok) setDetail(res.data);
      else setError(describeError(res.error, t));
    });
  }, [client, groupId, t]);

  useFocusEffect(load);

  const act = async (key: string, run: () => Promise<{ ok: boolean; error?: unknown }>): Promise<boolean> => {
    setBusy(key);
    setError(null);
    const res = await run();
    setBusy(null);
    if (res.ok) {
      load();
      return true;
    }
    setError(res.error ? describeError(res.error as never, t) : t('error.generic'));
    return false;
  };

  const myRole = detail?.myRole ?? null;
  /** You never manage yourself — a UI concern, not a permission. */
  const mayManage = (m: GroupMember): boolean => myRole !== null && canManage(myRole, m.role) && m.userId !== me;
  const maySetRole = myRole !== null && canSetRole(myRole, 'moderator');

  const roleName = (role: Role): string =>
    t(role === 'owner' ? 'groups.role.owner' : role === 'moderator' ? 'groups.role.admin' : 'groups.role.member');

  const confirmTransfer = (m: GroupMember): void => {
    // the one action nobody can undo for themselves, so it asks first and says
    // exactly what it costs
    Alert.alert(t('groups.makeOwner'), t('groups.makeOwnerWarning', { name: m.username }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('groups.makeOwner'),
        style: 'destructive',
        onPress: () => void act(`${m.userId}:transfer`, () => transferOwnership(client, groupId, m.userId)),
      },
    ]);
  };

  const confirmRemove = (m: GroupMember): void => {
    Alert.alert(t('groups.remove'), t('groups.removeFrom', { name: m.username, group: detail?.name ?? '' }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('groups.remove'),
        style: 'destructive',
        onPress: () => void act(`${m.userId}:remove`, () => removeMember(client, groupId, m.userId)),
      },
    ]);
  };

  const confirmLeave = (): void => {
    Alert.alert(t('groups.leave', { group: detail?.name ?? '' }), '', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('groups.leave', { group: detail?.name ?? '' }),
        style: 'destructive',
        onPress: () => {
          void act('leave', () => leaveGroup(client, groupId)).then((ok) => {
            if (ok) onLeft();
          });
        },
      },
    ]);
  };

  const members = [...(detail?.members ?? [])].sort(
    (a, b) => roleRank(b.role) - roleRank(a.role) || a.username.localeCompare(b.username),
  );

  return (
    <GradientBackground>
      <View style={styles.screen}>
        <ScreenHeader title={t('groups.membersOf')} onBack={onExit} />

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {detail === null ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {detail.description ? (
              <Text style={[styles.description, { color: colors.textSecondary }]}>{detail.description}</Text>
            ) : null}

            {members.map((m) => (
              <View
                key={m.userId}
                style={[styles.row, { backgroundColor: colors.controlTrack }]}
              >
                <InitialsAvatar name={m.username} id={m.userId} size={40} photoUrl={m.avatarUrl} />
                <View style={styles.main}>
                  <Text style={[styles.name, { color: colors.textPrimary }]}>{m.username}</Text>
                  <Text style={[styles.role, { color: colors.textSecondary }]}>{roleName(m.role)}</Text>
                </View>

                {busy?.startsWith(m.userId) ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <View style={styles.actions}>
                    {maySetRole && m.userId !== me && m.role !== 'owner' ? (
                      <Pressable
                        onPress={() =>
                          void act(`${m.userId}:role`, () =>
                            setMemberRole(client, groupId, m.userId, m.role === 'moderator' ? 'member' : 'moderator'),
                          )
                        }
                        accessibilityRole="button"
                        hitSlop={6}
                      >
                        <Text style={[styles.action, { color: colors.primary }]}>
                          {m.role === 'moderator' ? t('groups.role.member') : t('groups.role.admin')}
                        </Text>
                      </Pressable>
                    ) : null}
                    {myRole === 'owner' && m.userId !== me ? (
                      <Pressable onPress={() => confirmTransfer(m)} accessibilityRole="button" hitSlop={6}>
                        <Icon name="star" size={18} tone="primary" />
                      </Pressable>
                    ) : null}
                    {mayManage(m) ? (
                      <Pressable onPress={() => confirmRemove(m)} accessibilityRole="button" hitSlop={6}>
                        <Icon name="close" size={18} color={colors.danger} />
                      </Pressable>
                    ) : null}
                  </View>
                )}
              </View>
            ))}

            {/*
              The owner cannot leave — the server refuses, since a club with no
              owner has nobody to hand it on — so they are not offered a button
              that fails. They transfer first.
            */}
            {myRole !== null && myRole !== 'owner' ? (
              <Pressable onPress={confirmLeave} accessibilityRole="button" style={styles.leave}>
                <Text style={[styles.leaveText, { color: colors.danger }]}>
                  {t('groups.leave', { group: detail.name })}
                </Text>
              </Pressable>
            ) : null}
          </ScrollView>
        )}
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { padding: spacing.lg, gap: spacing.xs },
  description: { fontSize: typography.sizes.sm, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  main: { flex: 1 },
  name: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  role: { fontSize: typography.sizes.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  action: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  leave: { marginTop: spacing.lg, alignItems: 'center', paddingVertical: spacing.md },
  leaveText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  error: { textAlign: 'center', fontSize: typography.sizes.sm, paddingHorizontal: spacing.lg },
});
