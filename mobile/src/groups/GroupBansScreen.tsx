import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { AccessibilityInfo, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { GroupBan } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import type { ApiError } from '../api/types';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import type { RootNavigation } from '../navigation/rootStack';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useDirection } from '../reports/direction';
import { formatUntil } from '../reports/sendErrors';
import { EmptyState } from '../theme/EmptyState';
import { ClayButton, ErrorRetry, GradientBackground } from '../theme/glass';
import { SkeletonList } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { groupBans, unbanMember } from './api';
import { groupError } from './groupError';

/**
 * Who is banned from a group, for its owner and admins, newest first: until
 * when (or for good), the reason they were given, who banned them, and
 * whether their requests to come back were stopped. Unban asks first, and
 * says it does not add them back — they can join, or be added, again.
 */
export function GroupBansScreen({ groupId, onExit }: { groupId: string; onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const [bans, setBans] = useState<GroupBan[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      setError(null);
      void groupBans(client, groupId).then((res) => {
        if (!live) return;
        if (res.ok) setBans(res.data.bans);
        else setError(res.error);
      });
      return () => {
        live = false;
      };
      // a retry asks again
    }, [client, groupId, attempt]),
  );

  const unban = async (ban: GroupBan): Promise<void> => {
    setFailed(null);
    const res = await unbanMember(client, groupId, ban.userId);
    if (!res.ok) {
      haptic('wrong');
      setFailed(groupError(res.error, t));
      return;
    }
    haptic('correct');
    AccessibilityInfo.announceForAccessibility?.(t('groups.bans.unbanned', { name: ban.username }));
    setBans((list) => (list ?? []).filter((b) => b.userId !== ban.userId));
  };

  const confirmUnban = (ban: GroupBan): void => {
    Alert.alert(t('groups.bans.unbanFrom', { name: ban.username }), t('groups.bans.unbanBody', { name: ban.username }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('groups.bans.unban'), onPress: () => void unban(ban) },
    ]);
  };

  return (
    <GradientBackground>
      <ScreenHeader title={t('groups.bans.title')} onBack={onExit} hairline />
      <FlatList
        data={bans ?? []}
        keyExtractor={(b) => b.userId}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          failed ? (
            <Text style={[styles.failed, { color: colors.danger }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {failed}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          bans === null ? (
            error ? (
              <ErrorRetry message={groupError(error, t)} onRetry={() => setAttempt((n) => n + 1)} />
            ) : (
              <SkeletonList count={3} />
            )
          ) : (
            <EmptyState title={t('groups.bans.empty')} body={t('groups.bans.emptyBody')} />
          )
        }
        renderItem={({ item: b }) => {
          const until = b.until ? t('groups.bans.until', { date: formatUntil(b.until, locale) }) : t('groups.ban.forGood');
          return (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Pressable
                onPress={() => navigation.navigate('UserProfile', { userId: b.userId })}
                accessibilityRole="button"
                accessibilityLabel={`${b.username}, ${until}`}
                style={[styles.who, { flexDirection: dir.row }]}
              >
                <InitialsAvatar name={b.username} id={b.userId} size={44} photoUrl={b.avatarUrl} />
                <View style={styles.names}>
                  <Text style={[styles.name, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
                    {b.username}
                  </Text>
                  <Text style={[styles.sub, dir.text, { color: colors.textPrimary }]}>{until}</Text>
                </View>
              </Pressable>
              {b.reason ? <Text style={[styles.sub, dir.free, { color: colors.textPrimary }]}>{t('groups.standing.reason', { reason: b.reason })}</Text> : null}
              <Text style={[styles.sub, dir.text, { color: colors.textSecondary }]}>
                {b.bannedBy ? t('groups.bans.by', { name: b.bannedBy }) : t('groups.bans.byGone')}
                {b.requestsClosed ? ` · ${t('groups.bans.requestsClosed')}` : ''}
              </Text>
              <ClayButton
                label={t('groups.bans.unban')}
                accessibilityLabel={t('groups.bans.unbanFrom', { name: b.username })}
                variant="outline"
                onPress={() => confirmUnban(b)}
              />
            </View>
          );
        }}
      />
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  list: { padding: layout.gutter, gap: layout.rowGap },
  failed: { fontSize: typography.sizes.sm, lineHeight: 20, textAlign: 'center', paddingBottom: spacing.sm },
  card: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  who: { alignItems: 'center', gap: spacing.md - 4 },
  names: { flex: 1, gap: 2 },
  name: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  sub: { fontSize: typography.sizes.sm, lineHeight: 20 },
});
