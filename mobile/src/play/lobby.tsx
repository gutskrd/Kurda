import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PlayGame } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useRealtimeReconnect } from '../realtime/RealtimeProvider';
import { useUserEvents } from '../realtime/useUserEvents';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { LobbyInvites } from './LobbyInvites';
import { PlayerReportButton } from '../reports/PlayerReportButton';
import { heldDim } from '../theme/MotionParts';

/**
 * How often a battle or a match asks the server when nothing has told it to:
 * the fallback under `play_changed`, which is what moves the screen now. It
 * used to ask every 1.5–1.8 s, lobby and all, for as long as it was open.
 */
export const FALLBACK_POLL_MS = 10_000;

/**
 * Keep a game screen current: on `play_changed` (or a rematch update) for
 * this lobby on your own channel, after the connection comes back, and every
 * FALLBACK_POLL_MS in case an event was missed — never in the background.
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

/** A seat's name as this viewer may see it — a friend's name, or "Player 3" — for lines that name players by seat. */
export function seatNamer(
  players: readonly Pick<LobbySeat, 'seat' | 'name'>[],
  t: (key: 'stories.player', vars: { seat: number }) => string,
): (seat: number) => string {
  return (seat) => players.find((p) => p.seat === seat)?.name ?? t('stories.player', { seat });
}

export interface LobbySeat {
  seat: number;
  name: string | null;
  avatarUrl: string | null;
  isMe: boolean;
  isHost: boolean;
  gone?: boolean;
}

/**
 * A battle's or a match's lobby beyond its code: who is in it (a friend by
 * name, anyone else as "Player N" — the identity rule), each other player
 * with a flag to report them by seat, and, for the host, where each invite
 * stands. Invite friends is on the code's ticket (CodeTicket `LobbyShare`),
 * beside the other way of bringing people in.
 *
 * With `onRemove`, the host can take another player out by seat, asked first
 * as a story game's lobby asks (stories/game/Lobby): it cannot be taken back,
 * since a player removed cannot join that lobby again.
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
  /** the host's remove, by seat; left out, nobody is offered it */
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
                  <InitialsAvatar name={p.name ?? String(p.seat)} id={`seat-${p.seat}`} size={32} photoUrl={p.avatarUrl} />
                  <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
                    {name}
                  </Text>
                  {p.isHost ? <Icon name="crown" size={14} color={colors.gold} /> : null}
                  {/* anyone else in the lobby can be reported, by seat */}
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
