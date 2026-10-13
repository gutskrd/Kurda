import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { PlayGame, RematchState } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { useRealtimeReconnect } from '../realtime/RealtimeProvider';
import { useUserEvents } from '../realtime/useUserEvents';
import { ClayButton } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { declineRematch, offerRematch, rematchState } from './api';

/**
 * What the panel shows, from the server's RematchState (contract §B1 "Play
 * again"): two players each ask (lichess), and the second "Rematch" starts
 * the next game at once; with more players the host opens the next round and
 * everyone else may join it with one tap. Nobody is put in a game they did
 * not choose.
 */
export type RematchView =
  | { kind: 'pair-offer' }
  | { kind: 'pair-waiting' }
  | { kind: 'pair-asked' }
  | { kind: 'pair-declined' }
  | { kind: 'round-open' }
  | { kind: 'round-join'; lobbyId: string }
  | { kind: 'round-wait' }
  | { kind: 'next'; lobbyId: string };

export function rematchView(state: RematchState): RematchView {
  if (state.kind === 'pair') {
    if (state.nextLobbyId) return { kind: 'next', lobbyId: state.nextLobbyId };
    if (state.otherDeclined) return { kind: 'pair-declined' };
    if (state.offeredByOther && !state.offeredByMe) return { kind: 'pair-asked' };
    if (state.offeredByMe) return { kind: 'pair-waiting' };
    return { kind: 'pair-offer' };
  }
  if (state.canOpenRound) return state.nextLobbyId ? { kind: 'next', lobbyId: state.nextLobbyId } : { kind: 'round-open' };
  return state.nextLobbyId ? { kind: 'round-join', lobbyId: state.nextLobbyId } : { kind: 'round-wait' };
}

/**
 * "Play again" on a results screen, the same for every online game. `other`
 * is the other player's name as the game shows it (a friend's name, or
 * "Player 2"). A pair game the two both asked for opens straight away; the
 * host's new round opens for the host, and the others choose to join it.
 * Leaving the results with an offer standing takes the offer back.
 */
export function RematchPanel({
  game,
  lobbyId,
  other,
  onOpen,
  onInviteOthers,
}: {
  game: PlayGame;
  lobbyId: string;
  other: string;
  /** go to the next game (it exists and this player is in it, or may join it) */
  onOpen: (nextLobbyId: string) => void;
  /** "Invite someone else": the invite sheet for this game */
  onInviteOthers?: () => void;
}): React.JSX.Element | null {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [state, setState] = useState<RematchState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const opened = useRef<string | null>(null);
  const offered = useRef(false);

  const load = useCallback(() => {
    void rematchState(client, game, lobbyId).then((res) => {
      if (res.ok) setState(res.data);
    });
  }, [client, game, lobbyId]);

  useEffect(load, [load]);
  useRealtimeReconnect(load);
  useUserEvents(
    useCallback(
      (ev) => {
        if ((ev.type === 'rematch_update' || ev.type === 'play_changed') && ev.game === game && ev.lobbyId === lobbyId) load();
      },
      [load, game, lobbyId],
    ),
  );

  const view = state ? rematchView(state) : null;

  // Both asked (or the host opened the round): the next game exists, and
  // they go to it. Only when that happens while this screen is up — coming
  // back to these results later shows a button instead of bouncing forward.
  const firstSeen = useRef(true);
  useEffect(() => {
    if (!view) return;
    const first = firstSeen.current;
    firstSeen.current = false;
    if (view.kind !== 'next' || opened.current === view.lobbyId) return;
    opened.current = view.lobbyId;
    if (!first) onOpen(view.lobbyId);
  }, [view, onOpen]);

  // an offer stands while both are on the results; leaving takes it back
  useEffect(() => {
    offered.current = state?.kind === 'pair' && state.offeredByMe && !state.nextLobbyId;
  }, [state]);
  useEffect(
    () => () => {
      if (offered.current) void declineRematch(client, game, lobbyId);
    },
    [client, game, lobbyId],
  );

  const run = async (work: () => ReturnType<typeof offerRematch>): Promise<void> => {
    setBusy(true);
    setError(null);
    const res = await work();
    setBusy(false);
    if (res.ok) setState(res.data);
    else setError(describeError(res.error, t));
  };

  if (!view) return null;

  const line = (text: string) => (
    <Text style={[styles.line, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
      {text}
    </Text>
  );

  const series = state?.series;
  return (
    <View style={styles.wrap}>
      {/* the running score, once there has been a rematch: after one game it is only that game's result */}
      {series && series.me + series.other + series.draws >= 2 ? (
        <View accessible accessibilityLabel={t('play.rematch.seriesLabel', { me: series.me, other: series.other, name: other })}>
          <Text style={[styles.series, { color: colors.textPrimary }]}>{t('play.rematch.series', { me: series.me, other: series.other })}</Text>
          <Text style={[styles.line, { color: colors.textSecondary }]}>{t('play.rematch.seriesLabel', { me: series.me, other: series.other, name: other })}</Text>
        </View>
      ) : null}
      {view.kind === 'pair-offer' ? (
        <ClayButton label={t('play.rematch.offer')} icon="repost" tone="primary" size="large" busy={busy} onPress={() => void run(() => offerRematch(client, game, lobbyId))} />
      ) : null}
      {view.kind === 'pair-waiting' ? (
        <>
          {line(t('play.rematch.waiting', { name: other }))}
          <ClayButton label={t('play.rematch.withdraw')} variant="outline" busy={busy} onPress={() => void run(() => declineRematch(client, game, lobbyId))} />
        </>
      ) : null}
      {view.kind === 'pair-asked' ? (
        <>
          {line(t('play.rematch.asked', { name: other }))}
          <View style={styles.row}>
            <ClayButton label={t('play.rematch.accept')} tone="primary" busy={busy} onPress={() => void run(() => offerRematch(client, game, lobbyId))} style={styles.grow} />
            <ClayButton label={t('play.rematch.noThanks')} busy={busy} onPress={() => void run(() => declineRematch(client, game, lobbyId))} style={styles.grow} />
          </View>
        </>
      ) : null}
      {view.kind === 'pair-declined' ? line(t('play.rematch.declined', { name: other })) : null}
      {view.kind === 'round-open' ? (
        <ClayButton label={t('play.rematch.newRound')} icon="repost" tone="primary" size="large" busy={busy} onPress={() => void run(() => offerRematch(client, game, lobbyId))} />
      ) : null}
      {view.kind === 'round-join' ? (
        <>
          {line(t('play.rematch.roundOpen'))}
          <ClayButton label={t('play.rematch.joinRound')} tone="primary" size="large" onPress={() => onOpen(view.lobbyId)} />
        </>
      ) : null}
      {view.kind === 'round-wait' ? line(t('play.rematch.hostMayStart')) : null}
      {view.kind === 'next' ? (
        <ClayButton label={t('play.rematch.openNext')} tone="primary" size="large" onPress={() => onOpen(view.lobbyId)} />
      ) : null}
      {onInviteOthers ? <ClayButton label={t('play.rematch.inviteOthers')} icon="user-plus" variant="outline" onPress={onInviteOthers} /> : null}
      {error ? <Text style={[styles.line, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, alignSelf: 'stretch' },
  row: { flexDirection: 'row', gap: spacing.sm },
  grow: { flex: 1 },
  line: { fontSize: typography.sizes.md, textAlign: 'center' },
  series: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, textAlign: 'center' },
});
