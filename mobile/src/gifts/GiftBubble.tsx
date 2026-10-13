import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { GiftCard } from '@kurda/shared';
import { assetUrl } from '../api/env';
import { useReducedMotion } from '../a11y/useReducedMotion';
import type { Translate } from '../api/errors';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../theme/Icon';
import { radii, spacing, typography } from '../theme/tokens';
import { useDirection } from '../reports/direction';
import { GiftBox } from './art';

/**
 * A gift in the chat.
 *
 * To you, unopened: a wrapped present that breathes a little (still, with
 * Reduce Motion) and "Tap to open". Opened: what it was, and from whom. To the sender: what
 * they gave and whether it has been opened — "Opened ✓", or in a group how many
 * of the recipients have. To everyone else in a group: the wrapped present and
 * whom it is for. The price is never shown; a present is not a receipt.
 */
export function GiftBubble({
  card,
  mine,
  senderName,
  onOpen,
}: {
  card: GiftCard;
  /** the viewer sent it */
  mine: boolean;
  senderName: string;
  /** unwrap (or look again at) the viewer's own gift */
  onOpen: (giftId: string) => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const forMe = card.myGiftId !== null;
  const wrapped = forMe ? !card.myOpened : !mine;
  const opened = card.recipients.filter((r) => r.opened).length;
  const status = mine
    ? card.recipients.length > 1
      ? t('gift.bubble.openedCount', { opened, total: card.recipients.length })
      : opened > 0
        ? t('gift.bubble.opened')
        : t('gift.bubble.notOpened')
    : null;

  const title = forMe ? (card.myOpened ? card.name : t('gift.bubble.forYou')) : mine ? card.name : recipientsLine(card, t);
  const hint = forMe
    ? card.myOpened
      ? senderName
        ? t('gift.unwrap.from', { name: senderName })
        : null
      : t('gift.bubble.tapToOpen')
    : mine
      ? recipientsLine(card, t)
      : null;
  const label = forMe && !card.myOpened ? t('gift.bubble.openA11y', { name: senderName }) : [title, hint, status].filter(Boolean).join('. ');

  const body = (
    <View
      style={[
        styles.bubble,
        // the art leads on the reading side, and the roomier edge is the text's
        { flexDirection: dir.row, backgroundColor: colors.glassFill, borderColor: colors.gold },
        dir.row === 'row-reverse' ? styles.textLeft : styles.textRight,
      ]}
    >
      <View style={styles.art}>{wrapped ? <Breathing card={card} /> : <ItemThumb card={card} />}</View>
      <View style={styles.text}>
        <Text style={[styles.title, dir.text, { color: colors.textPrimary }]} numberOfLines={2}>
          {title}
        </Text>
        {hint ? (
          <Text
            style={[styles.hint, dir.text, { color: forMe && !card.myOpened ? colors.primary : colors.textSecondary }]}
            numberOfLines={2}
          >
            {hint}
          </Text>
        ) : null}
        {status ? (
          <View style={[styles.statusRow, { flexDirection: dir.row }]}>
            <Icon name={opened > 0 ? 'check' : 'gift'} size={12} color={opened > 0 ? colors.success : colors.textSecondary} />
            <Text style={[styles.status, { color: opened > 0 ? colors.success : colors.textSecondary }]}>{status}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );

  if (!forMe || !card.myGiftId) {
    return (
      <View accessible accessibilityLabel={label}>
        {body}
      </View>
    );
  }
  const giftId = card.myGiftId;
  return (
    <Pressable onPress={() => onOpen(giftId)} accessibilityRole="button" accessibilityLabel={label}>
      {({ pressed }) => <View style={{ opacity: pressed ? 0.85 : 1 }}>{body}</View>}
    </Pressable>
  );
}

/** "For Rojda, Azad and 2 more" — names this viewer may see, "a group member" for the rest. */
export function recipientsLine(card: GiftCard, t: Translate): string {
  const names = card.recipients.map((r) => (r.isMe ? null : (r.name ?? t('gift.bubble.aMember')))).filter((n): n is string => n !== null);
  if (names.length === 0) return t('gift.bubble.forYou');
  const shown = names.slice(0, 2).join(', ');
  return names.length > 2
    ? t('gift.bubble.for', { names: t('gift.bubble.andMore', { names: shown, count: names.length - 2 }) })
    : t('gift.bubble.for', { names: shown });
}

/** The wrapped present, rising and settling slowly — a gift waiting is the one moving thing in a thread. */
function Breathing({ card }: { card: GiftCard }): React.JSX.Element {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const lift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce || card.myGiftId === null) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(lift, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(lift, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, lift, card.myGiftId]);
  const translateY = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });
  const rotate = lift.interpolate({ inputRange: [0, 1], outputRange: ['-2deg', '2deg'] });
  return (
    <Animated.View style={{ transform: [{ translateY }, { rotate }] }}>
      <GiftBox size={64} tier={card.tier} gold={colors.gold} />
    </Animated.View>
  );
}

function ItemThumb({ card }: { card: GiftCard }): React.JSX.Element {
  const { colors } = useTheme();
  const uri = assetUrl(card.assetUrl);
  return uri ? (
    <Image
      source={{ uri }}
      style={[styles.thumb, { borderRadius: card.category === 'icon' ? radii.pill : radii.md }]}
      accessibilityIgnoresInvertColors
    />
  ) : (
    <View style={[styles.thumb, styles.thumbFallback, { backgroundColor: colors.controlTrack }]}>
      <Icon name="gift" size={28} color={colors.gold} />
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    minWidth: 220,
    maxWidth: 280,
  },
  textRight: { paddingRight: spacing.md },
  textLeft: { paddingLeft: spacing.md },
  art: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  title: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  hint: { fontSize: typography.sizes.sm },
  statusRow: { alignItems: 'center', gap: 4, marginTop: 2 },
  status: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  thumb: { width: 56, height: 56 },
  thumbFallback: { alignItems: 'center', justifyContent: 'center', borderRadius: radii.md },
});
