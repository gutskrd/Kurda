import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import type { PlayGame } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useRealtimeReconnect } from '../realtime/RealtimeProvider';
import { useUserEvents } from '../realtime/useUserEvents';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { InviteSheet } from './InviteSheet';
import { LobbyInvites } from './LobbyInvites';

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

export interface LobbySeat {
  seat: number;
  name: string | null;
  avatarUrl: string | null;
  isMe: boolean;
  isHost: boolean;
  gone?: boolean;
}

/**
 * A battle's or a match's lobby beyond the link: who is in it (a friend by
 * name, anyone else as "Player N" — the identity rule), Invite friends, and,
 * for the host, where each invite stands.
 */
export function LobbyPeople({
  game,
  lobbyId,
  players,
  isHost,
  maxPlayers,
}: {
  game: PlayGame;
  lobbyId: string;
  players: readonly LobbySeat[];
  isHost: boolean;
  maxPlayers: number;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [inviting, setInviting] = useState(false);
  return (
    <View style={styles.wrap}>
      {players.length > 0 ? (
        <View style={styles.players}>
          {players
            .filter((p) => !p.gone)
            .map((p) => {
              const name = p.isMe ? t('games.you') : (p.name ?? t('stories.player', { seat: p.seat }));
              return (
                <View key={p.seat} style={styles.player}>
                  <InitialsAvatar name={p.name ?? String(p.seat)} id={`seat-${p.seat}`} size={32} photoUrl={p.avatarUrl} />
                  <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
                    {name}
                  </Text>
                  {p.isHost ? <Icon name="crown" size={14} color={colors.gold} /> : null}
                </View>
              );
            })}
        </View>
      ) : null}
      {players.length < maxPlayers ? (
        <ClayButton label={t('stories.lobby.invite')} icon="user-plus" tone="primary" variant="outline" onPress={() => setInviting(true)} />
      ) : null}
      {isHost ? <LobbyInvites game={game} lobbyId={lobbyId} /> : null}
      {inviting ? (
        <InviteSheet target={{ kind: 'lobby', game, lobbyId, mode: maxPlayers === 2 ? 'duo' : 'group' }} onClose={() => setInviting(false)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.sm },
  players: { gap: spacing.xs },
  player: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET },
  name: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
});
