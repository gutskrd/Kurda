import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { colors, radii, spacing, typography } from '../theme/tokens';
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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(() => {
    void client.get<Profile>(`/users/${userId}`).then((res) => {
      if (res.ok) setProfile(res.data);
      else setNotFound(true);
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
      <View style={styles.screen}>
        <Header onExit={onExit} />
        <View style={styles.centered}><Text style={styles.dim}>This profile isn’t available.</Text></View>
      </View>
    );
  }
  if (!profile) {
    return (
      <View style={styles.screen}>
        <Header onExit={onExit} />
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
      </View>
    );
  }

  const label = friendActionLabel(profile.friendStatus);
  return (
    <View style={styles.screen}>
      <Header onExit={onExit} />
      <View style={styles.card}>
        <InitialsAvatar name={profile.displayName ?? profile.username} id={profile.userId} size={96} />
        <Text style={styles.username}>{profile.username}</Text>
        {profile.displayName ? <Text style={styles.display}>{profile.displayName}</Text> : null}

        {profile.private ? (
          <Text style={styles.dim}>This profile is private.</Text>
        ) : (
          <View style={styles.stats}>
            <Stat label="Streak" value={`🔥 ${profile.streak ?? 0}`} />
            <Stat label="XP" value={`${profile.xp ?? 0}`} />
            <Stat label="League" value={tierMeta(profile.tier ?? 'bronze').emoji} />
            <Stat label="Badges" value={`${profile.achievements ?? 0}`} />
          </View>
        )}

        {profile.friendStatus !== 'self' ? (
          <View style={styles.actions}>
            {profile.friendStatus === 'friends' ? (
              <>
                <Pressable
                  onPress={() => navigation.navigate('Chat', { userId: profile.userId, username: profile.username })}
                  style={styles.primary}
                >
                  <Text style={styles.primaryText}>Message</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    void client.post('/challenges', { userId: profile.userId }).then((res) => {
                      if (res.ok) Alert.alert('Challenge sent ⚔️', 'Waiting for them to accept…');
                      else Alert.alert('Could not challenge', res.error.message);
                    })
                  }
                  style={styles.secondary}
                >
                  <Text style={styles.secondaryText}>⚔️ Challenge to 1v1</Text>
                </Pressable>
              </>
            ) : null}
            {label ? (
              <Pressable
                onPress={() => isActionable(profile.friendStatus) && act(profile.friendStatus)}
                disabled={busy || !isActionable(profile.friendStatus)}
                style={[styles.primary, !isActionable(profile.friendStatus) && styles.primaryMuted]}
              >
                {busy ? <ActivityIndicator color={colors.textOnPrimary} /> : <Text style={styles.primaryText}>{label}</Text>}
              </Pressable>
            ) : null}
            <Pressable onPress={block} style={styles.block}><Text style={styles.blockText}>Block</Text></Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Header({ onExit }: { onExit: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onExit} hitSlop={10}><Text style={styles.close}>‹ Back</Text></Pressable>
    </View>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  header: { paddingTop: spacing.md, marginBottom: spacing.md },
  close: { color: colors.primary, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.xl },
  username: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.textPrimary },
  display: { fontSize: typography.sizes.md, color: colors.textSecondary },
  stats: { flexDirection: 'row', justifyContent: 'space-around', alignSelf: 'stretch', marginTop: spacing.md },
  stat: { alignItems: 'center', gap: 2 },
  statValue: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.textPrimary },
  statLabel: { fontSize: typography.sizes.xs, color: colors.textSecondary, textTransform: 'uppercase' },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.lg },
  primary: { backgroundColor: colors.primary, paddingVertical: spacing.md, borderRadius: radii.md, alignItems: 'center' },
  primaryMuted: { backgroundColor: colors.border },
  primaryText: { color: colors.textOnPrimary, fontWeight: typography.weights.bold, fontSize: typography.sizes.md },
  secondary: { paddingVertical: spacing.md, borderRadius: radii.md, alignItems: 'center', borderWidth: 2, borderColor: colors.accent },
  secondaryText: { color: colors.accent, fontWeight: typography.weights.bold, fontSize: typography.sizes.md },
  block: { paddingVertical: spacing.sm, alignItems: 'center' },
  blockText: { color: colors.danger, fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  dim: { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md },
});
