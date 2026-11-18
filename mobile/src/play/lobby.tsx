import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import type { PlayGame } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { Avatar } from '../profile/Avatar';
import { useRealtimeReconnect } from '../realtime/RealtimeProvider';
import { useUserEvents } from '../realtime/useUserEvents';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { LobbyInvites } from './LobbyInvites';
import { PlayerReportButton } from '../reports/PlayerReportButton';
import { heldDim } from '../theme/MotionParts';

/** How often a battle or match polls when nothing has prompted it; `play_changed` events drive the screen otherwise. */
const FALLBACK_POLL_MS = 10_000;

/**
 * Keeps a game screen current: on `play_changed` (or a rematch update) for this lobby, after reconnecting, and every
 * FALLBACK_POLL_MS in case an event was missed. Never in the background.
 */
export function useLobbyRefresh(game: PlayGame, lobbyId: string, refresh: () => void, active: boolean): void {
  const ref = useRef(refresh);
  ref.current = refresh;
  useUserEvents(
    useCallback(
      (ev) => {
        if ((ev.type === 'play_changed' || ev.type === 'rematch_update') && ev.game === game && ev.lobbyId === lobbyId) ref.current();
      },
      [game, lobbyId],
    ),
  );
  useRealtimeReconnect(useCallback(() => ref.current(), []));
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      setForeground(s !== 'background');
      if (s === 'active') ref.current();
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!active || !foreground) return;
    const id = setInterval(() => ref.current(), FALLBACK_POLL_MS);
    return () => clearInterval(id);
  }, [active, foreground]);
}

/** A seat's name as this viewer may see it: a friend's name, or "Player 3". */
export function seatNamer(
  players: readonly Pick<LobbySeat, 'seat' | 'name'>[],
  t: (key: 'stories.player', vars: { seat: number }) => string,
): (seat: number) => string {
  return (seat) => players.find((p) => p.seat === seat)?.name ?? t('stories.player', { seat });
}

interface LobbySeat {
  seat: number;
  name: string | null;
  avatarUrl: string | null;
  isMe: boolean;
  isHost: boolean;
  gone?: boolean;
}

/**
 * A battle's or match's lobby beyond its code: who is in it (friends by name, others as "Player N"), a report flag
 * per other player, and for the host each invite's state. Inviting friends is on the code's ticket (CodeTicket
 * `LobbyShare`). With `onRemove`, the host can remove a player by seat after confirming, as a story lobby does; a
 * removed player cannot rejoin.
 */
export function LobbyPeople({
  game,
  lobbyId,
  players,
  isHost,
  onRemove,
}: {
  game: PlayGame;
  lobbyId: string;
  players: readonly LobbySeat[];
  isHost: boolean;
  /** The host's remove action, by seat; omitted, nobody is offered it. */
  onRemove?: (seat: number) => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.wrap}>
      {players.length > 0 ? (
        <View style={styles.players}>
          {players
            .filter((p) => !p.gone)
            .map((p) => {
              const name = p.isMe ? t('games.you') : (p.name ?? t('stories.player', { seat: p.seat }));
              const remove = (): void =>
                Alert.alert(t('stories.lobby.removeTitle', { name }), t('stories.lobby.removeBody'), [
                  { text: t('common.cancel'), style: 'cancel' },
                  { text: t('common.remove'), style: 'destructive', onPress: () => onRemove?.(p.seat) },
                ]);
              return (
                <View key={p.seat} style={styles.player}>
                  <Avatar name={p.name ?? String(p.seat)} size={32} photoUrl={p.avatarUrl} />
                  <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
                    {name}
                  </Text>
                  {/* The host's crown in the quiet detail ink; gold is for what is earned. */}
                  {p.isHost ? <Icon name="crown" size={14} color={colors.textSecondary} /> : null}
                  {/* Anyone else in the lobby can be reported, by seat. */}
                  {!p.isMe ? <PlayerReportButton game={game} gameId={lobbyId} seat={p.seat} name={p.name ?? null} /> : null}
                  {onRemove && isHost && !p.isMe && !p.isHost ? (
                    <Pressable
                      onPress={remove}
                      accessibilityRole="button"
                      accessibilityLabel={t('stories.lobby.removeWho', { name })}
                      style={({ pressed }) => [styles.remove, pressed && heldDim]}
                    >
                      <Icon name="close" size={18} color={colors.textSecondary} />
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
        </View>
      ) : null}
      {isHost ? <LobbyInvites game={game} lobbyId={lobbyId} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.sm },
  players: { gap: spacing.xs },
  player: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET },
  name: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  remove: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill },
});
