import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { useEventTheme } from '../theme/EventThemeContext';
import { useI18n } from '../i18n/I18nContext';
import { radii, spacing, typography } from '../theme/tokens';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';

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
  const { t } = useI18n();
  const { colors } = useTheme();
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
      style={[styles.banner, { backgroundColor: pack ? pack.bannerColors[0] : colors.primary }]}
      accessibilityRole="button"
      accessibilityLabel={`${event.name} — event quests`}
    >
      {pack ? <Text style={styles.emoji}>{pack.emoji}</Text> : <Icon name="sparkle" size={24} color={colors.textOnPrimary} />}
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.textOnPrimary }]}>{event.name}</Text>
        <Text style={[styles.subtitle, { color: colors.textOnPrimary }]}>{t('events.bannerSubtitle')}</Text>
      </View>
      <Text style={[styles.chevron, { color: colors.textOnPrimary }]}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  emoji: { fontSize: typography.sizes.xl },
  title: { fontWeight: typography.weights.bold, fontSize: typography.sizes.md },
  subtitle: { opacity: 0.9, fontSize: typography.sizes.sm },
  chevron: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
});
