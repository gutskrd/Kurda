import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AvatarConfig } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { KurdishAvatar } from '../avatar/KurdishAvatar';
import type { RootStackParamList } from '../navigation/rootStack';
import { colors, radii, spacing, typography } from '../theme/tokens';

export function ProfileScreen() {
  const { user, client, logout } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [config, setConfig] = useState<AvatarConfig | null>(null);

  // refetch whenever the tab regains focus (e.g. returning from the editor)
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const res = await client.get<{ config: AvatarConfig }>('/me/avatar');
        if (!cancelled && res.ok) setConfig(res.data.config);
      })();
      return () => {
        cancelled = true;
      };
    }, [client]),
  );

  return (
    <View style={styles.screen}>
      <KurdishAvatar config={config} size={160} />
      <Text style={styles.username}>{user?.username}</Text>
      {user?.displayName ? <Text style={styles.displayName}>{user.displayName}</Text> : null}

      <Pressable style={styles.editButton} onPress={() => navigation.navigate('AvatarEditor')}>
        <Text style={styles.editText}>Cilan biguherîne — Edit avatar</Text>
      </Pressable>

      <Pressable style={styles.logout} onPress={logout}>
        <Text style={styles.logoutText}>Derkeve — Log out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  username: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  displayName: { fontSize: typography.sizes.md, color: colors.textSecondary },
  editButton: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
  },
  editText: { color: colors.textOnPrimary, fontWeight: typography.weights.medium },
  logout: { marginTop: spacing.xl },
  logoutText: { color: colors.danger, fontSize: typography.sizes.sm },
});
