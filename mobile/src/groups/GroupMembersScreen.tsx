import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { canEditGroup, canManage, canModerateGroup, canSetRole, roleRank, type Role } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { haptic } from '../feedback/haptics';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { display } from '../theme/fonts';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { ErrorRetry, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { EmptyState } from '../theme/EmptyState';
import { showActions } from '../theme/actionSheet';
import { Avatar } from '../profile/Avatar';
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
import { membersLine } from './memberCount';
import { usePullRefresh } from '../net/usePullRefresh';
import {
  deleteGroup,
  groupDetail,
  useLeaveGroup,
  removeMember,
  setMemberRole,
  transferOwnership,
  type GroupDetail,
  type GroupMember,
} from './api';
import { Loading } from '../theme/Loading';
import { heldDim } from '../theme/MotionParts';

/**
 * A group's own page, for members only (anyone else is told there is no such group): the group as it presents itself,
 * then always in this order its members (with "Add friends" first for the owner and admins), the requests to come back
 * and bans for the owner and admins, clearing the chat, and last report, leave or delete.
 *
 * A member row has one ⋯ listing only what the reader may do about that person. Who may do what comes from
 * `@kurda/shared`, as on the server; this screen only chooses what to show.
 */
export function GroupMembersScreen({
  groupId,
  onExit,
  onLeft,
  onEdit,
}: {
  groupId: string;
  onExit: () => void;
  /** Left or deleted: the group is gone from under the thread too. */
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
  // The page could not be read at all: said, with the way to ask again.
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [reporting, setReporting] = useState(false);
  const [banning, setBanning] = useState<GroupMember | null>(null);
  const [adding, setAdding] = useState(false);
  // The server answered that there is no such group for this reader (deleted, or they are not in it).
  const [missing, setMissing] = useState(false);

  const load = useCallback(
    () =>
      groupDetail(client, groupId).then((res) => {
        if (res.ok) {
          setDetail(res.data);
          setLoadError(null);
          // Someone banned is told a group's name and nothing of its people: this page is not theirs either.
          setMissing(res.data.myRole === null);
        } else if (res.error.code === 'GROUP_NOT_FOUND' || res.error.status === 404) setMissing(true);
        else setLoadError(res.error);
      }),
    [client, groupId],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  // Pulled down, the group and its members are read again.
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
  const leaveNow = useLeaveGroup();
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
      // The one handover nobody can undo for themselves, so it asks first and says what it costs.
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
                  // Removed, they can be added again; banned, they come back only by asking.
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
        onPress: () => {
          leaveNow(groupId);
          onLeft();
        },
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
          loadError ? (
            <ErrorRetry
              message={describeError(loadError, t)}
              onRetry={() => {
                setLoadError(null);
                void load();
              }}
            />
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
              <Text style={[styles.meta, { color: colors.textSecondary }]}>{membersLine(t, detail.memberCount)}</Text>
            </View>

            {error ? (
              <Text style={[styles.error, { color: colors.danger }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
                {error}
              </Text>
            ) : null}

            <SettingsSection title={t('groups.members')} footer={editable ? t('groups.adminHint') : undefined}>
              {/* The one way anyone comes into a group, so it leads the people in it. */}
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
                {/* Only while somebody asks: an empty list is nothing to open. */}
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
                    {/* The server refuses an owner who leaves, so they are told what to do first instead. */}
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
              navigation.navigate('Search');
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
      <Avatar name={member.username} size={MEMBER_AVATAR} photoUrl={member.avatarUrl} />
      <View style={styles.memberWords}>
        <Text style={[styles.memberName, dir.free, { color: colors.textPrimary }]} numberOfLines={1}>
          {name}
        </Text>
        {role ? <Text style={[styles.memberRole, dir.text, { color: colors.textSecondary }]}>{role}</Text> : null}
      </View>
      {busy ? (
        <Loading style={styles.more} />
      ) : onMore ? (
        <Pressable
          onPress={onMore}
          // A fingertip past its edges, still inside the row: a near miss opens the menu rather than the profile behind
          // it.
          reach="open"
          accessibilityRole="button"
          accessibilityLabel={t('post.menu')}
          style={({ pressed }) => [styles.more, pressed && heldDim]}
        >
          <Icon name="more" size={22} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

/** The page while it loads, in its own shape. */
function InfoSkeleton(): React.JSX.Element {
  return (
    <View style={styles.page}>
      <View style={styles.head}>
        <Skeleton width={HEAD_AVATAR} height={HEAD_AVATAR} radius={Math.round(HEAD_AVATAR * 0.22)} />
        <SkeletonText size={typography.sizes.title} width={180} align="center" />
        <SkeletonText size={typography.sizes.text} width={240} align="center" />
      </View>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.member}>
          <Skeleton width={MEMBER_AVATAR} height={MEMBER_AVATAR} radius={radii.pill} />
          <View style={styles.memberWords}>
            <SkeletonText size={typography.sizes.text} width={i % 2 ? '40%' : '56%'} />
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
  title: { ...display(typography.sizes.title), textAlign: 'center', marginTop: spacing.sm },
  about: { fontSize: typography.sizes.text, lineHeight: 22, textAlign: 'center' },
  meta: { fontSize: typography.sizes.text, textAlign: 'center' },
  // Under the picture everything is centred, whichever way it reads.
  centred: { textAlign: 'center' },
  member: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: layout.gutter, minHeight: 60, paddingVertical: spacing.sm },
  memberWords: { flex: 1, minWidth: 0, gap: 1 },
  memberName: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  memberRole: { fontSize: typography.sizes.text },
  more: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center', marginEnd: -spacing.sm },
  error: { textAlign: 'center', fontSize: typography.sizes.text, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  working: { marginTop: spacing.md },
});
