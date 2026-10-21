import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { parseInvite } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { leftResults, reportGameFinished } from '../feedback/gameFinished';
import { ClayButton, GlassCard, GradientBackground, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { LobbyPeople, seatNamer, useLobbyRefresh } from '../play/lobby';
import { LobbyRated, RatedChoice, RatedPill } from '../ranks/Rated';
import { useRatedChoice } from '../ranks/ratedPrefs';
import { RankResultPanel } from '../ranks/RankResultPanel';
import { useQuietInvites } from '../play/quietInvites';
import { InviteSheet } from '../play/InviteSheet';
import { RematchPanel } from '../play/RematchPanel';
import { PlayerReportButton } from '../reports/PlayerReportButton';
import {
  createMatch,
  getMatch,
  getMatchResults,
  inviteUrl,
  joinMatch,
  startMatch,
  submitRhyme,
  type Dialect,
  type MatchResults,
  type MatchState,
  type RhymeQuality,
  type RhymeReject,
} from './matchApi';

const DIALECTS: readonly Dialect[] = ['kurmanci', 'sorani'];

/**
 * A dialect is called by its own name in every language, the way a language is.
 * Not a catalogue entry: translating "Kurmancî" into Kurmancî nine times is how
 * you end up with nine spellings of one word.
 */
const DIALECT_NAME: Record<Dialect, string> = { kurmanci: 'Kurmancî', sorani: 'Soranî' };

const REJECT_KEY: Record<RhymeReject, TranslationKey> = {
  'not-a-word': 'games.rhyme.reject.notAWord',
  'is-prompt': 'games.rhyme.reject.isPromptShort',
  'already-used': 'games.rhyme.reject.alreadyUsed',
  'no-rhyme': 'games.rhyme.reject.noRhyme',
  profane: 'games.rhyme.reject.profane',
  'window-closed': 'games.rhymeMatch.timeUpMatch',
};


/** How often the local clock ticks between polls, so the timer does not jump. */
const TICK_MS = 200;

/**
 * Rhyme Match (KUR-299) on the phone: out-rhyme a friend against the clock.
 *
 * Built like Wordle Battle, for the reason the API gives — its REST endpoints
 * are poll-safe and the realtime scoreboard "layers onto these endpoints" — so
 * the socket can arrive later without this screen changing.
 *
 * `id` is optional: without one the screen creates or joins, with one it is
 * that room. That is what lets an invite link open straight into a match.
 */
export function RhymeMatchScreen({ id: initialId, onExit }: { id?: string; onExit: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const [id, setId] = useState<string | null>(initialId ?? null);
  /*
   * Another match opened while this screen is up — an invite's Join, a game
   * card, "Invite someone else" — arrives as new params on this same screen
   * (navigating to the screen you are on updates it rather than pushing a
   * second one), so the room follows them.
   */
  useEffect(() => {
    if (initialId) setId(initialId);
  }, [initialId]);
  // a game's results are left when another game opens here, or the screen closes:
  // a rating box that came with them goes too (feedback/gameFinished)
  useEffect(() => () => leftResults(), [id]);

  return (
    <Shell title={t('games.rhymeMatch.name')} onExit={onExit}>
      {id ? <MatchRoom key={id} id={id} onLeave={() => setId(null)} onOpen={setId} /> : <CreateMatch onEnter={setId} />}
    </Shell>
  );
}

/** Pick a dialect and open a room — or step into one somebody sent you. */
function CreateMatch({ onEnter }: { onEnter: (id: string) => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [dialect, setDialect] = useState<Dialect>('kurmanci');
  const [rated, setRated] = useRatedChoice('rhyme-match');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const res = await createMatch(client, dialect, rated);
    setBusy(false);
    if (res.ok) onEnter(res.data.id);
    else setError(res.error.code === 'EMPTY_LEXICON' ? t('games.emptyPool') : describeError(res.error, t));
  };

  /* A pasted invite link or the bare id inside it — people send both. */
  const enter = (): void => {
    const typed = link.trim();
    const parsed = parseInvite(typed);
    if (parsed) onEnter(parsed.id);
    else if (typed) onEnter(typed);
  };

  return (
    <>
      <GlassCard style={styles.card}>
        <Icon name="chat" size={44} tone="primary" />
        <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t('games.rhymeMatch.intro')}</Text>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{t('games.dialect')}</Text>
        <View style={styles.stretch}>
          <Segmented<Dialect>
            options={DIALECTS}
            value={dialect}
            onChange={setDialect}
            labelOf={(d) => DIALECT_NAME[d]}
          />
        </View>
        {/* Rated or Friendly, before the room exists: the host can still change it in the lobby */}
        <View style={styles.stretch}>
          <RatedChoice value={rated} onChange={setRated} />
        </View>
        <ClayButton
          label={busy ? t('games.creating') : t('games.rhymeMatch.create')}
          icon="play"
          tone="primary"
          onPress={() => void create()}
          style={styles.stretch}
        />
        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      </GlassCard>

      <GlassCard style={styles.card}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{t('games.inviteLink')}</Text>
        <TextInput
          value={link}
          onChangeText={setLink}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={t('games.inviteLink')}
          style={[
            styles.input,
            { backgroundColor: colors.controlTrack, color: colors.textPrimary },
          ]}
        />
        <ClayButton label={t('games.rhymeMatch.join')} tone="neutral" onPress={enter} style={styles.stretch} />
      </GlassCard>
    </>
  );
}

/** One room: lobby, the timed round, the scoreboard. Polls until it is over. */
function MatchRoom({ id, onLeave, onOpen }: { id: string; onLeave: () => void; onOpen: (id: string) => void }): React.JSX.Element {
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
  // results: "Invite someone else" opens the invite sheet for this game
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    const res = await getMatch(client, id);
    if (res.ok) {
      setMatch(res.data);
      setRemaining(res.data.remainingMs);
      loadedOnce.current = true;
    } else if (!loadedOnce.current) {
      // a later poll failing is a blip; the first one failing is the whole screen
      setError(res.error.code === 'GAME_STARTED' ? t('stories.join.started') : describeError(res.error, t));
    }
  }, [client, id, t]);

  /*
   * Every scored word, join and start is pushed as `play_changed`, and the
   * screen asks then — with a slow poll underneath in case one was missed. It
   * used to ask every 1.5 s from the moment the lobby opened.
   */
  useEffect(() => {
    void load();
  }, [load]);
  useLobbyRefresh('rhyme-match', id, () => void load(), match?.status !== 'finished');

  useEffect(() => {
    if (match?.status !== 'finished' || results) return;
    void getMatchResults(client, id).then((r) => {
      if (r.ok) setResults(r.data);
    });
  }, [match?.status, results, client, id]);

  // A match played here to its end is a finished game for the rating box; one
  // opened already finished, from an old link, is not.
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

  /*
   * The clock runs locally between polls and is resynced by every one of them.
   * A timer that only moved when the server answered would stutter in whole
   * seconds; a timer that only ran locally would drift away from the truth.
   */
  useEffect(() => {
    if (match?.status !== 'active' || remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((ms) => Math.max(0, ms - TICK_MS)), TICK_MS);
    return () => clearTimeout(timer);
  }, [remaining, match?.status]);

  const active = match?.status === 'active' && match.me != null && remaining > 0;
  // an invite waits while a match is on (the banner would sit over the clock)
  useQuietInvites(match?.status === 'active');

  const submit = useCallback(async () => {
    const typed = word.trim();
    if (!typed || !active || busy) return;
    setBusy(true);
    setNotice(null);
    const res = await submitRhyme(client, id, typed);
    setBusy(false);
    if (!res.ok) {
      // time running out is the game, not a failure; anything else kept the word from going
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

  const share = (): void => {
    const url = inviteUrl(id);
    // the sheet's own dismissal is not a failure, and has nothing to report
    void Share.share({ message: url, url }).catch(() => undefined);
  };

  if (error && !match) {
    return (
      <GlassCard style={styles.card}>
        <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
        <ClayButton label={t('common.retry')} tone="primary" onPress={() => void load()} style={styles.stretch} />
      </GlassCard>
    );
  }
  if (!match) return <ActivityIndicator color={colors.primary} style={styles.loading} />;

  const playerCount = match.scoreboard.length || (match.me ? 1 : 0);
  const isHost = match.isHost ?? match.createdBy === user?.id;
  const seconds = Math.ceil(remaining / 1000);

  // ---- lobby -----------------------------------------------------------------
  if (match.status === 'lobby') {
    return (
      <GlassCard style={styles.card}>
        <Text style={[styles.blurb, { color: colors.textSecondary }]}>
          {t('games.lobbyWaiting', { count: playerCount })}
        </Text>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{t('games.inviteLink')}</Text>
        <Text selectable style={[styles.link, { color: colors.textPrimary }]}>
          {inviteUrl(id)}
        </Text>
        <ClayButton label={t('share.title')} icon="chat" tone="neutral" onPress={share} style={styles.stretch} />
        {match.me != null ? (
          <LobbyPeople game="rhyme-match" lobbyId={id} players={match.players ?? []} isHost={isHost} maxPlayers={match.maxPlayers} />
        ) : null}
        {/* Rated or Friendly, said before anyone joins; the host may change it here and only here */}
        {match.me != null ? (
          <LobbyRated
            game="rhyme-match"
            lobbyId={id}
            rated={match.rated}
            isHost={isHost}
            players={playerCount}
            seatName={seatNamer(match.players ?? [], t)}
            onChanged={() => void load()}
          />
        ) : match.rated ? (
          <RatedPill rated={match.rated.rated} />
        ) : null}
        {notice ? <Text style={[styles.error, { color: colors.danger }]}>{notice}</Text> : null}
        {match.me == null ? (
          <ClayButton
            label={busy ? t('games.joining') : t('games.rhymeMatch.join')}
            tone="primary"
            onPress={() => void act(() => joinMatch(client, id))}
            style={styles.stretch}
          />
        ) : isHost && playerCount >= 2 ? (
          <ClayButton
            label={busy ? t('games.starting') : t('games.rhymeMatch.start')}
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
      </GlassCard>
    );
  }

  // ---- scoreboard ------------------------------------------------------------
  if (match.status === 'finished') {
    const mine = results?.ranking.find((r) => r.userId === user?.id);
    return (
      <GlassCard style={styles.card}>
        <Text style={[styles.verdict, { color: colors.primary }]}>
          {mine?.rank === 1 ? t('games.youWon') : t('games.rhymeMatch.over')}
        </Text>
        {/* what this game did to your rank, with its one plain reason — before the table */}
        {match.rated?.rated ? <RankResultPanel game="rhyme-match" gameRef={id} /> : null}
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
                  {r.xpAwarded ? <Text style={[styles.xp, { color: colors.gold }]}>+{r.xpAwarded} XP</Text> : null}
                  {/* anyone else in the game can be reported, by seat */}
                  {r.userId !== user?.id && r.seat !== undefined ? (
                    <PlayerReportButton game="rhyme-match" gameId={results.id} seat={r.seat} name={r.name ?? null} />
                  ) : null}
                </View>
              ))}
            </View>
          </>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
        {/* play again with the same people: a rematch for two, the host's next round for more */}
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
      </GlassCard>
    );
  }

  // ---- the timed round -------------------------------------------------------
  return (
    <>
      {/* the game's header says what it is playing for, decided at the start */}
      {match.rated ? <RatedPill rated={match.rated.counts ?? match.rated.rated} small /> : null}
      <View style={styles.stage}>
        <View>
          <Text style={[styles.label, { color: colors.textSecondary }]}>{t('games.rhyme.rhymeWith')}</Text>
          <Text style={[styles.prompt, { color: colors.textPrimary }]}>{match.prompt}</Text>
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
              <Text style={[styles.foundWord, { color: colors.textPrimary }]}>{f.word}</Text>
              <View style={styles.foundMeta}>
                <Text style={[styles.foundQuality, { color: f.quality === 'perfect' ? colors.success : colors.gold }]}>
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

/** The screen's frame: back, title, and a scroller that clears the notch. */
function Shell({
  title,
  onExit,
  children,
}: {
  title: string;
  onExit: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <GradientBackground>
      <ScreenHeader title={title} onBack={onExit} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  // flex + centre so a long translated name shares the row with the back
  // button instead of wrapping over it
  card: { alignItems: 'center', gap: spacing.sm },
  stretch: { alignSelf: 'stretch', marginTop: spacing.sm },
  blurb: { fontSize: typography.sizes.md, textAlign: 'center', lineHeight: 20 },
  label: { fontSize: typography.sizes.sm, marginTop: spacing.sm },
  link: { fontSize: typography.sizes.sm, textAlign: 'center' },
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
  verdict: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, textAlign: 'center' },
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
