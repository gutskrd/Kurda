import { StyleSheet, Text, View } from 'react-native';
import { giftSenderName, type GiftCard } from '@kurda/shared';
import { assetUrl } from '../api/env';
import type { Translate } from '../api/errors';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../theme/Icon';
import { PressableScale } from '../theme/MotionParts';
import { radii, spacing, typography } from '../theme/tokens';
import { useDirection } from '../reports/direction';
import { useReportAction } from '../reports/reportAction';
import { GiftBox } from './art';
import { GiftArt } from './GiftLoop';

/**
 * A gift in the chat. To you, unopened: a wrapped present that hops now and then (still under Reduce Motion) and "Tap
 * to open"; opened: what it was and from whom. To the sender: what they gave and whether it was opened ("Opened ✓", or
 * how many recipients have in a group). To everyone else in a group: the wrapped present and whom it is for. The price
 * is never shown. A grand gift, once opened, stays on show for everyone in the chat, its picture large.
 */
export function GiftBubble({
  card,
  mine,
  senderName,
  onOpen,
  onReport,
}: {
  card: GiftCard;
  /** The viewer sent it. */
  mine: boolean;
  senderName: string;
  /** Unwrap (or look again at) the viewer's own gift. */
  onOpen: (giftId: string) => void;
  /** Report the message it came in (someone else's): a long press, or a screen-reader action. */
  onReport?: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const report = useReportAction(onReport);
  const forMe = card.myGiftId !== null;
  const opened = card.recipients.filter((r) => r.opened).length;
  const showpiece = card.tier === 'grand' && (forMe ? card.myOpened : opened > 0);
  const wrapped = showpiece ? false : forMe ? !card.myOpened : !mine;
  const status = mine
    ? card.recipients.length > 1
      ? t('gift.bubble.openedCount', { opened, total: card.recipients.length })
      : opened > 0
        ? t('gift.bubble.opened')
        : t('gift.bubble.notOpened')
    : null;

  // Who it is from, as the server lets this viewer see them; "a Hevalo member" when it may not (`GiftCard.from`). An
  // older server sends no sender, and the message's own sender stands in.
  const sender = (card as { from?: GiftCard['from'] }).from;
  const fromName = sender === undefined ? senderName || null : giftSenderName(sender);
  const fromLine = fromName ? t('gift.from', { name: fromName }) : t('gift.fromMember');
  const title = forMe ? (card.myOpened ? card.name : fromLine) : mine || showpiece ? card.name : recipientsLine(card, t);
  const hint = forMe ? (card.myOpened ? fromLine : t('gift.bubble.tapToOpen')) : mine ? recipientsLine(card, t) : fromLine;
  const label = forMe && !card.myOpened ? t('gift.bubble.openA11y', { name: fromName ?? t('gift.someone') }) : [title, hint, status].filter(Boolean).join('. ');

  const body = (
    <View
      style={[
        styles.bubble,
        // The art leads on the reading side, and the roomier edge is the text's; a grand gift stands above its words.
        { flexDirection: showpiece ? 'column' : dir.row, backgroundColor: colors.glassFill, borderColor: colors.gold },
        showpiece ? styles.showpiece : dir.row === 'row-reverse' ? styles.textLeft : styles.textRight,
      ]}
      testID={showpiece ? 'gift-showpiece' : undefined}
    >
      <View style={showpiece ? styles.artLarge : styles.art}>{wrapped ? <WrappedBox card={card} /> : <ItemThumb card={card} large={showpiece} />}</View>
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
      <View accessible accessibilityLabel={label} {...report}>
        {body}
      </View>
    );
  }
  const giftId = card.myGiftId;
  return (
    // A card, so it gives under the finger as every card does.
    <PressableScale
      onPress={() => onOpen(giftId)}
      // The bubble takes the touch, so the row's long press would never see it.
      onLongPress={onReport}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={label}
      {...report}
    >
      {body}
    </PressableScale>
  );
}

/** "For Rojda, Azad and 2 more": names this viewer may see, "a group member" for the rest. */
function recipientsLine(card: GiftCard, t: Translate): string {
  const names = card.recipients.map((r) => (r.isMe ? null : (r.name ?? t('gift.bubble.aMember')))).filter((n): n is string => n !== null);
  if (names.length === 0) return t('gift.bubble.forYou');
  const shown = names.slice(0, 2).join(', ');
  return names.length > 2
    ? t('gift.bubble.for', { names: t('gift.bubble.andMore', { names: shown, count: names.length - 2 }) })
    : t('gift.bubble.for', { names: shown });
}

/** The wrapped present: to its recipient it hops now and then, a waiting gift being the one moving thing in a thread. */
function WrappedBox({ card }: { card: GiftCard }): React.JSX.Element {
  return <GiftBox size={64} tier={card.tier} motion={card.myGiftId !== null ? 'idle' : 'still'} seed={card.batchId} testID="gift-box" />;
}

function ItemThumb({ card, large = false }: { card: GiftCard; large?: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const uri = assetUrl(card.assetUrl);
  return uri ? (
    <GiftArt path={card.assetUrl} size={large ? 132 : 56} imageStyle={{ borderRadius: card.category === 'icon' ? radii.pill : radii.md }} testID="gift-thumb" />
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
  title: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  hint: { fontSize: typography.sizes.text },
  statusRow: { alignItems: 'center', gap: 4, marginTop: 2 },
  status: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  thumb: { width: 56, height: 56 },
  artLarge: { width: 140, height: 140, alignItems: 'center', justifyContent: 'center' },
  showpiece: { alignItems: 'center', paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  thumbFallback: { alignItems: 'center', justifyContent: 'center', borderRadius: radii.md },
});
