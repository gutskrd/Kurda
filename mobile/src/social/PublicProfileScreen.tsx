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

interface Profile {
  userId: string;
  username: string;
  displayName: string | null;
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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);
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
    Alert.alert('Block user?', 'They won’t be able to see you or contact you.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: () => {
          void client.post(`/friends/${userId}/block`).then(onExit);
        },
      },
    ]);
  }, [client, userId, onExit]);

  if (notFound) {
    return (
      <GradientBackground>
        <View style={styles.screen}>
          <Header onExit={onExit} />
          <View style={styles.centered}><Text style={[styles.dim, { color: colors.textSecondary }]}>This profile isn’t available.</Text></View>
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
            const label = friendActionLabel(profile.friendStatus);
            return (
        <View style={[styles.card, { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder }]}>
          <InitialsAvatar name={profile.displayName ?? profile.username} id={profile.userId} size={96} />
          <Text style={[styles.username, { color: colors.textPrimary }]}>{profile.username}</Text>
          {profile.displayName ? <Text style={[styles.display, { color: colors.textSecondary }]}>{profile.displayName}</Text> : null}

          {profile.private ? (
            <Text style={[styles.dim, { color: colors.textSecondary }]}>This profile is private.</Text>
          ) : (
            <View style={styles.stats}>
              <Stat label="Streak" value={`${profile.streak ?? 0}`} icon="flame" iconColor={colors.danger} />
              <Stat label="XP" value={`${profile.xp ?? 0}`} />
              <Stat label="League" value={tierMeta(profile.tier ?? 'bronze').label} />
              <Stat label="Badges" value={`${profile.achievements ?? 0}`} />
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
                    <Text style={[styles.primaryText, { color: colors.textOnPrimary }]}>Message</Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      void client.post('/challenges', { userId: profile.userId }).then((res) => {
                        if (res.ok) Alert.alert('Challenge sent', 'Waiting for them to accept…');
                        else Alert.alert('Could not challenge', describeError(res.error).message);
                      })
                    }
                    style={[styles.secondary, { borderColor: colors.accent }]}
                  >
                    <Icon name="play" size={18} color={colors.accent} />
                    <Text style={[styles.secondaryText, { color: colors.accent }]}>Challenge to 1v1</Text>
                  </Pressable>
                </>
              ) : null}
              {label ? (
                <Pressable
                  onPress={() => isActionable(profile.friendStatus) && act(profile.friendStatus)}
                  disabled={busy || !isActionable(profile.friendStatus)}
                  style={[styles.primary, { backgroundColor: isActionable(profile.friendStatus) ? colors.primary : colors.controlTrack }]}
                >
                  {busy ? <ActivityIndicator color={colors.textOnPrimary} /> : <Text style={[styles.primaryText, { color: colors.textOnPrimary }]}>{label}</Text>}
                </Pressable>
              ) : null}
              <Pressable onPress={block} style={styles.block}><Text style={[styles.blockText, { color: colors.danger }]}>Block</Text></Pressable>
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
  const topInset = useScreenTopInset();
  return (
    <View style={[styles.header, { paddingTop: topInset }]}>
      <Pressable onPress={onExit} hitSlop={10}><Text style={[styles.close, { color: colors.primary }]}>‹ Back</Text></Pressable>
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
  blockText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  dim: { textAlign: 'center', marginTop: spacing.md },
});
