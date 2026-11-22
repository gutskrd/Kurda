import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { MultiGame, MultiResult, MultiSeat, MultiView } from '@kurda/shared';
import { describeError, type Translate } from '../api/errors';
import { haptic } from '../feedback/haptics';
import { leftResults, reportGameFinished } from '../feedback/gameFinished';
import { useI18n } from '../i18n/I18nContext';
import { PlayerReportButton } from '../reports/PlayerReportButton';
import { ClayButton, GlassCard } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useGameBack } from '../navigation/hardwareBack';
import { askLeaveGame } from './backOut';
import { LobbyShare } from './CodeTicket';
import { InviteSheet } from './InviteSheet';
import { LobbyPeople } from './lobby';
import { useQuietInvites } from './quietInvites';
import { RematchPanel } from './RematchPanel';
import { TeamPicker } from './TeamPicker';
import type { GameViewHandle } from './useGameView';
import { Verdict } from './Verdict';
import { Loading } from '../theme/Loading';

/** How a seat of a multiplayer learning game is named: "You", Hevalo, a friend's name, or "Player 3". */
export function multiSeatName(p: Pick<MultiSeat, 'seat' | 'name' | 'isMe' | 'bot'>, t: Translate): string {
  if (p.isMe) return t('games.you');
  if (p.bot) return t('play.room.hevalo');
  return p.name ?? t('stories.player', { seat: p.seat });
}

interface GameRoomProps<Board> {
  game: MultiGame;
  id: string;
  room: GameViewHandle<Board>;
  /** Starts a new game of this kind (the start of this screen). */
  onNew: () => void;
  /** Opens the next game of a rematch or round. */
  onOpen: (id: string) => void;
  newLabel: string;
  /** The lobby's note on the game's settings. */
  lobbyNote?: (view: MultiView<Board>) => ReactNode;
  /** The game itself, while under way. */
  playing: (view: MultiView<Board>) => ReactNode;
  /** The game's own word on how it ended. */
  ending?: (view: MultiView<Board>) => ReactNode;
  scoreOf: (result: MultiResult, view: MultiView<Board>) => string;
}

/**
 * The room around any multiplayer learning game, matching web/src/play/MultiRoom.tsx: the code ticket with Invite
 * friends, players by seat with report buttons, Join, Start, and afterwards the places and Play again. The game
 * draws only its own staging.
 *
 * Places show XP only beside players who earned some, never a zero. A game against Hevalo alone earns none, and
 * its results say so.
 */
export function GameRoom<Board>({
  game,
  id,
  room,
  onNew,
  onOpen,
  newLabel,
  lobbyNote,
  playing,
  ending,
  scoreOf,
}: GameRoomProps<Board>): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const { load } = room;
  const view = load.state === 'ready' ? load.view : null;
  useQuietInvites(view?.status === 'active');
  const navigation = useNavigation();
  // A game in play asks before Android's back leaves it and cannot be swiped away on iOS, as a battle does.
  useGameBack(view?.status === 'active' && view.me ? () => askLeaveGame(t, () => navigation.goBack()) : null);

  // A game played to its end here counts as finished for the rating box; one opened already finished does not.
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
    // Not found, not allowed and removed share one message, as the server gives one answer.
    const key = load.state === 'gone' && load.why === 'started' ? 'stories.join.started' : view?.status === 'cancelled' ? 'stories.game.cancelled' : 'play.card.unavailable';
    return (
      <GlassCard>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={[styles.verdict, { color: colors.textPrimary }]}>
            {t(key)}
          </Text>
          <ClayButton label={newLabel} tone="primary" onPress={onNew} style={styles.stretch} />
        </View>
      </GlassCard>
    );
  }
  if (load.state === 'error') {
    return (
      <GlassCard>
        <View style={styles.card}>
          <Text style={[styles.error, { color: colors.danger }]}>{t('play.card.unavailable')}</Text>
          <ClayButton label={t('common.retry')} tone="primary" onPress={room.refresh} style={styles.stretch} />
        </View>
      </GlassCard>
    );
  }
  if (!view) return <Loading style={styles.loading} />;

  const name = (seat: number): string => {
    const p = view.players.find((x) => x.seat === seat);
    return p ? multiSeatName(p, t) : t('stories.player', { seat });
  };
  const present = view.players.filter((p) => !p.gone);

  if (view.status === 'lobby') {
    const enough = present.length >= view.minPlayers;
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
        <GlassCard>
          <View style={styles.card}>
            {lobbyNote?.(view)}
            <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t('games.lobbyWaiting', { count: present.length })}</Text>
            {view.me !== null && view.teams > 0 ? (
              <TeamPicker
                players={view.players}
                teams={view.teams}
                isHost={view.isHost}
                game={game}
                lobbyId={id}
                onTeam={(seat, team) => control('team', { seat, team })}
              />
            ) : view.me !== null ? (
              <LobbyPeople game={game} lobbyId={id} players={view.players.map((p) => ({ ...p, name: p.isMe ? p.name : p.bot ? t('play.room.hevalo') : p.name }))} isHost={view.isHost} />
            ) : null}
            {notice ? <Text style={[styles.error, { color: colors.danger }]}>{notice}</Text> : null}
            {view.me === null ? (
              <ClayButton label={busy ? t('games.joining') : t('play.room.join')} tone="primary" busy={busy} onPress={() => void control('join')} style={styles.stretch} />
            ) : view.isHost && enough ? (
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
          </View>
        </GlassCard>
      </>
    );
  }

  if (view.status === 'active') {
    return (
      <>
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

  // Finished.
  const mine = view.results?.find((r) => r.seat === view.me?.seat);
  const other = view.players.find((p) => !p.isMe && !p.bot);
  return (
    <GlassCard>
      <View style={styles.card}>
        <Verdict won={mine?.place === 1}>{mine?.place === 1 ? t('games.youWon') : t('play.room.over')}</Verdict>
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
                {r.xpAwarded ? <Text style={[styles.xp, { color: colors.goldText }]}>+{r.xpAwarded} XP</Text> : null}
                {p && !p.isMe && !p.bot ? <PlayerReportButton game={game} gameId={id} seat={r.seat} name={p.name} /> : null}
              </View>
            );
          })}
        </View>
        {view.mode === 'solo' ? <Text style={[styles.note, { color: colors.textSecondary }]}>{t('games.noXpAlone')}</Text> : null}
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
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  // Content is laid out on an inner View: a GlassCard's own style dresses only its outside.
  card: { alignItems: 'center', gap: spacing.sm },
  verdict: { fontSize: typography.sizes.title, fontWeight: typography.weights.bold, textAlign: 'center' },
  stretch: { alignSelf: 'stretch', marginTop: spacing.sm },
  loading: { marginTop: spacing.xl },
  blurb: { fontSize: typography.sizes.text, textAlign: 'center', lineHeight: 20 },
  note: { fontSize: typography.sizes.text, textAlign: 'center' },
  waiting: { fontSize: typography.sizes.text, textAlign: 'center', marginTop: spacing.sm },
  error: { fontSize: typography.sizes.text, textAlign: 'center' },
  scoreLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET },
  rank: { width: 20, fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  scoreName: { flex: 1, fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  scoreValue: { fontSize: typography.sizes.text },
  xp: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
});
