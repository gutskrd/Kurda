import { StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../theme/Icon';
import { radii, spacing, typography } from '../theme/tokens';
import { GiftBubble } from '../gifts/GiftBubble';
import { ChatGameCard, gameCardOf } from '../play/ChatGameCard';
import { useReportAction } from '../reports/reportAction';
import type { ChatMessage } from '../gifts/api';

/**
 * What a chat message shows, by its kind — the one place a DM and a group
 * thread decide it, so the two cannot disagree.
 *
 * - `text` — the words. A text that carries a game invite link (from before
 *   invites were cards, or pasted) is drawn as the game's live card, with
 *   what else was written above it.
 * - `gift` — the present (gifts/GiftBubble).
 * - `game` — the game's live card (play/ChatGameCard): whether it can still
 *   be joined, and Join.
 *
 * Returns the content alone: the screen draws the bubble around a text
 * message, and nothing around a card, which is its own surface.
 *
 * `onReport` (someone else's message): a control inside the message — a gift
 * to open, a game to join — takes the touch, so the row's press-and-hold never
 * fires there; each one reports on a long press too, and carries Report among
 * its screen-reader actions, so a lure link or an unwanted gift can be reported.
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
  /** report this message; undefined for your own */
  onReport?: () => void;
}): React.JSX.Element {
  if (message.kind === 'gift') {
    return message.gift ? (
      <GiftBubble card={message.gift} mine={mine} senderName={senderName} onOpen={onOpenGift} onReport={onReport} />
    ) : (
      <GoneCard onReport={onReport} />
    );
  }
  // a game card, or an old invite link in a text
  const game = gameCardOf(message);
  if (game) return <GameMessage game={game} mine={mine} onReport={onReport} />;
  if (message.kind === 'game') return <GameFallback onReport={onReport} />;
  return <TextBody body={message.body ?? ''} mine={mine} />;
}

/** The words of a message, in the bubble's own colour. */
function TextBody({ body, mine }: { body: string; mine: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  return <Text style={[styles.body, { color: mine ? colors.textOnPrimary : colors.textPrimary }]}>{body}</Text>;
}

/** Is this message drawn as its own card (no bubble around it)? A gift, a game card, or an old invite link. */
export function isCardMessage(message: ChatMessage): boolean {
  return message.kind === 'gift' || message.kind === 'game' || gameCardOf(message) !== null;
}

/**
 * Does this message hold something to press — a gift, a game card? A screen
 * reader reaches such a message part by part; any other is read as one
 * element, which is where "Report" sits among its actions.
 */
export function hasControls(message: ChatMessage): boolean {
  return isCardMessage(message);
}

/** A game in the thread: any words sent with an old invite link in their own bubble, then the live card. */
function GameMessage({
  game,
  mine,
  onReport,
}: {
  game: NonNullable<ReturnType<typeof gameCardOf>>;
  mine: boolean;
  onReport?: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={[styles.game, mine ? styles.gameMine : null]}>
      {game.rest ? (
        <View style={[styles.bubble, { backgroundColor: mine ? colors.primary : colors.glassFill }]}>
          <Text style={[styles.body, { color: mine ? colors.textOnPrimary : colors.textPrimary }]}>{game.rest}</Text>
        </View>
      ) : null}
      <ChatGameCard game={game.game} lobbyId={game.lobbyId} onReport={onReport} />
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

/** A gift whose card is gone (its recipient's account closed): it was a gift, and that is all. */
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
  body: { fontSize: typography.sizes.md },
  game: { gap: spacing.xs, alignItems: 'flex-start' },
  gameMine: { alignItems: 'flex-end' },
  bubble: { borderRadius: radii.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
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
