import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useArtOverride } from '../art/overrides';
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
 *
 * Its look is the event theme's colour and emoji, or, when an admin has given
 * the theme a banner picture (art/overrides.ts), that picture behind the
 * event's name, cropped to fill and dimmed under the words so they read on
 * whatever it shows. A picture that will not load leaves the colour.
 */
export function EventBanner() {
  const navigation = useNavigation<RootNavigation>();
  const { client } = useAuth();
  const { pack, optedOut } = useEventTheme();
  const { t } = useI18n();
  const { colors } = useTheme();
  const [event, setEvent] = useState<ActiveEvent | null>(null);
  // by the event's own theme, which may have no pack of its own; not for someone who turned event looks off
  const uploaded = useArtOverride('event', optedOut ? null : event?.theme);
  const [failed, setFailed] = useState<string | null>(null);
  const picture = uploaded !== null && uploaded !== failed ? uploaded : null;

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

  const ink = picture ? ON_PICTURE : colors.textOnPrimary;
  return (
    <Pressable
      onPress={() => navigation.navigate('EventQuests')}
      style={[styles.banner, picture ? styles.pictured : null, { backgroundColor: pack ? pack.bannerColors[0] : colors.primary }]}
      accessibilityRole="button"
      accessibilityLabel={t('events.bannerLabel', { name: event.name })}
    >
      {picture ? (
        // decoration behind the words: the button already says what the event is
        <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Image source={{ uri: picture }} style={styles.fill} resizeMode="cover" onError={() => setFailed(picture)} accessibilityIgnoresInvertColors />
          <View style={styles.dim} />
        </View>
      ) : pack ? (
        <Text style={styles.emoji}>{pack.emoji}</Text>
      ) : (
        <Icon name="star" size={24} color={colors.textOnPrimary} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: ink }]}>{event.name}</Text>
        <Text style={[styles.subtitle, { color: ink }]}>{t('events.bannerSubtitle')}</Text>
      </View>
      <Text style={[styles.chevron, { color: ink }]}>›</Text>
    </Pressable>
  );
}

// on a picture, whatever its colours and whatever the theme: white over a dimming
// dark enough that even an all-white picture leaves both lines above 4.5:1
const ON_PICTURE = '#FFFFFF';
const UNDER_WORDS = 'rgba(0,0,0,0.6)';
/** A banner with a picture is taller than the colour one, so the picture shows as more than a strip. */
const PICTURED_HEIGHT = 112;

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  pictured: { minHeight: PICTURED_HEIGHT, overflow: 'hidden' },
  fill: { width: '100%', height: '100%' },
  dim: { ...StyleSheet.absoluteFill, backgroundColor: UNDER_WORDS },
  emoji: { fontSize: typography.sizes.xl },
  title: { fontWeight: typography.weights.bold, fontSize: typography.sizes.md },
  subtitle: { opacity: 0.9, fontSize: typography.sizes.sm },
  chevron: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
});
