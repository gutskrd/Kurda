import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { inviteLinkPattern, parseInvite, type GameInvite } from '@kurda/shared';
import type { RootNavigation } from '../navigation/rootStack';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../theme/Icon';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { GiftBubble } from '../gifts/GiftBubble';
import type { ChatMessage } from '../gifts/api';

/**
 * What a chat message shows, by its kind — the one place a DM and a group
 * thread decide it, so the two cannot disagree.
 *
 * - `text` — the words, and when they carry a game invite link (from before
 *   invites were cards, or pasted), the link as a card that opens the game.
 * - `gift` — the present (gifts/GiftBubble).
 * - `game` — a game card. **mobile-games builds the live card**; until it is
 *   merged this says only that it is a game invite.
 *
 * Returns the content alone: the screen draws the bubble around a text
 * message, and nothing around a card, which is its own surface.
 */
export function MessageContent({
  message,
  mine,
  senderName,
  onOpenGift,
}: {
  message: ChatMessage;
  mine: boolean;
  senderName: string;
  onOpenGift: (giftId: string) => void;
}): React.JSX.Element {
  switch (message.kind) {
    case 'gift':
      return message.gift ? (
        <GiftBubble card={message.gift} mine={mine} senderName={senderName} onOpen={onOpenGift} />
      ) : (
        <GoneCard />
      );
    case 'game':
      // mobile-games: the live game card (ChatGameCard with message.game) goes here
      return <GameFallback />;
    default:
      return <TextBody body={message.body ?? ''} mine={mine} />;
  }
}

/** Is this message drawn as its own card (no bubble around it)? */
export function isCardMessage(message: ChatMessage): boolean {
  return message.kind === 'gift' || message.kind === 'game';
}

/**
 * Does this message hold something to press — a card, or an invite link drawn
 * as one? A screen reader reaches such a message part by part; any other is
 * read as one element, which is where "Report" sits among its actions.
 */
export function hasControls(message: ChatMessage): boolean {
  if (isCardMessage(message)) return true;
  const invite = message.body ? parseInvite(message.body) : null;
  return invite !== null && INVITE_ROUTE[invite.type] !== undefined;
}

/** The text of a message, with an invite link in it turned into a card. */
function TextBody({ body, mine }: { body: string; mine: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const invite = parseInvite(body);
  const route = invite ? INVITE_ROUTE[invite.type] : undefined;
  const words = invite && route ? body.replace(inviteLinkPattern(), '').trim() : body;
  const color = mine ? colors.textOnPrimary : colors.textPrimary;
  return (
    <View style={styles.text}>
      {words ? <Text style={[styles.body, { color }]}>{words}</Text> : null}
      {invite && route ? <InviteLinkCard invite={invite} route={route} mine={mine} /> : null}
    </View>
  );
}

/**
 * Where an invite link opens on the phone, and what the game is called.
 * Stories' route is mobile-games'; until it exists its links stay text.
 */
const INVITE_ROUTE: Partial<Record<GameInvite['type'], { screen: 'WordleBattle' | 'RhymeMatch'; name: TranslationKey }>> = {
  'wordle-battle': { screen: 'WordleBattle', name: 'games.battle.name' },
  'rhyme-match': { screen: 'RhymeMatch', name: 'games.rhymeMatch.name' },
};

function InviteLinkCard({
  invite,
  route,
  mine,
}: {
  invite: GameInvite;
  route: { screen: 'WordleBattle' | 'RhymeMatch'; name: TranslationKey };
  mine: boolean;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const navigation = useNavigation<RootNavigation>();
  const tint = mine ? colors.textOnPrimary : colors.primary;
  return (
    <Pressable
      onPress={() => navigation.navigate(route.screen, { id: invite.id })}
      accessibilityRole="button"
      accessibilityLabel={`${t(route.name)}: ${t('chat.inviteCard.open')}`}
      style={({ pressed }) => [styles.invite, { borderColor: tint, opacity: pressed ? 0.75 : 1 }]}
    >
      <Icon name="play" size={18} color={tint} />
      <View style={styles.inviteText}>
        <Text style={[styles.inviteName, { color: tint }]}>{t(route.name)}</Text>
        <Text style={[styles.inviteOpen, { color: tint }]}>{t('chat.inviteCard.open')}</Text>
      </View>
      <Icon name="chevron-right" size={14} color={tint} />
    </Pressable>
  );
}

function GameFallback(): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={[styles.card, { backgroundColor: colors.glassFill }]}>
      <Icon name="play" size={18} color={colors.textSecondary} />
      <Text style={[styles.cardText, { color: colors.textSecondary }]}>{t('chat.gameCard')}</Text>
    </View>
  );
}

/** A gift whose card is gone (its recipient's account closed): it was a gift, and that is all. */
function GoneCard(): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={[styles.card, { backgroundColor: colors.glassFill }]}>
      <Icon name="gift" size={18} color={colors.textSecondary} />
      <Text style={[styles.cardText, { color: colors.textSecondary }]}>{t('chat.preview.gift')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  text: { gap: spacing.xs },
  body: { fontSize: typography.sizes.md },
  invite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  inviteText: { flex: 1 },
  inviteName: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  inviteOpen: { fontSize: typography.sizes.xs },
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
