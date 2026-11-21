import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Image, StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '../theme/MotionParts';
import { useArtOverride } from '../art/overrides';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { useEventTheme } from '../theme/EventThemeContext';
import { useI18n } from '../i18n/I18nContext';
import { radii, spacing, typography } from '../theme/tokens';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useDirection } from '../reports/direction';

interface ActiveEvent {
  key: string;
  name: string;
  theme: string | null;
}

/**
 * A tap-through banner for the highest-priority live event, on the Learn tab only while one is active. It uses
 * the event theme's colour and glyph, or the theme's banner picture when an admin set one (art/overrides.ts),
 * cropped and dimmed under the text; a picture that fails to load falls back to the colour. Text uses the pack's
 * ink, or a primary button's label colour when there is no pack.
 */
export function EventBanner() {
  const navigation = useNavigation<RootNavigation>();
  const { client } = useAuth();
  const { pack, optedOut } = useEventTheme();
  const { t } = useI18n();
  const { colors } = useTheme();
  const [event, setEvent] = useState<ActiveEvent | null>(null);
  // Uses the event's own theme, which may have no pack, and not for someone who turned event looks off.
  const uploaded = useArtOverride('event', optedOut ? null : event?.theme);
  const [failed, setFailed] = useState<string | null>(null);
  const dir = useDirection();
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

  const ink = picture ? ON_PICTURE : pack ? pack.ink : colors.textOnPrimary;
  return (
    <PressableScale
      onPress={() => navigation.navigate('EventQuests')}
      // In Arabic and Soranî the glyph starts on the right and the chevron points left, as everywhere in the app.
      style={[styles.banner, { flexDirection: dir.row }, picture ? styles.pictured : null, { backgroundColor: pack ? pack.bannerColors[0] : colors.primary }]}
      accessibilityRole="button"
      accessibilityLabel={t('events.bannerLabel', { name: event.name })}
    >
      {picture ? (
        // Decoration behind the words: the button already says what the event is.
        <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Image source={{ uri: picture }} style={styles.fill} resizeMode="cover" onError={() => setFailed(picture)} accessibilityIgnoresInvertColors />
          <View style={styles.dim} />
        </View>
      ) : (
        <Icon name={pack ? pack.icon : 'star'} size={GLYPH} color={ink} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, dir.text, { color: ink }]}>{event.name}</Text>
        <Text style={[styles.subtitle, dir.text, { color: ink }]}>{t('events.bannerSubtitle')}</Text>
      </View>
      <View style={dir.flip}>
        <Icon name="chevron-right" size={20} color={ink} />
      </View>
    </PressableScale>
  );
}

// On a picture, white text over a dimming dark enough to keep both lines above 4.5:1 even on an all-white picture.
const ON_PICTURE = '#FFFFFF';
const UNDER_WORDS = 'rgba(0,0,0,0.6)';
/** The glyph before the words: the theme's own, or a star for an event with no theme. */
const GLYPH = 24;
/** A banner with a picture is taller, so the picture shows as more than a strip. */
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
  title: { fontWeight: typography.weights.bold, fontSize: typography.sizes.text },
  subtitle: { opacity: 0.9, fontSize: typography.sizes.text },
});
