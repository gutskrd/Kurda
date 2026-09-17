import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import type { RootNavigation } from '../navigation/rootStack';
import { radii, spacing, typography } from '../theme/tokens';
import { GradientBackground } from '../theme/glass';
import { Icon, type IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { friendActionLabel, isActionable, type FriendStatus } from './format';
import { tierMeta } from '../leagues/format';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { ReportUserSheet } from './ReportUserSheet';
import { blockUser } from './blocks';
import { useI18n } from '../i18n/I18nContext';

interface Profile {
  userId: string;
  username: string;
  displayName: string | null;
  /** the server resolves this (uploaded photo → chosen avatar); the phone was dropping it */
  avatarUrl?: string | null;
  friendStatus: FriendStatus;
  private: boolean;
  xp?: number;
  streak?: number;
  tier?: string;
  rating?: number;
  achievements?: number;
}

/** Public profile with a friend action + block (KUR-082). */
export function PublicProfileScreen({ userId, onExit }: { userId: string; onExit: () => void }) {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(() => {
    void client.get<Profile>(`/users/${userId}`).then((res) => {
      if (res.ok) {
        setProfile(res.data);
        setError(null);
      } else if (res.error.kind === 'client' && res.error.status === 404) {
        setNotFound(true); // genuinely unavailable — distinct from offline/server error
      } else {
        setError(res.error);
      }
    });
  }, [client, userId]);

  useFocusEffect(useCallback(() => load(), [load]));

  const act = useCallback(
    async (status: FriendStatus) => {
      setBusy(true);
      if (status === 'none') await client.post('/friends/requests', { userId });
      else if (status === 'pending_in') await client.post(`/friends/requests/${userId}/accept`);
      setBusy(false);
      load();
    },
    [client, userId, load],
  );

  const block = useCallback(() => {
    Alert.alert(t('moderation.blockWhoTitle', { name: profile?.username ?? '' }), t('moderation.blockNote'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('moderation.block'),
        style: 'destructive',
        onPress: () => {
          void blockUser(client, userId).then(onExit);
        },
      },
    ]);
  }, [client, userId, onExit]);

  if (notFound) {
    return (
      <GradientBackground>
        <View style={styles.screen}>
          <Header onExit={onExit} />
          <View style={styles.centered}><Text style={[styles.dim, { color: colors.textSecondary }]}>{t('profile.unavailable')}</Text></View>
        </View>
      </GradientBackground>
    );
  }
  return (
    <GradientBackground>
      <View style={styles.screen}>
        <Header onExit={onExit} />
        <AsyncBoundary loading={!profile} error={!profile ? error : null} onRetry={load}>
          {() => {
            if (!profile) return null;
            const labelKey = friendActionLabel(profile.friendStatus);
            return (
        <View style={[styles.card, { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder }]}>
          <InitialsAvatar name={profile.displayName ?? profile.username} id={profile.userId} size={96} photoUrl={profile.avatarUrl} />
          <Text style={[styles.username, { color: colors.textPrimary }]}>{profile.username}</Text>
          {profile.displayName ? <Text style={[styles.display, { color: colors.textSecondary }]}>{profile.displayName}</Text> : null}

          {profile.private ? (
            <Text style={[styles.dim, { color: colors.textSecondary }]}>{t('profile.private')}</Text>
          ) : (
            <View style={styles.stats}>
              <Stat label={t('profile.streak')} value={`${profile.streak ?? 0}`} icon="flame" iconColor={colors.danger} />
              <Stat label="XP" value={`${profile.xp ?? 0}`} />
              <Stat label={t('profile.league')} value={tierMeta(profile.tier ?? 'bronze').label} />
              <Stat label={t('profile.badges')} value={`${profile.achievements ?? 0}`} />
            </View>
          )}

          {profile.friendStatus !== 'self' ? (
            <View style={styles.actions}>
              {profile.friendStatus === 'friends' ? (
                <>
                  <Pressable
                    onPress={() => navigation.navigate('Chat', { userId: profile.userId, username: profile.username })}
                    style={[styles.primary, { backgroundColor: colors.primary }]}
                  >
                    <Text style={[styles.primaryText, { color: colors.textOnPrimary }]}>{t('profile.message')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      void client.post('/challenges', { userId: profile.userId }).then((res) => {
                        if (res.ok) Alert.alert(t('profile.challengeSent'), t('profile.challengeWaiting'));
                        else Alert.alert(t('profile.challengeFailed'), describeError(res.error, t));
                      })
                    }
                    style={[styles.secondary, { borderColor: colors.accent }]}
                  >
                    <Icon name="play" size={18} color={colors.accent} />
                    <Text style={[styles.secondaryText, { color: colors.accent }]}>{t('profile.challenge1v1')}</Text>
                  </Pressable>
                </>
              ) : null}
              {labelKey ? (
                <Pressable
                  onPress={() => isActionable(profile.friendStatus) && act(profile.friendStatus)}
                  disabled={busy || !isActionable(profile.friendStatus)}
                  style={[styles.primary, { backgroundColor: isActionable(profile.friendStatus) ? colors.primary : colors.controlTrack }]}
                >
                  {busy ? <ActivityIndicator color={colors.textOnPrimary} /> : <Text style={[styles.primaryText, { color: colors.textOnPrimary }]}>{labelKey ? t(labelKey) : null}</Text>}
                </Pressable>
              ) : null}
              {/*
                Report and block sit together because they are what you reach
                for in the same moment, and they do different halves of the
                job: a block ends it for you and tells nobody, a report tells
                a moderator and changes nothing you can see. Neither is
                offered as a substitute for the other.
              */}
              <View style={styles.danger}>
                <Pressable onPress={() => setReporting(true)} style={styles.block} accessibilityRole="button">
                  <Text style={[styles.blockText, { color: colors.textSecondary }]}>{t('moderation.report')}</Text>
                </Pressable>
                <Pressable onPress={block} style={styles.block} accessibilityRole="button">
                  <Text style={[styles.blockText, { color: colors.danger }]}>{t('moderation.block')}</Text>
                </Pressable>
              </View>
              {reporting ? (
                <ReportUserSheet
                  userId={profile.userId}
                  name={profile.displayName ?? profile.username}
                  onClose={() => setReporting(false)}
                />
              ) : null}
            </View>
          ) : null}
        </View>
            );
          }}
        </AsyncBoundary>
      </View>
    </GradientBackground>
  );
}

function Header({ onExit }: { onExit: () => void }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const topInset = useScreenTopInset();
  return (
    <View style={[styles.header, { paddingTop: topInset }]}>
      <Pressable onPress={onExit} hitSlop={10}><Text style={[styles.close, { color: colors.primary }]}>‹ {t('common.back')}</Text></Pressable>
    </View>
  );
}
function Stat({ label, value, icon, iconColor }: { label: string; value: string; icon?: IconName; iconColor?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stat}>
      <View style={styles.statValueRow}>
        {icon ? <Icon name={icon} size={16} color={iconColor} /> : null}
        <Text style={[styles.statValue, { color: colors.textPrimary }]}>{value}</Text>
      </View>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: spacing.lg },
  header: { paddingTop: spacing.md, marginBottom: spacing.md },
  close: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { alignItems: 'center', gap: spacing.sm, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, padding: spacing.xl },
  username: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  display: { fontSize: typography.sizes.md },
  stats: { flexDirection: 'row', justifyContent: 'space-around', alignSelf: 'stretch', marginTop: spacing.md },
  stat: { alignItems: 'center', gap: 2 },
  statValueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statValue: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  statLabel: { fontSize: typography.sizes.xs, textTransform: 'uppercase' },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.lg },
  primary: { paddingVertical: spacing.md, borderRadius: radii.md, alignItems: 'center' },
  primaryText: { fontWeight: typography.weights.bold, fontSize: typography.sizes.md },
  secondary: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md, borderRadius: radii.md, alignItems: 'center', borderWidth: 2 },
  secondaryText: { fontWeight: typography.weights.bold, fontSize: typography.sizes.md },
  block: { paddingVertical: spacing.sm, alignItems: 'center' },
  danger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
  blockText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  dim: { textAlign: 'center', marginTop: spacing.md },
});
