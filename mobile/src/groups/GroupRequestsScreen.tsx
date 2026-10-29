import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { AccessibilityInfo, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { requestCooldownDays, type GroupRejoinRequest } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import type { ApiError } from '../api/types';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import type { RootNavigation } from '../navigation/rootStack';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { noticeTime } from '../notifications/inbox';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useDirection } from '../reports/direction';
import { SettingsSwitch } from '../settings/list';
import { BottomSheet } from '../theme/BottomSheet';
import { EmptyState } from '../theme/EmptyState';
import { ClayButton, ErrorRetry, GradientBackground } from '../theme/glass';
import { SkeletonList } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { approveRejoin, declineRejoin, rejoinRequests } from './api';
import { groupError } from './groupError';

/**
 * The requests to come back to a group, for its owner and admins, oldest
 * first: who asks, what they wrote, when, and how many times they were
 * turned down before — then Approve or Decline.
 *
 * Approving lifts the ban and adds them back where every usual rule allows
 * (the server says whether it could); declining asks once more, and can stop
 * that person's requests here for good. An answered request leaves the list
 * at once, and comes back if the answer did not get through.
 */
export function GroupRequestsScreen({ groupId, onExit }: { groupId: string; onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const [requests, setRequests] = useState<GroupRejoinRequest[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [declining, setDeclining] = useState<GroupRejoinRequest | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      setError(null);
      void rejoinRequests(client, groupId).then((res) => {
        if (!live) return;
        if (res.ok) setRequests(res.data.requests);
        else setError(res.error);
      });
      return () => {
        live = false;
      };
      // a retry asks again
    }, [client, groupId, attempt]),
  );

  const without = (userId: string) => setRequests((list) => (list ?? []).filter((r) => r.userId !== userId));
  const putBack = (request: GroupRejoinRequest) =>
    setRequests((list) => [...(list ?? []), request].sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt)));

  const approve = async (request: GroupRejoinRequest): Promise<void> => {
    setFailed(null);
    without(request.userId);
    const res = await approveRejoin(client, groupId, request.userId);
    if (!res.ok) {
      haptic('wrong');
      setFailed(groupError(res.error, t));
      putBack(request);
      return;
    }
    haptic('correct');
    AccessibilityInfo.announceForAccessibility?.(
      t(res.data.rejoined ? 'groups.requests.approved' : 'groups.requests.approvedNotAdded', { name: request.username }),
    );
  };

  return (
    <GradientBackground>
      <ScreenHeader title={t('groups.requests.title')} onBack={onExit} hairline />
      <FlatList
        data={requests ?? []}
        keyExtractor={(r) => r.userId}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          failed ? (
            <Text style={[styles.failed, { color: colors.danger }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {failed}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          requests === null ? (
            error ? (
              <ErrorRetry message={groupError(error, t)} onRetry={() => setAttempt((n) => n + 1)} />
            ) : (
              <SkeletonList count={3} />
            )
          ) : (
            <EmptyState title={t('groups.requests.empty')} body={t('groups.requests.emptyBody')} />
          )
        }
        renderItem={({ item: r }) => (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Pressable
              onPress={() => navigation.navigate('UserProfile', { userId: r.userId })}
              accessibilityRole="button"
              accessibilityLabel={`${r.username}, ${noticeTime(r.sentAt, t, locale)}`}
              style={[styles.who, { flexDirection: dir.row }]}
            >
              <InitialsAvatar name={r.username} id={r.userId} size={44} photoUrl={r.avatarUrl} />
              <View style={styles.names}>
                <Text style={[styles.name, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
                  {r.username}
                </Text>
                <Text style={[styles.sub, dir.text, { color: colors.textSecondary }]}>{noticeTime(r.sentAt, t, locale)}</Text>
              </View>
            </Pressable>
            {r.note ? (
              <Text style={[styles.note, dir.free, { color: colors.textPrimary, backgroundColor: colors.controlTrack }]}>{r.note}</Text>
            ) : null}
            {r.declines > 0 ? (
              <Text style={[styles.sub, dir.text, { color: colors.textSecondary }]}>
                {r.declines === 1 ? t('groups.requests.declinedOnce') : t('groups.requests.declinedMany', { count: r.declines })}
              </Text>
            ) : null}
            <View style={[styles.actions, { flexDirection: dir.row }]}>
              <ClayButton
                label={t('groups.requests.approve')}
                accessibilityLabel={t('groups.requests.approveFrom', { name: r.username })}
                tone="primary"
                onPress={() => void approve(r)}
                style={styles.action}
              />
              <ClayButton
                label={t('groups.requests.decline')}
                accessibilityLabel={t('groups.requests.declineFrom', { name: r.username })}
                onPress={() => setDeclining(r)}
                style={styles.action}
              />
            </View>
          </View>
        )}
      />
      <DeclineSheet
        groupId={groupId}
        request={declining}
        onClose={() => setDeclining(null)}
        onDeclined={(userId) => {
          setDeclining(null);
          without(userId);
        }}
      />
    </GradientBackground>
  );
}

/**
 * Turning a request down, asked once more: how long they will wait before
 * they may ask again (each request turned down makes it longer), and a switch
 * to stop their requests to this group altogether.
 */
function DeclineSheet({
  groupId,
  request,
  onClose,
  onDeclined,
}: {
  groupId: string;
  request: GroupRejoinRequest | null;
  onClose: () => void;
  onDeclined: (userId: string) => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [stop, setStop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = request?.username ?? '';
  const days = requestCooldownDays((request?.declines ?? 0) + 1);

  useEffect(() => {
    setStop(false);
    setError(null);
  }, [request]);

  const decline = async (): Promise<void> => {
    if (!request) return;
    setBusy(true);
    setError(null);
    const res = await declineRejoin(client, groupId, request.userId, stop);
    setBusy(false);
    if (!res.ok) {
      haptic('wrong');
      setError(groupError(res.error, t));
      return;
    }
    haptic('correct');
    AccessibilityInfo.announceForAccessibility?.(t('groups.requests.declined'));
    onDeclined(request.userId);
  };

  return (
    <BottomSheet visible={request !== null} onClose={onClose} title={t('groups.requests.declineTitle', { name })} dismissible={!busy}>
      <Text style={[styles.sheetText, dir.text, { color: colors.textSecondary }]}>
        {stop ? t('groups.requests.stopHint', { name }) : days === 1 ? t('groups.requests.waitOne', { name }) : t('groups.requests.waitMany', { name, count: days })}
      </Text>
      <View style={styles.edge}>
        <SettingsSwitch title={t('groups.requests.stop', { name })} value={stop} onValueChange={setStop} />
      </View>
      {error ? (
        <Text style={[styles.sheetText, dir.text, { color: colors.danger }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <ClayButton label={t('groups.requests.decline')} tone="danger" size="large" busy={busy} onPress={() => void decline()} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: { padding: layout.gutter, gap: layout.rowGap },
  failed: { fontSize: typography.sizes.sm, lineHeight: 20, textAlign: 'center', paddingBottom: spacing.sm },
  card: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.md - 4 },
  who: { alignItems: 'center', gap: spacing.md - 4 },
  names: { flex: 1, gap: 2 },
  name: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  sub: { fontSize: typography.sizes.sm },
  note: { fontSize: typography.sizes.md, lineHeight: 22, borderRadius: radii.md, overflow: 'hidden', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  actions: { gap: spacing.sm },
  action: { flex: 1 },
  sheetText: { fontSize: typography.sizes.sm, lineHeight: 20 },
  // a list row inside the sheet runs edge to edge, as one in Settings does
  edge: { marginHorizontal: -layout.gutter },
});
