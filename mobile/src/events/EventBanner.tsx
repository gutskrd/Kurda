import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { useEventTheme } from '../theme/EventThemeContext';
import { colors, radii, spacing, typography } from '../theme/tokens';

interface ActiveEvent {
  key: string;
  name: string;
  theme: string | null;
}

/**
 * A tap-through banner for the highest-priority live event (KUR-091), shown on
 * the Learn tab only while an event is active. Hidden entirely otherwise.
 */
export function EventBanner() {
  const navigation = useNavigation<RootNavigation>();
  const { client } = useAuth();
  const { pack } = useEventTheme();
  const [event, setEvent] = useState<ActiveEvent | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void client.get<{ events: ActiveEvent[] }>('/events/active').then((res) => {
        if (active && res.ok) setEvent(res.data.events[0] ?? null);
      });
      return () => {
        active = false;
      };
    }, [client]),
  );

  if (!event) return null;

  return (
    <Pressable
      onPress={() => navigation.navigate('EventQuests')}
      style={[styles.banner, pack ? { backgroundColor: pack.bannerColors[0] } : null]}
    >
      <Text style={styles.emoji}>{pack ? pack.emoji : '🎉'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{event.name}</Text>
        <Text style={styles.subtitle}>Quests &amp; rewards — tap to play</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  emoji: { fontSize: typography.sizes.xl },
  title: { color: colors.textOnPrimary, fontWeight: typography.weights.bold, fontSize: typography.sizes.md },
  subtitle: { color: colors.textOnPrimary, opacity: 0.9, fontSize: typography.sizes.sm },
  chevron: { color: colors.textOnPrimary, fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
});
