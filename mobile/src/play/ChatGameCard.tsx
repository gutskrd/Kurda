import { useCallback, useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '../theme/MotionParts';
import { RETIRED_GAME_IDS, inviteLinkPattern, isPlayGame, isRetiredGame, parseInvite, type LobbyCard, type PlayGame } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import type { Translate } from '../api/errors';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import type { RootNavigation } from '../navigation/rootStack';
import { useRealtimeListener, useRealtimeReconnect } from '../realtime/RealtimeProvider';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { lobbyCard } from './api';
import { GAME_ICON, GAME_NAME_KEY, summaryParts } from './labels';
import { RatedPill } from '../ranks/Rated';
import { lobbyRoute } from './routes';
import { useReportAction } from '../reports/reportAction';
import { useDirection } from '../reports/direction';
import { Ticket, TicketStamp, useChangedSinceMount } from './Ticket';
import { Loading } from '../theme/Loading';

/** A card's state in words: "2 of 4 joined", "Under way", and so on. */
function cardStateText(card: LobbyCard, t: Translate): string {
  switch (card.status) {
    case 'open':
      return t('play.card.joined', { count: card.players, max: card.maxPlayers });
    case 'full':
      return t('play.card.full');
    case 'started':
      return t('play.card.started');
    case 'finished':
      return t('play.card.finished');
    case 'cancelled':
      return t('play.card.cancelled');
    case 'unavailable':
      return t('play.card.unavailable');
  }
}

/**
 * The stamp a card's ticket wears: "You're in" while the viewer is in a game still on, how it ended once over, and
 * nothing while simply open. A game that is over is spent (greyed and punched), as is one this viewer may not see.
 */
export function cardStamp(card: LobbyCard | null): { key: 'play.ticket.joined' | 'play.card.finished' | 'play.card.cancelled'; tone: 'success' | 'muted' } | null {
  if (!card) return null;
  if (card.status === 'finished') return { key: 'play.card.finished', tone: 'muted' };
  if (card.status === 'cancelled') return { key: 'play.card.cancelled', tone: 'muted' };
  if (card.isMember && card.status !== 'unavailable') return { key: 'play.ticket.joined', tone: 'success' };
  return null;
}

/** Whether a card's ticket is spent: the game is over, cancelled, or not this viewer's to see. */
export function cardSpent(card: LobbyCard | null): boolean {
  return card !== null && (card.status === 'finished' || card.status === 'cancelled' || card.status === 'unavailable');
}

/**
 * What a card offers: Join while joinable, Open for a player in it. Only a game still gathering gets the prominent
 * button, so the one playable game stands out among past ones; a game under way or over keeps a quiet Open.
 */
export function cardAction(card: LobbyCard | null): { kind: 'join' | 'enter'; prominent: boolean } | null {
  if (!card) return null;
  const gathering = card.status === 'open' || card.status === 'full';
  if (card.isMember && card.status !== 'unavailable' && card.status !== 'cancelled') return { kind: 'enter', prominent: gathering };
  if (card.canJoin) return { kind: 'join', prominent: true };
  return null;
}

/** An old message's invite link and the game it points at, with the rest of the text; such links still become cards. */
function linkedGame(body: string | null | undefined): { game: PlayGame; lobbyId: string; rest: string } | null {
  if (!body) return null;
  const invite = parseInvite(body);
  if (!invite) return null;
  return { game: invite.type, lobbyId: invite.id, rest: body.replace(inviteLinkPattern(), '').trim() };
}

/**
 * The game a chat message shows as a card, if any: a game message, or a text with an old invite link (with the
 * remaining text). Old messages may name retired games, which get no card (see `retiredGameOf`).
 */
export function gameCardOf(message: {
  kind?: string | null;
  game?: { game: PlayGame; lobbyId: string } | null;
  body?: string | null;
}): { game: PlayGame; lobbyId: string; rest: string } | null {
  if (message.kind === 'game' && message.game) return isPlayGame(message.game.game) ? { game: message.game.game, lobbyId: message.game.lobbyId, rest: '' } : null;
  if (message.kind && message.kind !== 'text') return null;
  return linkedGame(message.body);
}

// An old invite link to a retired game: "/app/games/<game>?id=<id>", with any origin or none.
const RETIRED_LINK = String.raw`\S*/app/games/(?:${RETIRED_GAME_IDS.join('|')})\?id=[A-Za-z0-9-]+\S*`;

/**
 * Whether a message invites to a retired game: a game message naming one, or a text with its old invite link. The
 * thread shows these as a quiet line with nothing to press; `rest` is the sender's other words beside the link.
 */
export function retiredGameOf(message: { kind?: string | null; game?: { game: string; lobbyId: string } | null; body?: string | null }): { rest: string } | null {
  if (message.kind === 'game') return message.game && isRetiredGame(message.game.game) ? { rest: '' } : null;
  if ((message.kind && message.kind !== 'text') || !message.body) return null;
  // A link to a game still played wins, since its card is what to show.
  if (parseInvite(message.body) || !new RegExp(RETIRED_LINK).test(message.body)) return null;
  return { rest: message.body.replace(new RegExp(RETIRED_LINK, 'g'), '').trim() };
}

/**
 * A game in a chat (contract §B1): what it is, whether it can still be joined, and a Join while it can. The state is
 * fetched when shown and again on `play_changed` (your channel, or the group's room), so it updates in place. A
 * card the viewer may not see reads "This game isn't available", like a game that is gone.
 *
 * It is a ticket (Ticket.tsx). Its stamp lands with a small thump when it appears while the chat is open; a stamp
 * already there when the chat opens is simply shown.
 *
 * With `onReport` (someone else's message) the card takes the touch, so a long press on it reports the message, and
 * Report is among its screen-reader actions (on the card when read as one element, else on its Join).
 */
export function ChatGameCard({
  game,
  lobbyId,
  onReport,
  from,
}: {
  game: PlayGame;
  lobbyId: string;
  /** Reports the message the card came in; undefined for your own. */
  onReport?: () => void;
  /** Who posted it, for someone else's card. */
  from?: string;
}): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const report = useReportAction(onReport);
  const [card, setCard] = useState<LobbyCard | null>(null);

  const load = useCallback(() => {
    void lobbyCard(client, game, lobbyId).then((res) => {
      if (res.ok) setCard(res.data);
    });
  }, [client, game, lobbyId]);
  useEffect(load, [load]);
  useRealtimeReconnect(load);
  useRealtimeListener(
    useCallback(
      (ev) => {
        if (ev.type === 'play_changed' && ev.game === game && ev.lobbyId === lobbyId) load();
      },
      [load, game, lobbyId],
    ),
  );

  const open = (): void => {
    const route = lobbyRoute(game, lobbyId);
    navigation.navigate(route.name, route.params as never);
  };

  const name = t(GAME_NAME_KEY[game]);
  const details = card ? summaryParts(card.summary, t).join(' · ') : '';
  const state = card ? cardStateText(card, t) : '';
  const offer = cardAction(card);
  const action = offer ? (offer.kind === 'enter' ? t('play.card.open') : t('play.card.join')) : null;

  const stamp = cardStamp(card);
  const spent = cardSpent(card);
  // A stamp that arrives while the chat is open lands; one present from the first state does not.
  const landed = useChangedSinceMount(stamp?.key ?? null, card !== null);
  // The state in words, unless the stamp already says it.
  const stateLine = card && !(stamp && stamp.tone === 'muted') ? state : null;

  const mirror = dir.row === 'row-reverse';
  // The card's words and Join, the same whether or not it can be reported.
  const content = (
    <>
      <View style={styles.text}>
        <Text style={[styles.name, dir.text, { color: spent ? colors.textSecondary : colors.textPrimary }]} numberOfLines={1}>
          {name}
        </Text>
        {from ? (
          <Text style={[styles.details, dir.free, { color: colors.textSecondary }]} numberOfLines={1}>
            {t('play.card.from', { name: from })}
          </Text>
        ) : null}
        {details ? (
          <Text style={[styles.details, dir.free, { color: colors.textSecondary }]} numberOfLines={2}>
            {details}
          </Text>
        ) : null}
        {/* Rated or Friendly, before anyone joins. */}
        {card?.summary.rated !== undefined ? <RatedPill rated={card.summary.rated} small style={[styles.rated, mirror && styles.endSelf]} /> : null}
      </View>
      {card ? (
        stateLine || stamp ? (
          <View style={[styles.stateRow, { flexDirection: dir.row }]}>
            {stateLine ? (
              <Text style={[styles.state, dir.text, { color: card.status === 'open' ? colors.success : colors.textSecondary }]}>{stateLine}</Text>
            ) : null}
            {stamp ? <TicketStamp key={stamp.key} label={t(stamp.key)} tone={stamp.tone} land={landed} /> : null}
          </View>
        ) : null
      ) : (
        <Loading />
      )}
      {action ? (
        <PressableScale
          onPress={open}
          onLongPress={onReport}
          delayLongPress={350}
          accessibilityRole="button"
          accessibilityLabel={`${action}: ${name}`}
          {...report}
          style={[
            styles.button,
            offer?.prominent ? { backgroundColor: colors.primary } : [styles.quiet, { borderColor: colors.separator }],
          ]}
        >
          <Text style={[styles.buttonText, { color: offer?.prominent ? colors.textOnPrimary : colors.primary }]}>{action}</Text>
        </PressableScale>
      ) : null}
    </>
  );
  const ticket = (
    <Ticket
      tone={game}
      muted={spent}
      punched={spent}
      stub={(ink) => <Icon name={GAME_ICON[game]} size={22} color={ink.ink} />}
      bodyStyle={styles.body}
    >
      {content}
    </Ticket>
  );
  const label = [from ? t('play.card.from', { name: from }) : null, t('play.card.label', { game: name, state })].filter(Boolean).join('. ');
  // Someone else's card reports its message on a long press; your own is a plain surface, not a control.
  return onReport ? (
    <PressableScale
      onLongPress={onReport}
      delayLongPress={350}
      style={styles.card}
      accessible={!action}
      accessibilityLabel={label}
      {...(action ? {} : report)}
    >
      {ticket}
    </PressableScale>
  ) : (
    <View style={styles.card} accessible={!action} accessibilityLabel={label}>
      {ticket}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 280, maxWidth: '100%' },
  body: { gap: spacing.sm },
  text: { gap: 1 },
  stateRow: { alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  endSelf: { alignSelf: 'flex-end' },
  rated: { marginTop: 4 },
  name: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  details: { fontSize: typography.sizes.xs },
  state: { flexShrink: 1, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  button: { minHeight: MIN_TOUCH_TARGET, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  quiet: { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth },
  buttonText: { fontSize: typography.ios.button, fontWeight: typography.weights.semibold },
});
