import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { pressedDim } from '../theme/motion';
import { fontScaleCap, radii, spacing, typography } from '../theme/tokens';

/**
 * The small parts of a thread that are not messages: the name of a day over
 * its first message, and the round button that leads back down to the newest
 * one. The same in a chat with one friend and in a group's.
 */

/** "Today", "Yesterday", "Tuesday", "3 March": a small pill in the middle of the thread, over the day's first message. */
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

/** How far up from the newest message the reader has to be before the way back is offered: a few messages. */
const AWAY_PX = 240;

/**
 * Whether the reader has scrolled up from the newest message, from the
 * scroll of a list drawn newest-at-the-bottom (inverted): there, the foot of
 * the thread is where the list begins, at an offset of nothing.
 */
export function useAwayFromLatest(): { away: boolean; onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void } {
  const [away, setAway] = useState(false);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const next = e.nativeEvent.contentOffset.y > AWAY_PX;
    setAway((was) => (was === next ? was : next));
  };
  return { away, onScroll };
}

/**
 * How many messages from other people have come in below while the reader
 * was up the thread: the number on the way back down.
 *
 * Counted from the last message that was there when they were at the foot.
 * Their own never count: sending one is what takes them down.
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
    // the message they were last at is gone (the chat was cleared): nothing to count from
    setCount(from === -1 ? 0 : messages.slice(from + 1).filter((m) => m.senderId !== myId).length);
  }, [messages, away, myId]);
  return count;
}

/**
 * The way back down: a round button over the foot of the thread, on the
 * side the reader's own words are, with how many messages have come in
 * since they went up. Only there while they are away from the newest.
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
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    overflow: 'hidden',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md - 4,
    paddingVertical: 3,
  },
  // the touch is 44; the disc drawn in it is a little smaller, as the send button's is
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
  countText: { fontSize: 11, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  pressed: { opacity: pressedDim },
});
