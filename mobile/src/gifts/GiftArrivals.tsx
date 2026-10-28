import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '../theme/MotionParts';
import { useNavigation } from '@react-navigation/native';
import type { GiftUserEvent } from '@kurda/shared';
import { useUserEvents, type UserEvent } from '../realtime/useUserEvents';
import type { RootNavigation } from '../navigation/rootStack';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../theme/Icon';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { refreshGiftBadge } from '../shop/useUnseenGifts';
import { useDirection } from '../reports/direction';
import { GiftBox } from './art';
import { emitGiftEvent, isChatOpen } from './events';

type Received = Extract<GiftUserEvent, { type: 'gift_received' }>;

function isGiftEvent(event: UserEvent): event is GiftUserEvent {
  return event.type === 'gift_received' || event.type === 'gift_opened';
}

/**
 * Gifts as they happen, wherever you are in the app.
 *
 * Takes `gift_received` and `gift_opened` off your own channel and passes them
 * to the open chat (gifts/events.ts), recounts the badge, and — when a gift
 * arrives somewhere other than the chat on screen — shows a banner: "Rojda sent
 * you a gift", Open or Later. Open goes to that chat and unwraps it there. It
 * is a status, not an alert: it does not take focus, and it stays until it is
 * answered rather than vanishing before it can be read.
 */
export function GiftArrivals(): React.JSX.Element | null {
  const navigation = useNavigation<RootNavigation>();
  const [banner, setBanner] = useState<Received | null>(null);

  useUserEvents(
    useCallback((event: UserEvent) => {
      if (!isGiftEvent(event)) return;
      emitGiftEvent(event);
      refreshGiftBadge();
      if (event.type === 'gift_received' && !isChatOpen(event.chat)) setBanner(event);
    }, []),
  );

  if (!banner) return null;
  const open = (): void => {
    const { chat, giftId, from } = banner;
    setBanner(null);
    if (chat.kind === 'dm') navigation.navigate('Chat', { userId: chat.userId, username: from.name, openGift: giftId });
    else navigation.navigate('GroupThread', { groupId: chat.groupId, name: '', openGift: giftId });
  };
  return <GiftBanner event={banner} onOpen={open} onLater={() => setBanner(null)} />;
}

export function GiftBanner({
  event,
  onOpen,
  onLater,
}: {
  event: Received;
  onOpen: () => void;
  onLater: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const top = useScreenTopInset();
  const text = t('gift.banner.body', { name: event.from.name });
  // a live region speaks on Android only; VoiceOver is told in words, once
  useEffect(() => {
    if (Platform.OS !== 'android') AccessibilityInfo.announceForAccessibility?.(text);
  }, [text, event.giftId]);
  return (
    <View style={[styles.wrap, { top: top + spacing.xs }]} pointerEvents="box-none">
      <View
        style={[styles.banner, { flexDirection: dir.row, backgroundColor: colors.background, borderColor: colors.gold, shadowColor: colors.softShadow }]}
        accessibilityRole="summary"
        accessibilityLiveRegion="polite"
      >
        <GiftBox size={40} tier={event.card.tier} gold={colors.gold} />
        <Text style={[styles.text, dir.text, { color: colors.textPrimary }]} numberOfLines={2}>
          {text}
        </Text>
        <Pressable onPress={onLater} accessibilityRole="button" style={styles.later} hitSlop={4}>
          <Text style={[styles.laterText, { color: colors.textSecondary }]}>{t('gift.banner.later')}</Text>
        </Pressable>
        <PressableScale
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={`${t('gift.banner.open')}: ${text}`}
          style={[styles.open, { flexDirection: dir.row, backgroundColor: colors.primary }]}
        >
          <Icon name="gift" size={16} color={colors.textOnPrimary} />
          <Text style={[styles.openText, { color: colors.textOnPrimary }]}>{t('gift.banner.open')}</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.md, right: spacing.md, alignItems: 'center' },
  banner: {
    width: '100%',
    maxWidth: 520,
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  text: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  later: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.xs },
  laterText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  open: { minHeight: MIN_TOUCH_TARGET, alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, borderRadius: radii.pill },
  openText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
});
