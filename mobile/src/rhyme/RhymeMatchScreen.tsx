import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { leftResults, reportGameFinished } from '../feedback/gameFinished';
import { ClayButton, ErrorRetry, GlassCard, Segmented } from '../theme/glass';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useGameBack } from '../navigation/hardwareBack';
import { LobbyPeople, useLobbyRefresh } from '../play/lobby';
import { FriendPicker, togglePick, useFriendsToAsk } from '../play/FriendPicker';
import { inviteFriends } from '../play/api';
import { showNotice } from '../theme/notice';
import { askLeaveGame, useLeaveLobbyOnBack } from '../play/backOut';
import { useQuietInvites } from '../play/quietInvites';
import { InviteSheet } from '../play/InviteSheet';
import { LobbyShare } from '../play/CodeTicket';
import { JoinCodeCard } from '../play/JoinByCode';
import { RematchPanel } from '../play/RematchPanel';
import { Verdict } from '../play/Verdict';
import { PlayerReportButton } from '../reports/PlayerReportButton';
import {
  createMatch,
  getMatch,
  getMatchResults,
  joinMatch,
  leaveMatch,
  removeFromMatch,
  startMatch,
  submitRhyme,
  type Dialect,
  type MatchResults,
  type MatchState,
  type RhymeQuality,
  type RhymeReject,
} from './matchApi';
import { Loading } from '../theme/Loading';
import { GameArt } from '../games/GameArt';
import { useDirection } from '../reports/direction';
import { useCourseDialect } from '../learn/courseDialect';
import { MissedRhymes, wordDirection } from '../wordle/WordAnswer';
import { Shell } from '../wordle/WordleBattleScreen';
import { isRhymeOffered, offeredRhymeDialects, openingRhymeDialect, useRhymeOffered } from './availability';
import { dialectNameKey } from '../i18n/dialectName';
import { MAX_INVITEES_PER_REQUEST } from '@kurda/shared';

const REJECT_KEY: Record<RhymeReject, TranslationKey> = {
  'not-a-word': 'games.rhyme.reject.notAWord',
  'is-prompt': 'games.rhyme.reject.isPromptShort',
  'already-used': 'games.rhyme.reject.alreadyUsed',
  'no-rhyme': 'games.rhyme.reject.noRhyme',
  profane: 'games.rhyme.reject.profane',
  // An ending doing all the rhyming (malan for baran) has no sentence of its own yet; the general one is fair.
  inflected: 'games.rhyme.reject.other',
  'window-closed': 'games.rhymeMatch.timeUpMatch',
};


/** How often the local clock ticks between polls, so the timer does not jump. */
const TICK_MS = 200;

/**
 * Rhyme Match: out-rhyme a friend against the clock. Built like Peyvok Battle on the poll-safe REST endpoints, so
 * a realtime scoreboard can be layered on later without changing this screen.
 *
 * Without `id` the screen creates a room or joins one by code; with one it is that room, so a code, an invite or
 * an old invite link opens straight into a match. Backing out of the lobby leaves it after asking (play/backOut),
 * the host can remove a player by seat, and Android's back during a round asks before leaving.
 *
 * Matches are made in the learner's own variety when offered there (availability.ts); a variety without enough
 * prompts is left out of the choice. The prompt and rhymes are written in the match's direction, and the results
 * end with the rhymes nobody found, with their meanings.
 */
export function RhymeMatchScreen({ id: initialId, onExit }: { id?: string; onExit: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const [id, setId] = useState<string | null>(initialId ?? null);
  /*
   * Another match opened while this screen is up (an invite's Join, a game card, "Invite someone else") arrives
   * as new params on this screen, so the room follows them.
   */
  useEffect(() => {
    if (initialId) setId(initialId);
  }, [initialId]);
  // A game's results are left when another game opens here or the screen closes, and their rating box goes with
  // them (feedback/gameFinished).
  useEffect(() => () => leftResults(), [id]);

  return (
    <Shell title={t('games.rhymeMatch.name')} onExit={onExit}>
      {id ? <MatchRoom key={id} id={id} onLeave={() => setId(null)} onOpen={setId} onExit={onExit} /> : <CreateMatch onEnter={setId} />}
    </Shell>
  );
}

/**
 * Pick a dialect and friends to ask, and open a room — or join one with the code a friend gave you. As on the
 * website, asking nobody is fine. Games are played for fun, so every match is friendly.
 */
function CreateMatch({ onEnter }: { onEnter: (id: string) => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const offered = useRhymeOffered();
  const course = useCourseDialect();
  // The learner's own variety where matches are offered in it, until the host picks one.
  const [picked, setPicked] = useState<Dialect | null>(null);
  // A variety picked before the server answered that turns out not to be offered falls back to the opening one.
  const dialect = picked && isRhymeOffered(offered, picked) ? picked : openingRhymeDialect(offered, course, locale);
  const canCreate = isRhymeOffered(offered, dialect);
  const choices = offeredRhymeDialects(offered);
  const { friends, recentIds } = useFriendsToAsk();
  const [asked, setAsked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const res = await createMatch(client, dialect);
    if (res.ok && asked.length > 0) {
      // The room exists whatever happens to the invites; one that did not go is said, and the room can ask again.
      const sent = await inviteFriends(client, 'rhyme-match', res.data.id, asked);
      if (!sent.ok) showNotice(describeError(sent.error, t));
    }
    setBusy(false);
    if (res.ok) onEnter(res.data.id);
    else setError(res.error.code === 'EMPTY_LEXICON' ? t('games.emptyPool') : describeError(res.error, t));
  };

  return (
    <>
      <GlassCard>
        <View style={styles.card}>
          {/* The game's own cover, as its stamp and the solo round show it. */}
          <GameArt game="rhyme" size={72} />
          <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t('games.rhymeMatch.intro')}</Text>
          {choices.length > 1 ? (
            <>
              <Text style={[styles.label, dir.text, { color: colors.textSecondary }]}>{t('games.dialect')}</Text>
              <View style={styles.stretch}>
                <Segmented<Dialect>
                  options={choices}
                  value={dialect}
                  onChange={(d) => {
                    setPicked(d);
                    setError(null);
                  }}
                  labelOf={(d) => t(dialectNameKey(d))}
                  groupLabel={t('games.dialect')}
                  wrap
                />
              </View>
            </>
          ) : null}
          {/* Who to ask, in the same step, as the website's page has it. */}
          {canCreate ? (
            <View style={[styles.stretch, styles.who]}>
              <Text style={[styles.label, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
                {t('play.invite.friends')}
              </Text>
              <FriendPicker
                friends={friends}
                recentIds={recentIds}
                picked={asked}
                onToggle={(friend) => setAsked((list) => togglePick(list, friend, false, MAX_INVITEES_PER_REQUEST))}
                limit={MAX_INVITEES_PER_REQUEST}
              />
            </View>
          ) : null}
          {/* A variety with no matches yet says so where Create would be. */}
          {canCreate ? (
            <ClayButton
              label={t('games.rhymeMatch.create')}
              // Working: the button spins and ignores a second press, and screen readers are told what it is doing.
              accessibilityLabel={busy ? t('games.creating') : undefined}
              busy={busy}
              icon="play"
              tone="primary"
              onPress={() => void create()}
              style={styles.stretch}
            />
          ) : (
            <Text style={[styles.blurb, styles.stretch, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
              {t('games.rhyme.notOffered')}
            </Text>
          )}
          {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
        </View>
      </GlassCard>

      {/* A match somebody else made: its code opens it, whichever game it turns out to be. */}
      <JoinCodeCard />
    </>
  );
}

/** One room: lobby, the timed round, the scoreboard. Polls until it is over. */
function MatchRoom({
  id,
  onLeave,
  onOpen,
  onExit,
}: {
  id: string;
  /** To a new match, in this screen. */
  onLeave: () => void;
  onOpen: (id: string) => void;
  /** The screen's own back. */
  onExit: () => void;
}): React.JSX.Element {
  const { client, user } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();

  const [match, setMatch] = useState<MatchState | null>(null);
  const [results, setResults] = useState<MatchResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [found, setFound] = useState<Array<{ word: string; quality: RhymeQuality; points: number }>>([]);
  const loadedOnce = useRef(false);
  // Results: "Invite someone else" opens the invite sheet for this game.
  const [inviting, setInviting] = useState(false);
  // The server has no match here for this viewer: never one, not theirs, or the host removed them.
  const [gone, setGone] = useState(false);

  const load = useCallback(async () => {
    const res = await getMatch(client, id);
    if (res.ok) {
      setMatch(res.data);
      setRemaining(res.data.remainingMs);
      loadedOnce.current = true;
    } else if (res.error.status === 404) {
      setGone(true);
    } else if (!loadedOnce.current) {
      // A later poll failing is a blip; the first one failing is the whole screen.
      setError(res.error.code === 'GAME_STARTED' ? t('stories.join.started') : describeError(res.error, t));
    }
  }, [client, id, t]);

  /*
   * Every scored word, join and start is pushed as `play_changed` and the screen refetches then, with a slow poll
   * underneath in case one is missed.
   */
  useEffect(() => {
    void load();
  }, [load]);
  useLobbyRefresh('rhyme-match', id, () => void load(), !gone && match?.status !== 'finished' && match?.status !== 'cancelled');

  // Results are fetched once the match is over and nothing polls; a failed fetch is shown with a retry, not an
  // endless spinner.
  const [resultsFailed, setResultsFailed] = useState(false);
  const [resultsAsk, setResultsAsk] = useState(0);
  useEffect(() => {
    if (match?.status !== 'finished' || results) return;
    setResultsFailed(false);
    void getMatchResults(client, id).then((r) => {
      if (r.ok) setResults(r.data);
      else setResultsFailed(true);
    });
  }, [match?.status, results, client, id, resultsAsk]);

  // A match played to its end here counts as a finished game for the rating box; one opened already finished does not.
  const played = useRef(false);
  useEffect(() => {
    if (match?.status === 'active' && match.me) played.current = true;
  }, [match?.status, match?.me]);
  useEffect(() => {
    if (!results || !played.current) return;
    played.current = false;
    const mine = results.ranking.find((r) => r.userId === user?.id);
    if (mine) reportGameFinished({ moment: mine.rank === 1 ? 'won' : 'other' });
  }, [results, user?.id]);

  /* The clock runs locally between polls and resyncs on each, so it neither stutters in whole seconds nor drifts. */
  useEffect(() => {
    if (match?.status !== 'active' || remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((ms) => Math.max(0, ms - TICK_MS)), TICK_MS);
    return () => clearTimeout(timer);
  }, [remaining, match?.status]);

  const active = match?.status === 'active' && match.me != null && remaining > 0;
  // An invite waits while a match is on (the banner would sit over the clock).
  useQuietInvites(match?.status === 'active');
  const isHost = match ? (match.isHost ?? match.createdBy === user?.id) : false;
  // Backing out of the lobby leaves it after asking; during a round Android's back asks and the iOS swipe is off.
  useLeaveLobbyOnBack(!gone && match?.status === 'lobby' && match.me != null, isHost, () => leaveMatch(client, id));
  useGameBack(active ? () => askLeaveGame(t, onExit) : null);

  const submit = useCallback(async () => {
    const typed = word.trim();
    if (!typed || !active || busy) return;
    setBusy(true);
    setNotice(null);
    const res = await submitRhyme(client, id, typed);
    setBusy(false);
    if (!res.ok) {
      // Time running out is the game, not a failure; anything else kept the word from going.
      if (res.error.code !== 'NOT_ACTIVE') haptic('error');
      setNotice(res.error.code === 'NOT_ACTIVE' ? t('games.rhymeMatch.timeUpMatch') : describeError(res.error, t));
      return;
    }
    setMatch(res.data.match);
    setRemaining(res.data.match.remainingMs);
    setWord('');
    const { result } = res.data;
    haptic(result.accepted ? 'correct' : 'wrong');
    if (result.accepted) {
      setFound((f) => [{ word: result.normalized, quality: result.quality, points: result.points }, ...f]);
    } else {
      setNotice(t(result.reason ? REJECT_KEY[result.reason] : 'games.rhyme.reject.other'));
    }
  }, [word, active, busy, client, id, t]);

  const act = async (work: () => Promise<{ ok: true; data: MatchState } | { ok: false; error: ApiError }>) => {
    setBusy(true);
    setNotice(null);
    const res = await work();
    setBusy(false);
    if (res.ok) setMatch(res.data);
    else setNotice(describeError(res.error, t));
  };

  // Cancelled by the host, or gone for this viewer: said plainly, with a new match one tap away.
  if (gone || match?.status === 'cancelled') {
    return (
      <GlassCard>
        <View style={styles.card}>
          <Text style={[styles.blurb, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
            {gone ? t('stories.game.unavailable') : t('stories.game.cancelled')}
          </Text>
          <ClayButton label={t('games.rhymeMatch.new')} tone="primary" onPress={onLeave} style={styles.stretch} />
        </View>
      </GlassCard>
    );
  }
  if (error && !match) {
    return (
      <GlassCard>
        <View style={styles.card}>
          <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
          <ClayButton label={t('common.retry')} tone="primary" onPress={() => void load()} style={styles.stretch} />
        </View>
      </GlassCard>
    );
  }
  if (!match) return <Loading style={styles.loading} />;

  const playerCount = match.scoreboard.length || (match.me ? 1 : 0);
  const seconds = Math.ceil(remaining / 1000);

  // ---- lobby -----------------------------------------------------------------
  if (match.status === 'lobby') {
    return (
      <>
        {/* The code to tell people, with Invite friends beside it: for whoever is in the lobby. */}
        {match.me != null ? (
          <LobbyShare
            game="rhyme-match"
            lobbyId={id}
            code={match.code}
            canInvite={isHost && playerCount < match.maxPlayers}
            mode={match.maxPlayers === 2 ? 'duo' : 'group'}
          />
        ) : null}
        <GlassCard>
          <View style={styles.card}>
            <Text style={[styles.blurb, { color: colors.textSecondary }]}>
              {t('games.lobbyWaiting', { count: playerCount })}
            </Text>
            {match.me != null ? (
              <LobbyPeople
                game="rhyme-match"
                lobbyId={id}
                players={match.players ?? []}
                isHost={isHost}
                onRemove={isHost ? (seat) => void act(() => removeFromMatch(client, id, seat)) : undefined}
              />
            ) : null}
            {notice ? <Text style={[styles.error, { color: colors.danger }]}>{notice}</Text> : null}
            {match.me == null ? (
              <ClayButton
                label={t('games.rhymeMatch.join')}
                accessibilityLabel={busy ? t('games.joining') : undefined}
                busy={busy}
                tone="primary"
                onPress={() => void act(() => joinMatch(client, id))}
                style={styles.stretch}
              />
            ) : isHost && playerCount >= 2 ? (
              <ClayButton
                label={t('games.rhymeMatch.start')}
                accessibilityLabel={busy ? t('games.starting') : undefined}
                busy={busy}
                tone="primary"
                onPress={() => {
                  haptic('tap');
                  void act(() => startMatch(client, id));
                }}
                style={styles.stretch}
              />
            ) : (
              <Text style={[styles.waiting, { color: colors.textSecondary }]}>
                {isHost ? t('games.waitingForPlayer') : t('games.waitingForHost')}
              </Text>
            )}
            {/* The lobby's own way out is the screen's back, which asks and then leaves (play/backOut). */}
            {match.me != null ? (
              <ClayButton
                label={isHost ? t('stories.lobby.cancelGame') : t('stories.lobby.leave')}
                tone="danger"
                variant="outline"
                onPress={onExit}
                style={styles.stretch}
              />
            ) : null}
          </View>
        </GlassCard>
      </>
    );
  }

  // ---- scoreboard ------------------------------------------------------------
  if (match.status === 'finished') {
    const mine = results?.ranking.find((r) => r.userId === user?.id);
    return (
      <GlassCard>
        <View style={styles.card}>
          <Verdict won={mine?.rank === 1}>{mine?.rank === 1 ? t('games.youWon') : t('games.rhymeMatch.over')}</Verdict>
          {/* What this game did to your rank, with its one plain reason — before the table. */}
          {results ? (
            <>
              <Text style={[styles.blurb, { color: colors.textSecondary }]}>
                {t('games.rhymeMatch.promptWas', { word: results.prompt })}
              </Text>
              <View style={styles.stretch}>
                {results.ranking.map((r) => (
                  <View key={r.userId} style={styles.scoreLine}>
                    <Text style={[styles.rank, { color: colors.textSecondary }]}>{r.rank}</Text>
                    <Text style={[styles.scoreName, { color: colors.textPrimary }]}>
                      {r.isMe ?? r.userId === user?.id ? t('games.you') : (r.name ?? t('games.opponent'))}
                    </Text>
                    <Text style={[styles.scoreValue, { color: colors.textSecondary }]}>
                      {t('games.rhymeMatch.playerScore', { score: r.score, count: r.accepted })}
                    </Text>
                    {r.xpAwarded ? <Text style={[styles.xp, { color: colors.goldText }]}>+{r.xpAwarded} XP</Text> : null}
                    {/* Anyone else in the game can be reported, by seat. */}
                    {r.userId !== user?.id && r.seat !== undefined ? (
                      <PlayerReportButton game="rhyme-match" gameId={results.id} seat={r.seat} name={r.name ?? null} />
                    ) : null}
                  </View>
                ))}
              </View>
              {/* What nobody at the table found, each with its meaning: the next match goes better for it. */}
              <MissedRhymes hints={results.missed} dialect={results.dialect} tone="card" />
            </>
          ) : resultsFailed ? (
            <ErrorRetry onRetry={() => setResultsAsk((n) => n + 1)} />
          ) : (
            <Loading />
          )}
          {/* Play again with the same people: a rematch for two, the host's next round for more. */}
          <View style={styles.stretch}>
            <RematchPanel
              game="rhyme-match"
              lobbyId={id}
              isHost={isHost}
              other={results?.ranking.find((r) => !(r.isMe ?? r.userId === user?.id))?.name ?? t('games.opponent')}
              onOpen={onOpen}
              onInviteOthers={() => setInviting(true)}
            />
          </View>
          <ClayButton label={t('games.rhymeMatch.new')} tone="neutral" onPress={onLeave} style={styles.stretch} />
          {inviting ? <InviteSheet target={{ kind: 'new', game: 'rhyme-match' }} onClose={() => setInviting(false)} /> : null}
        </View>
      </GlassCard>
    );
  }

  // ---- the timed round -------------------------------------------------------
  return (
    <>
      <View style={styles.stage}>
        <View>
          <Text style={[styles.label, { color: colors.textSecondary }]}>{t('games.rhyme.rhymeWith')}</Text>
          <Text style={[styles.prompt, wordDirection(match.dialect), { color: colors.textPrimary }]}>{match.prompt}</Text>
        </View>
        <Text
          accessibilityLabel={t('games.timeLeft')}
          style={[styles.timer, { color: seconds <= 5 && active ? colors.danger : colors.textPrimary }]}
        >
          {seconds}s
        </Text>
      </View>

      <View style={[styles.board, { backgroundColor: colors.controlTrack }]}>
        {match.scoreboard.map((s) => (
          <Text
            key={s.userId}
            style={[styles.boardEntry, { color: s.userId === user?.id ? colors.primary : colors.textSecondary }]}
          >
            {s.userId === user?.id ? t('games.you') : (s.name ?? t('games.opponent'))}: {s.score}
          </Text>
        ))}
      </View>

      {active ? (
        <View style={styles.compose}>
          <TextInput
            value={word}
            onChangeText={(v) => {
              setWord(v);
              setNotice(null);
            }}
            onSubmitEditing={() => void submit()}
            returnKeyType="send"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={64}
            editable={!busy}
            placeholder={t('games.rhyme.placeholder', { word: match.prompt ?? '' })}
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel={t('games.rhyme.yourRhyme')}
            style={[
              styles.input,
              styles.composeInput,
              { backgroundColor: colors.controlTrack, color: colors.textPrimary },
            ]}
          />
          <ClayButton label={t('games.submit')} tone="primary" onPress={() => void submit()} style={styles.send} />
        </View>
      ) : (
        <Text style={[styles.waiting, { color: colors.textSecondary }]}>{t('games.rhymeMatch.timeUpFinishing')}</Text>
      )}

      {notice ? <Text style={[styles.error, { color: colors.danger }]}>{notice}</Text> : null}

      {found.length > 0 ? (
        <View style={styles.found} accessibilityLabel={t('games.rhyme.foundList')}>
          {found.map((f, i) => (
            <View key={`${f.word}-${i}`} style={[styles.foundRow, { backgroundColor: colors.controlTrack }]}>
              <Text style={[styles.foundWord, wordDirection(match.dialect), { color: colors.textPrimary }]}>{f.word}</Text>
              <View style={styles.foundMeta}>
                <Text style={[styles.foundQuality, { color: f.quality === 'perfect' ? colors.success : colors.goldText }]}>
                  {t(f.quality === 'perfect' ? 'games.rhyme.quality.perfect' : 'games.rhyme.quality.near')}
                </Text>
                <Text style={[styles.foundPoints, { color: colors.textSecondary }]}>+{f.points}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  // Lay out a card's contents on an inner View: a GlassCard's own style only dresses its outside.
  card: { alignItems: 'center', gap: spacing.sm },
  stretch: { alignSelf: 'stretch', marginTop: spacing.sm },
  blurb: { fontSize: typography.sizes.md, textAlign: 'center', lineHeight: 20 },
  // A field's label sits at the start of the line above its control, not centred in the card.
  label: { alignSelf: 'stretch', fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, marginTop: spacing.sm },
  who: { gap: spacing.xs },
  input: {
    minHeight: MIN_TOUCH_TARGET,
    alignSelf: 'stretch',
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.sizes.md,
  },
  error: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, textAlign: 'center' },
  waiting: { fontSize: typography.sizes.md, textAlign: 'center', marginTop: spacing.sm },
  loading: { marginTop: spacing.xxl },
  scoreLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,

    paddingVertical: spacing.sm,
  },
  rank: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, width: 20 },
  scoreName: { flex: 1, fontSize: typography.sizes.md },
  scoreValue: { fontSize: typography.sizes.sm },
  xp: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  stage: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  prompt: { fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold },
  timer: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  board: { flexDirection: 'row', justifyContent: 'space-around', borderRadius: radii.md, padding: spacing.sm },
  boardEntry: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  compose: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  composeInput: { flex: 1, alignSelf: 'auto' },
  send: { marginTop: 0 },
  found: { gap: spacing.xs },
  foundRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  foundWord: { fontSize: typography.sizes.md },
  foundMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  foundQuality: { fontSize: typography.sizes.sm, fontStyle: 'italic' },
  foundPoints: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
});
