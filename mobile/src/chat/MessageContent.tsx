import { StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../theme/Icon';
import { radii, spacing, typography } from '../theme/tokens';
import { GiftBubble } from '../gifts/GiftBubble';
import { ChatGameCard, gameCardOf, retiredGameOf } from '../play/ChatGameCard';
import { useReportAction } from '../reports/reportAction';
import type { ChatMessage } from '../gifts/api';

/**
 * What a chat message shows, by kind; the one place a DM and a group thread decide it, so they cannot disagree.
 *
 * - `text`: the words. A text carrying a game invite link (older invites, or pasted) is drawn as the game's live
 *   card,
 *   with any other text above it.
 * - `gift`: the present (gifts/GiftBubble).
 * - `game`: the game's live card (play/ChatGameCard), joinable or not. An invitation to a retired game, as a game
 *   message or an old link in a text, is a quiet line with nothing to press.
 *
 * Returns the content alone: the thread row (chat/MessageRow.tsx) draws a bubble around text and nothing around a
 * card. `onReport` (someone else's message): controls inside a message (a gift, a game) take the touch so the
 * row's long press never fires there, so each also reports on a long press and lists Report among its
 * screen-reader actions.
 */
export function MessageContent({
  message,
  mine,
  senderName,
  onOpenGift,
  onReport,
}: {
  message: ChatMessage;
  mine: boolean;
  senderName: string;
  onOpenGift: (giftId: string) => void;
  /** Report this message; undefined for your own. */
  onReport?: () => void;
}): React.JSX.Element {
  if (message.kind === 'gift') {
    return message.gift ? (
      <GiftBubble card={message.gift} mine={mine} senderName={senderName} onOpen={onOpenGift} onReport={onReport} />
    ) : (
      <GoneCard onReport={onReport} />
    );
  }
  // An invitation to a game that has since been retired: nothing to join, so nothing to press.
  const retired = retiredGameOf(message);
  if (retired) return <RetiredGame rest={retired.rest} mine={mine} onReport={onReport} />;
  // A game card, or an old invite link in a text.
  const game = gameCardOf(message);
  if (game) return <GameMessage game={game} mine={mine} from={mine ? undefined : senderName || undefined} onReport={onReport} />;
  if (message.kind === 'game') return <GameFallback onReport={onReport} />;
  return <TextBody body={message.body ?? ''} mine={mine} />;
}

/** The words of a message, in the bubble's own colour. */
function TextBody({ body, mine }: { body: string; mine: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  return <Text style={[styles.body, { color: mine ? colors.bubbleMineInk : colors.bubbleTheirsInk }]}>{body}</Text>;
}

/** Is this message drawn as its own card (no bubble)? A gift, a game card, or an old invite link. */
export function isCardMessage(message: ChatMessage): boolean {
  return message.kind === 'gift' || message.kind === 'game' || gameCardOf(message) !== null || retiredGameOf(message) !== null;
}

/**
 * Does this message contain something to press (a gift, a game card)? Screen readers then reach it part by part;
 * any other message is one element, carrying "Report" among its actions.
 */
export function hasControls(message: ChatMessage): boolean {
  return isCardMessage(message);
}

/** A game in the thread: any words sent with an old invite link in their own bubble, then the live card naming who posted it. */
function GameMessage({
  game,
  mine,
  from,
  onReport,
}: {
  game: NonNullable<ReturnType<typeof gameCardOf>>;
  mine: boolean;
  from?: string;
  onReport?: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={[styles.game, mine ? styles.gameMine : null]}>
      {game.rest ? (
        <View style={[styles.bubble, { backgroundColor: mine ? colors.bubbleMine : colors.bubbleTheirs }]}>
          <Text style={[styles.body, { color: mine ? colors.bubbleMineInk : colors.bubbleTheirsInk }]}>{game.rest}</Text>
        </View>
      ) : null}
      <ChatGameCard game={game.game} lobbyId={game.lobbyId} from={from} onReport={onReport} />
    </View>
  );
}

function GameFallback({ onReport }: { onReport?: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const report = useReportAction(onReport);
  return (
    <View style={[styles.card, { backgroundColor: colors.glassFill }]} accessible {...report}>
      <Icon name="play" size={18} color={colors.textSecondary} />
      <Text style={[styles.cardText, { color: colors.textSecondary }]}>{t('chat.gameCard')}</Text>
    </View>
  );
}

/**
 * An invitation to a retired game: any words sent with it in their own bubble, then one quiet line, not a
 * control, read as one element that carries Report for someone else's message.
 */
function RetiredGame({ rest, mine, onReport }: { rest: string; mine: boolean; onReport?: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const report = useReportAction(onReport);
  return (
    <View style={[styles.game, mine ? styles.gameMine : null]}>
      {rest ? (
        <View style={[styles.bubble, { backgroundColor: mine ? colors.bubbleMine : colors.bubbleTheirs }]}>
          <Text style={[styles.body, { color: mine ? colors.bubbleMineInk : colors.bubbleTheirsInk }]}>{rest}</Text>
        </View>
      ) : null}
      <View style={[styles.card, { backgroundColor: colors.glassFill }]} accessible {...report} testID="retired-game">
        <Icon name="play" size={18} color={colors.textSecondary} />
        <Text style={[styles.cardText, { color: colors.textSecondary }]}>{t('chat.gameRetired')}</Text>
      </View>
    </View>
  );
}

/** A gift whose card is gone (its recipient's account closed): it says only that it was a gift. */
function GoneCard({ onReport }: { onReport?: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const report = useReportAction(onReport);
  return (
    <View style={[styles.card, { backgroundColor: colors.glassFill }]} accessible {...report}>
      <Icon name="gift" size={18} color={colors.textSecondary} />
      <Text style={[styles.cardText, { color: colors.textSecondary }]}>{t('chat.preview.gift')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: typography.sizes.md, lineHeight: 23 },
  game: { gap: spacing.xs, alignItems: 'flex-start' },
  gameMine: { alignItems: 'flex-end' },
  // Words sent with a card, in a tailless bubble of the thread's shape (chat/Bubble.tsx): the card below ends the message.
  bubble: { borderRadius: radii.lg, paddingVertical: 9, paddingHorizontal: spacing.md - 2 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
  },
  cardText: { fontSize: typography.sizes.sm },
});
