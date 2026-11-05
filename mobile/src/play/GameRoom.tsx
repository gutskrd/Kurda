import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { MultiGame, MultiResult, MultiSeat, MultiView } from '@kurda/shared';
import { describeError, type Translate } from '../api/errors';
import { haptic } from '../feedback/haptics';
import { leftResults, reportGameFinished } from '../feedback/gameFinished';
import { useI18n } from '../i18n/I18nContext';
import { LobbyRated, RatedPill } from '../ranks/Rated';
import { RankResultPanel } from '../ranks/RankResultPanel';
import { PlayerReportButton } from '../reports/PlayerReportButton';
import { ClayButton, GlassCard } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { LobbyShare } from './CodeTicket';
import { InviteSheet } from './InviteSheet';
import { LobbyPeople } from './lobby';
import { useQuietInvites } from './quietInvites';
import { RematchPanel } from './RematchPanel';
import type { GameViewHandle } from './useGameView';

/** "You", Hevalo, a friend's name, or "Player 3": how a seat of a multiplayer learning game is named. */
export function multiSeatName(p: Pick<MultiSeat, 'seat' | 'name' | 'isMe' | 'bot'>, t: Translate): string {
  if (p.isMe) return t('games.you');
  if (p.bot) return t('play.room.hevalo');
  return p.name ?? t('stories.player', { seat: p.seat });
}

export interface GameRoomProps<Board> {
  game: MultiGame;
  id: string;
  room: GameViewHandle<Board>;
  /** a new game of this kind (the start of this screen) */
  onNew: () => void;
  /** the next game of a rematch or round */
  onOpen: (id: string) => void;
  newLabel: string;
  /** what the lobby says about the game's settings */
  lobbyNote?: (view: MultiView<Board>) => ReactNode;
  /** the game itself, while it is under way */
  playing: (view: MultiView<Board>) => ReactNode;
  /** the game's own word on how it ended */
  ending?: (view: MultiView<Board>) => ReactNode;
  scoreOf: (result: MultiResult, view: MultiView<Board>) => string;
}

/**
 * The room around any multiplayer learning game, on the phone — the same
 * room as the website's (web/src/play/MultiRoom.tsx), made of the phone's own
 * play parts: the code on its ticket with Invite friends, who is in it by seat
 * with a report beside each other player, Rated or Friendly, Join, Start, and
 * after the game its places, what it did to your rank, and Play again. The
 * game draws only its own staging.
 */
export function GameRoom<Board>({ game, id, room, onNew, onOpen, newLabel, lobbyNote, playing, ending, scoreOf }: GameRoomProps<Board>): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const { load } = room;
  const view = load.state === 'ready' ? load.view : null;
  useQuietInvites(view?.status === 'active');

  // a game played here to its end is a finished game for the rating box; one opened already finished is not
  const played = useRef(false);
  useEffect(() => {
    if (view?.status === 'active' && view.me) played.current = true;
    if (view?.status === 'finished' && played.current) {
      played.current = false;
      const mine = view.results?.find((r) => r.seat === view.me?.seat);
      reportGameFinished({ moment: mine?.place === 1 ? 'won' : 'other' });
      AccessibilityInfo.announceForAccessibility?.(mine?.place === 1 ? t('games.youWon') : t('play.room.over'));
    }
  }, [view?.status, view?.me, view?.results, t]);
  useEffect(() => () => leftResults(), [id]);

  async function control(path: string, body?: unknown): Promise<void> {
    setBusy(true);
    setNotice(null);
    const res = await room.act(path, body);
    setBusy(false);
    if (!res.ok) setNotice(describeError(res.error, t));
  }
  async function leave(): Promise<void> {
    await room.act('leave');
    onNew();
  }

  if (load.state === 'gone' || view?.status === 'cancelled') {
    // not found, not allowed, removed: one answer, as the server gives one
    const key = load.state === 'gone' && load.why === 'started' ? 'stories.join.started' : view?.status === 'cancelled' ? 'stories.game.cancelled' : 'play.card.unavailable';
    return (
      <GlassCard style={styles.card}>
        <Text accessibilityRole="header" style={[styles.verdict, { color: colors.textPrimary }]}>
          {t(key)}
        </Text>
        <ClayButton label={newLabel} tone="primary" onPress={onNew} style={styles.stretch} />
      </GlassCard>
    );
  }
  if (load.state === 'error') {
    return (
      <GlassCard style={styles.card}>
        <Text style={[styles.error, { color: colors.danger }]}>{t('play.card.unavailable')}</Text>
        <ClayButton label={t('common.retry')} tone="primary" onPress={room.refresh} style={styles.stretch} />
      </GlassCard>
    );
  }
  if (!view) return <ActivityIndicator color={colors.primary} style={styles.loading} />;

  const name = (seat: number): string => {
    const p = view.players.find((x) => x.seat === seat);
    return p ? multiSeatName(p, t) : t('stories.player', { seat });
  };
  const present = view.players.filter((p) => !p.gone);

  if (view.status === 'lobby') {
    return (
      <>
        {view.me !== null ? (
          <LobbyShare
            game={game}
            lobbyId={id}
            code={view.code}
            canInvite={view.isHost && present.length < view.maxPlayers}
            mode={view.maxPlayers === 2 ? 'duo' : 'group'}
          />
        ) : null}
        <GlassCard style={styles.card}>
          {lobbyNote?.(view)}
          <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t('games.lobbyWaiting', { count: present.length })}</Text>
          {view.me !== null ? (
            <LobbyPeople game={game} lobbyId={id} players={view.players.map((p) => ({ ...p, name: p.isMe ? p.name : p.bot ? t('play.room.hevalo') : p.name }))} isHost={view.isHost} />
          ) : null}
          {view.me !== null ? (
            <LobbyRated game={game} lobbyId={id} rated={view.rated} isHost={view.isHost} players={present.length} seatName={name} onChanged={room.refresh} />
          ) : (
            <RatedPill rated={view.rated.rated} />
          )}
          {notice ? <Text style={[styles.error, { color: colors.danger }]}>{notice}</Text> : null}
          {view.me === null ? (
            <ClayButton label={busy ? t('games.joining') : t('play.room.join')} tone="primary" busy={busy} onPress={() => void control('join')} style={styles.stretch} />
          ) : view.isHost && present.length >= view.minPlayers ? (
            <ClayButton
              label={busy ? t('games.starting') : t('play.room.start')}
              tone="primary"
              busy={busy}
              onPress={() => {
                haptic('tap');
                void control('start');
              }}
              style={styles.stretch}
            />
          ) : (
            <Text style={[styles.waiting, { color: colors.textSecondary }]}>{view.isHost ? t('play.room.waiting') : t('play.room.waitingHost')}</Text>
          )}
          {view.me !== null ? <ClayButton label={t('stories.lobby.leave')} tone="neutral" variant="outline" onPress={() => void leave()} style={styles.stretch} /> : null}
        </GlassCard>
      </>
    );
  }

  if (view.status === 'active') {
    return (
      <>
        {view.mode === 'group' ? <RatedPill rated={view.rated.counts ?? view.rated.rated} small /> : null}
        {view.canControl && !view.isHost && view.mode === 'group' ? (
          <Text style={[styles.note, { color: colors.textSecondary }]}>{t('play.room.standIn')}</Text>
        ) : null}
        {playing(view)}
        {view.me !== null ? (
          <ClayButton
            label={leaving ? t('play.room.leaveGameConfirm') : t('play.room.leaveGame')}
            tone={leaving ? 'danger' : 'neutral'}
            variant="outline"
            onPress={() => (leaving ? void leave() : setLeaving(true))}
            style={styles.stretch}
          />
        ) : null}
      </>
    );
  }

  // finished
  const mine = view.results?.find((r) => r.seat === view.me?.seat);
  const other = view.players.find((p) => !p.isMe && !p.bot);
  return (
    <GlassCard style={styles.card}>
      <Text accessibilityRole="header" style={[styles.verdict, { color: colors.primary }]}>
        {mine?.place === 1 ? t('games.youWon') : t('play.room.over')}
      </Text>
      {view.mode === 'group' && view.rated.rated ? <RankResultPanel game={game} gameRef={id} /> : null}
      {ending?.(view)}
      <View style={styles.stretch} accessibilityLabel={t('play.room.results')}>
        {(view.results ?? []).map((r) => {
          const p = view.players.find((x) => x.seat === r.seat);
          return (
            <View key={r.seat} style={styles.scoreLine}>
              <Text style={[styles.rank, { color: colors.textSecondary }]}>{r.place}</Text>
              <Text style={[styles.scoreName, { color: p?.isMe ? colors.primary : colors.textPrimary }]} numberOfLines={1}>
                {name(r.seat)}
              </Text>
              <Text style={[styles.scoreValue, { color: colors.textSecondary }]}>{scoreOf(r, view)}</Text>
              {r.xpAwarded ? <Text style={[styles.xp, { color: colors.gold }]}>+{r.xpAwarded} XP</Text> : null}
              {p && !p.isMe && !p.bot ? <PlayerReportButton game={game} gameId={id} seat={r.seat} name={p.name} /> : null}
            </View>
          );
        })}
      </View>
      {view.me !== null && view.mode === 'group' ? (
        <View style={styles.stretch}>
          <RematchPanel
            game={game}
            lobbyId={id}
            isHost={view.canControl}
            other={other ? name(other.seat) : t('games.opponent')}
            onOpen={onOpen}
            onInviteOthers={() => setInviting(true)}
          />
        </View>
      ) : null}
      <ClayButton label={newLabel} tone="neutral" onPress={onNew} style={styles.stretch} />
      {inviting ? <InviteSheet target={{ kind: 'new', game }} onClose={() => setInviting(false)} /> : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: spacing.sm },
  stretch: { alignSelf: 'stretch', marginTop: spacing.sm },
  loading: { marginTop: spacing.xl },
  blurb: { fontSize: typography.sizes.md, textAlign: 'center', lineHeight: 20 },
  note: { fontSize: typography.sizes.sm, textAlign: 'center' },
  waiting: { fontSize: typography.sizes.md, textAlign: 'center', marginTop: spacing.sm },
  error: { fontSize: typography.sizes.sm, textAlign: 'center' },
  verdict: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, textAlign: 'center' },
  scoreLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET },
  rank: { width: 20, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  scoreName: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  scoreValue: { fontSize: typography.sizes.sm },
  xp: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
});
