import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { canEditGroup, canManage, canModerateGroup, canSetRole, roleRank, type Role } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { haptic } from '../feedback/haptics';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { display } from '../theme/fonts';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { EmptyState } from '../theme/EmptyState';
import { showActions } from '../theme/actionSheet';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useTheme } from '../theme/ThemeProvider';
import { ScreenHeader } from '../navigation/ScreenHeader';
import type { RootNavigation } from '../navigation/rootStack';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { ReportSheet } from '../reports/ReportSheet';
import { SettingsNote, SettingsRow, SettingsSection } from '../settings/list';
import { AddFriendsSheet } from './AddFriendsSheet';
import { GroupAvatar } from './GroupAvatar';
import { BanSheet } from './BanSheet';
import { useClearChat } from './clearing';
import { groupError } from './groupError';
import { usePullRefresh } from '../net/usePullRefresh';
import {
  deleteGroup,
  groupDetail,
  leaveGroup,
  removeMember,
  setMemberRole,
  transferOwnership,
  type GroupDetail,
  type GroupMember,
} from './api';
import { Loading } from '../theme/Loading';

/**
 * A group's own page (KUR-084): what it is, who is in it, and what you may do.
 * A member's page only: nobody else is shown a group at all, so anyone else
 * who lands here is told there is no such group.
 *
 * At the top the group as it presents itself — its picture in its rounded
 * square, its name, what it is about and how many are in it. Then, always in
 * the same order, so the page reads the same for everyone and only grows with
 * what the reader may do:
 *
 * - the members, one quiet row each: the face, the name, and Owner or Admin
 *   under it where that is so. For the owner and admins "Add friends" leads
 *   them, since adding a friend is the only way anyone comes in. Nothing to
 *   tap on a row but the row itself and, where you may do something about
 *   that person, a ⋯ at its end that lists only what you may — so no row
 *   carries three buttons that crowd its name, and no button says "Admin"
 *   when it means "make admin" — Remove and Ban among them for anyone the
 *   reader outranks;
 * - for the owner and admins: the requests to come back, only while somebody
 *   asks (with how many wait); who is banned; and "Edit group";
 * - clearing the chat (for oneself, or as its owner or an admin for everyone);
 * - last, apart: report the group, leave it, or, for its owner, delete it.
 *
 * Who may do what comes from `@kurda/shared`, which is what the server decides
 * with: this screen only chooses what to show.
 */
export function GroupMembersScreen({
  groupId,
  onExit,
  onLeft,
  onEdit,
}: {
  groupId: string;
  onExit: () => void;
  /** left or deleted: the group is gone from under the thread too */
  onLeft: () => void;
  onEdit: () => void;
}): React.JSX.Element {
  const { client, user } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const navigation = useNavigation<RootNavigation>();
  const me = user?.id ?? '';

  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [banning, setBanning] = useState<GroupMember | null>(null);
  const [adding, setAdding] = useState(false);
  // the server answered that there is no such group for this reader (deleted, or they are not in it)
  const [missing, setMissing] = useState(false);

  const load = useCallback(
    () =>
      groupDetail(client, groupId).then((res) => {
        if (res.ok) {
          setDetail(res.data);
          // someone banned is told a group's name and nothing of its people: this page is not theirs either
          setMissing(res.data.myRole === null);
        } else if (res.error.code === 'GROUP_NOT_FOUND' || res.error.status === 404) setMissing(true);
        else setError(describeError(res.error, t));
      }),
    [client, groupId, t],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  // pulled down, the group and its members are read again
  const pull = usePullRefresh(load);

  const act = async (key: string, run: () => Promise<{ ok: boolean; error?: ApiError }>): Promise<boolean> => {
    setBusy(key);
    setError(null);
    const res = await run();
    setBusy(null);
    if (res.ok) {
      haptic('correct');
      void load();
      return true;
    }
    haptic('wrong');
    setError(res.error ? groupError(res.error, t) : t('error.generic'));
    return false;
  };

  const myRole = detail?.myRole ?? null;
  const groupName = detail?.name ?? '';
  const clearChat = useClearChat(groupId, detail?.memberCount ?? 0, setError);
  const roleName = (role: Role): string | null => (role === 'owner' ? t('groups.role.owner') : role === 'moderator' ? t('groups.role.admin') : null);

  /** Only what you may do about this person, the one that cannot be undone last and in red. */
  const memberActions = (m: GroupMember): void => {
    const actions = [{ label: t('groups.viewProfile'), onPress: () => navigation.navigate('UserProfile', { userId: m.userId }) }];
    if (myRole && m.userId !== me && m.role !== 'owner' && canSetRole(myRole, 'moderator')) {
      actions.push(
        m.role === 'moderator'
          ? { label: t('groups.removeAdmin'), onPress: () => void act(m.userId, () => setMemberRole(client, groupId, m.userId, 'member')) }
          : { label: t('groups.makeAdmin'), onPress: () => void act(m.userId, () => setMemberRole(client, groupId, m.userId, 'moderator')) },
      );
    }
    if (myRole === 'owner' && m.userId !== me) {
      // the one handover nobody can undo for themselves, so it asks first and says what it costs
      actions.push({
        label: t('groups.makeOwner'),
        onPress: () =>
          Alert.alert(t('groups.makeOwner'), t('groups.makeOwnerWarning', { name: m.username }), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('groups.makeOwner'), style: 'destructive', onPress: () => void act(m.userId, () => transferOwnership(client, groupId, m.userId)) },
          ]),
      });
    }
    const removable = myRole !== null && m.userId !== me && canManage(myRole, m.role);
    showActions({
      title: m.username,
      cancel: t('common.cancel'),
      actions: [
        ...actions,
        ...(removable
          ? [
              {
                label: t('groups.removeMember'),
                destructive: true,
                onPress: () =>
                  // removed, they can be added again; banned, they come back only by asking
                  Alert.alert(t('groups.removeMember'), t('groups.removeConfirm', { name: m.username, group: groupName }), [
                    { text: t('common.cancel'), style: 'cancel' },
                    { text: t('groups.remove'), style: 'destructive', onPress: () => void act(m.userId, () => removeMember(client, groupId, m.userId)) },
                  ]),
              },
              { label: t('groups.ban.action'), destructive: true, onPress: () => setBanning(m) },
            ]
          : []),
      ],
    });
  };

  const confirmLeave = (): void => {
    Alert.alert(t('groups.leave', { group: groupName }), '', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('groups.leave', { group: groupName }),
        style: 'destructive',
        onPress: () => void act('leave', () => leaveGroup(client, groupId)).then((ok) => ok && onLeft()),
      },
    ]);
  };

  const confirmDelete = (): void => {
    Alert.alert(t('groups.delete'), t('groups.deleteWarning', { group: groupName }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('groups.delete'),
        style: 'destructive',
        onPress: () => void act('delete', () => deleteGroup(client, groupId)).then((ok) => ok && onLeft()),
      },
    ]);
  };

  const members = [...(detail?.members ?? [])].sort((a, b) => roleRank(b.role) - roleRank(a.role) || a.username.localeCompare(b.username));
  const editable = canEditGroup(myRole);
  const moderator = canModerateGroup(myRole);
  const waiting = detail?.pendingRequests ?? 0;

  return (
    <GradientBackground>
      <View style={styles.screen}>
        <ScreenHeader title={t('groups.info')} onBack={onExit} />
        {missing ? (
          <EmptyState title={t('groups.missing.title')} body={t('groups.missing.body')} action={{ label: t('groups.missing.back'), onPress: onExit }} />
        ) : detail === null ? (
          error ? (
            <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
          ) : (
            <InfoSkeleton />
          )
        ) : (
          <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} refreshControl={pull}>
            <View style={styles.head}>
              <GroupAvatar name={detail.name} id={detail.id} size={HEAD_AVATAR} photoUrl={detail.photoUrl} />
              <Text style={[styles.title, dir.free, styles.centred, { color: colors.textPrimary }]} accessibilityRole="header">
                {detail.name}
              </Text>
              {detail.description ? <Text style={[styles.about, dir.free, styles.centred, { color: colors.textSecondary }]}>{detail.description}</Text> : null}
              <Text style={[styles.meta, { color: colors.textSecondary }]}>{t('groups.memberCount', { count: detail.memberCount })}</Text>
            </View>

            {error ? (
              <Text style={[styles.error, { color: colors.danger }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
                {error}
              </Text>
            ) : null}

            <SettingsSection title={t('groups.members')} footer={editable ? t('groups.adminHint') : undefined}>
              {/* the one way anyone comes into a group, so it leads the people who are in it */}
              {moderator ? <SettingsRow icon="user-plus" title={t('groups.addFriends.title')} onPress={() => setAdding(true)} opens={false} /> : null}
              {members.map((m) => (
                <MemberRow
                  key={m.userId}
                  member={m}
                  self={m.userId === me}
                  role={roleName(m.role)}
                  busy={busy === m.userId}
                  onOpen={() => (m.userId === me ? undefined : navigation.navigate('UserProfile', { userId: m.userId }))}
                  onMore={m.userId === me ? undefined : () => memberActions(m)}
                />
              ))}
            </SettingsSection>

            {moderator ? (
              <SettingsSection>
                {/* only while somebody asks: an empty list is nothing to open */}
                {waiting > 0 ? (
                  <SettingsRow
                    icon="mail"
                    title={t('groups.requests.title')}
                    badge={{ count: waiting, label: t('groups.requests.waiting', { count: waiting }) }}
                    onPress={() => navigation.navigate('GroupRequests', { groupId })}
                  />
                ) : null}
                <SettingsRow icon="block" title={t('groups.bans.title')} onPress={() => navigation.navigate('GroupBans', { groupId })} />
                {editable ? <SettingsRow icon="pencil" title={t('groups.edit')} onPress={onEdit} /> : null}
              </SettingsSection>
            ) : null}

            {myRole !== null ? (
              <SettingsSection>
                <SettingsRow icon="eye-off" title={t('groups.clear.forMe')} destructive onPress={() => clearChat('me')} opens={false} />
                {moderator ? <SettingsRow icon="trash" title={t('groups.clear.forEveryone')} destructive onPress={() => clearChat('everyone')} opens={false} /> : null}
              </SettingsSection>
            ) : null}
            {myRole !== null ? (
              <SettingsSection>
                {myRole !== 'owner' ? (
                  <SettingsRow icon="flag" title={t('groups.report')} onPress={() => setReporting(true)} opens={false} />
                ) : null}
                {myRole !== 'owner' ? (
                  <SettingsRow icon="sign-out" title={t('groups.leave', { group: detail.name })} destructive onPress={confirmLeave} opens={false} />
                ) : (
                  <>
                    {/* the server refuses an owner who leaves, so they are told what to do first instead */}
                    {members.length > 1 ? <SettingsNote>{t('groups.ownerLeaveHint')}</SettingsNote> : null}
                    <SettingsRow icon="trash" title={t('groups.delete')} destructive onPress={confirmDelete} opens={false} />
                  </>
                )}
              </SettingsSection>
            ) : null}
            {busy === 'leave' || busy === 'delete' ? <Loading style={styles.working} /> : null}
          </ScrollView>
        )}
        {reporting ? (
          <ReportSheet visible target={{ type: 'group', groupId }} name={groupName} onClose={() => setReporting(false)} onLeftGroup={onLeft} />
        ) : null}
        {moderator && detail ? (
          <AddFriendsSheet
            visible={adding}
            groupId={groupId}
            memberIds={detail.members.map((m) => m.userId)}
            onClose={() => {
              setAdding(false);
              void load();
            }}
            onFindPeople={() => {
              setAdding(false);
              navigation.navigate('Tabs', { screen: 'Search' });
            }}
          />
        ) : null}
        <BanSheet
          groupId={groupId}
          member={banning}
          onClose={() => setBanning(null)}
          onBanned={() => {
            setBanning(null);
            void load();
          }}
        />
      </View>
    </GradientBackground>
  );
}

/** One member: the face, the name, Owner or Admin under it, and a ⋯ where there is something you may do. */
function MemberRow({
  member,
  self,
  role,
  busy,
  onOpen,
  onMore,
}: {
  member: GroupMember;
  self: boolean;
  role: string | null;
  busy: boolean;
  onOpen: () => void;
  onMore?: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const name = self ? `${member.username} · ${t('games.you')}` : member.username;
  return (
    <Pressable
      onPress={onOpen}
      disabled={self}
      accessibilityRole={self ? undefined : 'button'}
      accessibilityLabel={[name, role].filter(Boolean).join(', ')}
      style={({ pressed }) => [styles.member, { flexDirection: dir.row }, pressed && !self && { backgroundColor: colors.controlTrack }]}
    >
      <InitialsAvatar name={member.username} id={member.userId} size={MEMBER_AVATAR} photoUrl={member.avatarUrl} />
      <View style={styles.memberWords}>
        <Text style={[styles.memberName, dir.free, { color: colors.textPrimary }]} numberOfLines={1}>
          {name}
        </Text>
        {role ? <Text style={[styles.memberRole, dir.text, { color: colors.textSecondary }]}>{role}</Text> : null}
      </View>
      {busy ? (
        <Loading style={styles.more} />
      ) : onMore ? (
        <Pressable onPress={onMore} hitSlop={4} accessibilityRole="button" accessibilityLabel={t('post.menu')} style={styles.more}>
          <Icon name="more" size={22} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

/** The page while it loads, in its own shape: the picture, the name, a few members. */
function InfoSkeleton(): React.JSX.Element {
  return (
    <View style={styles.page}>
      <View style={styles.head}>
        <Skeleton width={HEAD_AVATAR} height={HEAD_AVATAR} radius={Math.round(HEAD_AVATAR * 0.22)} />
        <SkeletonText size={typography.sizes.xl} width={180} align="center" />
        <SkeletonText size={typography.sizes.sm} width={240} align="center" />
      </View>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.member}>
          <Skeleton width={MEMBER_AVATAR} height={MEMBER_AVATAR} radius={radii.pill} />
          <View style={styles.memberWords}>
            <SkeletonText size={typography.sizes.md} width={i % 2 ? '40%' : '56%'} />
          </View>
        </View>
      ))}
    </View>
  );
}

const HEAD_AVATAR = 96;
const MEMBER_AVATAR = 40;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  page: { paddingBottom: spacing.xxl },
  head: { alignItems: 'center', gap: spacing.xs, paddingHorizontal: layout.gutter, paddingTop: spacing.md, paddingBottom: spacing.lg },
  title: { ...display(typography.sizes.xl), textAlign: 'center', marginTop: spacing.sm },
  about: { fontSize: typography.sizes.md, lineHeight: 22, textAlign: 'center' },
  meta: { fontSize: typography.sizes.sm, textAlign: 'center' },
  // under the picture everything is centred, whichever way it reads
  centred: { textAlign: 'center' },
  member: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: layout.gutter, minHeight: 60, paddingVertical: spacing.sm },
  memberWords: { flex: 1, minWidth: 0, gap: 1 },
  memberName: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  memberRole: { fontSize: typography.sizes.xs },
  more: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center', marginEnd: -spacing.sm },
  error: { textAlign: 'center', fontSize: typography.sizes.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  working: { marginTop: spacing.md },
});
