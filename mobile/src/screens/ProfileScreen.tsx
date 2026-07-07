import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { colors, radii, spacing, typography } from '../theme/tokens';

/** First letter of the display name / username, NFC-normalised. */
function initial(name: string | null | undefined): string {
  const s = (name ?? '?').normalize('NFC').trim();
  return s ? s[0]!.toUpperCase() : '?';
}

export function ProfileScreen() {
  const { user, logout } = useAuth();

  // Placeholder monogram until the profile-picture system (#177–#181)
  // lands (photo upload + a proper initials fallback).
  return (
    <View style={styles.screen}>
      <View style={styles.monogram}>
        <Text style={styles.monogramText}>{initial(user?.displayName ?? user?.username)}</Text>
      </View>
      <Text style={styles.username}>{user?.username}</Text>
      {user?.displayName ? <Text style={styles.displayName}>{user.displayName}</Text> : null}

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
  monogram: {
    width: 120,
    height: 120,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  monogramText: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.textOnPrimary,
  },
  username: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  displayName: { fontSize: typography.sizes.md, color: colors.textSecondary },
  logout: { marginTop: spacing.xl },
  logoutText: { color: colors.danger, fontSize: typography.sizes.sm },
});
