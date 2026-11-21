import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { pressedDim } from '../theme/motion';
import { fontScaleCap, radii, spacing, typography } from '../theme/tokens';

/**
 * The small non-message parts of a thread: a day's name over its first message, and the round button back down to
 * the newest. Shared by DMs and group chats.
 */

/** "Today", "Yesterday", "Tuesday", "3 March": a small centred pill over the day's first message. */
export function DayPill({ label }: { label: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={styles.day}>
      <Text style={[styles.dayText, { color: colors.textSecondary, backgroundColor: colors.controlTrack }]} accessibilityRole="header">
        {label}
      </Text>
    </View>
  );
}

/** How far above the newest message the reader must be before the way back is offered: a few messages. */
const AWAY_PX = 240;

/** Whether the reader has scrolled up from the newest message, in an inverted list where the thread's foot is offset zero. */
export function useAwayFromLatest(): { away: boolean; onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void } {
  const [away, setAway] = useState(false);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const next = e.nativeEvent.contentOffset.y > AWAY_PX;
    setAway((was) => (was === next ? was : next));
  };
  return { away, onScroll };
}

/**
 * How many messages from others arrived below while the reader was up the thread, counted from the last message
 * seen at the foot; their own never count, since sending scrolls them down.
 */
export function useUnseenBelow(messages: readonly { id: string; senderId: string }[], away: boolean, myId: string): number {
  const seen = useRef<string | null>(null);
  const [count, setCount] = useState(0);
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!away || seen.current === null) {
      seen.current = last?.id ?? null;
      setCount(0);
      return;
    }
    const from = messages.findIndex((m) => m.id === seen.current);
    // The message they were last at is gone (the chat was cleared): nothing to count from.
    setCount(from === -1 ? 0 : messages.slice(from + 1).filter((m) => m.senderId !== myId).length);
  }, [messages, away, myId]);
  return count;
}

/**
 * The way back down: a round button over the thread's foot on the reader's side, with the count of new messages.
 * Shown only while away from the newest.
 */
export function JumpToLatest({ unseen, onPress }: { unseen: number; onPress: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const mirrored = dir.row === 'row-reverse';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={unseen > 0 ? t('chat.jumpToNew', { count: unseen }) : t('chat.jumpToLatest')}
      style={({ pressed }) => [styles.jump, mirrored ? styles.jumpLeft : styles.jumpRight, pressed && styles.pressed]}
    >
      <View style={[styles.jumpDisc, { backgroundColor: colors.surfaceRaised, shadowColor: colors.softShadow }]}>
        <Icon name="chevron-down" size={20} color={colors.textPrimary} />
      </View>
      {unseen > 0 ? (
        <View style={[styles.count, { backgroundColor: colors.bubbleMine }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text style={[styles.countText, { color: colors.bubbleMineInk }]} maxFontSizeMultiplier={fontScaleCap.fixedBox}>
            {unseen > 99 ? '99+' : unseen}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const DISC = 40;
const COUNT = 20;

const styles = StyleSheet.create({
  day: { alignItems: 'center', paddingTop: spacing.md, paddingBottom: spacing.xs },
  dayText: {
    fontSize: typography.sizes.text,
    fontWeight: typography.weights.semibold,
    overflow: 'hidden',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md - 4,
    paddingVertical: 3,
  },
  // The touch is 44; the disc drawn in it is a little smaller, as the send button's is.
  jump: { position: 'absolute', bottom: spacing.sm, width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  jumpRight: { right: spacing.md - 4 },
  jumpLeft: { left: spacing.md - 4 },
  jumpDisc: {
    width: DISC,
    height: DISC,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  count: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: COUNT,
    height: COUNT,
    paddingHorizontal: 5,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  pressed: { opacity: pressedDim },
});
