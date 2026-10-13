import { useCallback, useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { inviteLinkPattern, parseInvite, type LobbyCard, type PlayGame } from '@kurda/shared';
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
import { lobbyRoute } from './routes';

/** A card's state in words: "Open · 2 of 4 joined", "Under way", … */
export function cardStateText(card: LobbyCard, t: Translate): string {
  switch (card.status) {
    case 'open':
      return t('play.card.open', { players: card.players, max: card.maxPlayers });
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
 * A message's text with an old invite link taken out, and the game it
 * pointed at (before game cards were messages of their own, an invite was a
 * link pasted into the text; those still turn into cards).
 */
export function linkedGame(body: string | null | undefined): { game: PlayGame; lobbyId: string; rest: string } | null {
  if (!body) return null;
  const invite = parseInvite(body);
  if (!invite) return null;
  return { game: invite.type, lobbyId: invite.id, rest: body.replace(inviteLinkPattern(), '').trim() };
}

/**
 * The game a chat message shows as a card, if any: a game message (kind
 * 'game'), or a text with an old invite link in it — with what is left of the
 * text once the link is out.
 */
export function gameCardOf(message: {
  kind?: string | null;
  game?: { game: PlayGame; lobbyId: string } | null;
  body?: string | null;
}): { game: PlayGame; lobbyId: string; rest: string } | null {
  if (message.kind === 'game' && message.game) return { game: message.game.game, lobbyId: message.game.lobbyId, rest: '' };
  if (message.kind && message.kind !== 'text') return null;
  return linkedGame(message.body);
}

/**
 * A game in a chat (contract §B1): what the game is, whether it can still be
 * joined — open with how many are in it, full, under way, finished, called
 * off — and a Join while it can be. The state is fetched when the card is
 * shown and again whenever `play_changed` says the lobby changed (on your own
 * channel, or in the group's room for a card shared into a group), so it
 * changes in place without anybody editing the message.
 *
 * A card the viewer may not see reads "This game isn't available", the same
 * as a game that is gone: it never says whose it was or why.
 */
export function ChatGameCard({ game, lobbyId }: { game: PlayGame; lobbyId: string }): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();
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
  const action = card?.isMember && card.status !== 'unavailable' && card.status !== 'cancelled' ? t('play.card.enter') : card?.canJoin ? t('play.card.join') : null;

  return (
    <View
      style={[styles.card, { backgroundColor: colors.glassFill }]}
      accessible={!action}
      accessibilityLabel={t('play.card.label', { game: name, state })}
    >
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: colors.controlTrack }]}>
          <Icon name={GAME_ICON[game]} size={20} color={colors.primary} />
        </View>
        <View style={styles.text}>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {name}
          </Text>
          {details ? (
            <Text style={[styles.details, { color: colors.textSecondary }]} numberOfLines={2}>
              {details}
            </Text>
          ) : null}
        </View>
      </View>
      {card ? (
        <Text style={[styles.state, { color: card.status === 'open' ? colors.success : colors.textSecondary }]}>{state}</Text>
      ) : (
        <ActivityIndicator color={colors.primary} />
      )}
      {action ? (
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={`${action}: ${name}`}
          style={({ pressed }) => [styles.button, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={[styles.buttonText, { color: colors.textOnPrimary }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 250, maxWidth: '100%', borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: { width: 36, height: 36, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
  name: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  details: { fontSize: typography.sizes.xs },
  state: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  button: { minHeight: MIN_TOUCH_TARGET, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: typography.ios.button, fontWeight: typography.weights.semibold },
});
