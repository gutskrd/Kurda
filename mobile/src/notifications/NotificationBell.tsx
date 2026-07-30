import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { colors, radii, spacing, typography } from '../theme/tokens';
import { unreadBadge } from './inbox.js';

/** Bell row with an unread badge → the notification center (KUR-097). */
export function NotificationBell() {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const [unread, setUnread] = useState(0);

  useFocusEffect(
    useCallback(() => {
      void client.get<{ count: number }>('/me/notifications/unread-count').then((res) => {
        if (res.ok) setUnread(res.data.count);
      });
    }, [client]),
  );

  const badge = unreadBadge(unread);

  return (
    <Pressable style={styles.row} onPress={() => navigation.navigate('NotificationCenter')}>
      <Text style={styles.label}>🔔 Notifications</Text>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.primary, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: radii.md },
  label: { color: colors.textOnPrimary, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: radii.pill, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.textOnPrimary, fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
});
