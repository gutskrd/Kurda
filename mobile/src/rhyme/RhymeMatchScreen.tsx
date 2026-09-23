import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { parseInvite } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { ClayButton, GlassCard, GradientBackground, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { ScreenHeader } from '../navigation/ScreenHeader';
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

/** How often a room asks the server what changed — the browser's interval. */
const POLL_MS = 1_500;

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

  return (
    <Shell title={t('games.rhymeMatch.name')} onExit={onExit}>
      {id ? <MatchRoom key={id} id={id} onLeave={() => setId(null)} /> : <CreateMatch onEnter={setId} />}
    </Shell>
  );
}

/** Pick a dialect and open a room — or step into one somebody sent you. */
function CreateMatch({ onEnter }: { onEnter: (id: string) => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [dialect, setDialect] = useState<Dialect>('kurmanci');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const res = await createMatch(client, dialect);
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
function MatchRoom({ id, onLeave }: { id: string; onLeave: () => void }): React.JSX.Element {
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

  const load = useCallback(async () => {
    const res = await getMatch(client, id);
    if (res.ok) {
      setMatch(res.data);
      setRemaining(res.data.remainingMs);
      loadedOnce.current = true;
    } else if (!loadedOnce.current) {
      // a later poll failing is a blip; the first one failing is the whole screen
      setError(describeError(res.error, t));
    }
  }, [client, id, t]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (match?.status !== 'finished') void load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [load, match?.status]);

  useEffect(() => {
    if (match?.status !== 'finished' || results) return;
    void getMatchResults(client, id).then((r) => {
      if (r.ok) setResults(r.data);
    });
  }, [match?.status, results, client, id]);

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

  const submit = useCallback(async () => {
    const typed = word.trim();
    if (!typed || !active || busy) return;
    setBusy(true);
    setNotice(null);
    const res = await submitRhyme(client, id, typed);
    setBusy(false);
    if (!res.ok) {
      setNotice(res.error.code === 'NOT_ACTIVE' ? t('games.rhymeMatch.timeUpMatch') : describeError(res.error, t));
      return;
    }
    setMatch(res.data.match);
    setRemaining(res.data.match.remainingMs);
    setWord('');
    const { result } = res.data;
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
  const isHost = match.createdBy === user?.id;
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
            onPress={() => void act(() => startMatch(client, id))}
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
        {results ? (
          <>
            <Text style={[styles.blurb, { color: colors.textSecondary }]}>
              {t('games.rhymeMatch.promptWas', { word: results.prompt })}
            </Text>
            <View style={styles.stretch}>
              {results.ranking.map((r) => (
                <View key={r.userId} style={[styles.scoreLine, { borderTopColor: colors.separator }]}>
                  <Text style={[styles.rank, { color: colors.textSecondary }]}>{r.rank}</Text>
                  <Text style={[styles.scoreName, { color: colors.textPrimary }]}>
                    {r.userId === user?.id ? t('games.you') : t('games.opponent')}
                  </Text>
                  <Text style={[styles.scoreValue, { color: colors.textSecondary }]}>
                    {t('games.rhymeMatch.playerScore', { score: r.score, count: r.accepted })}
                  </Text>
                  {r.xpAwarded ? <Text style={[styles.xp, { color: colors.gold }]}>+{r.xpAwarded} XP</Text> : null}
                </View>
              ))}
            </View>
          </>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
        <ClayButton label={t('games.rhymeMatch.new')} tone="primary" onPress={onLeave} style={styles.stretch} />
      </GlassCard>
    );
  }

  // ---- the timed round -------------------------------------------------------
  return (
    <>
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
            {s.userId === user?.id ? t('games.you') : t('games.opponent')}: {s.score}
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
    borderTopWidth: StyleSheet.hairlineWidth,
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
