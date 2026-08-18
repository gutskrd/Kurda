import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { radii, spacing, typography } from '../theme/tokens';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { unreadBadge } from './inbox.js';

/** Bell row with an unread badge → the notification center (KUR-097). */
export function NotificationBell() {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
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
    <Pressable
      style={[styles.row, { backgroundColor: colors.primary }]}
      onPress={() => navigation.navigate('NotificationCenter')}
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
    >
      <Icon name="bell" size={20} color={colors.textOnPrimary} />
      <Text style={[styles.label, { color: colors.textOnPrimary }]}>Notifications</Text>
      {badge ? (
        <View style={[styles.badge, { backgroundColor: colors.danger }]}>
          <Text style={[styles.badgeText, { color: colors.textOnPrimary }]}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: radii.md },
  label: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
});
