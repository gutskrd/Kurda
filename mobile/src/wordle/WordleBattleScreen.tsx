import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { parseInvite } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { ClayButton, GlassCard, GradientBackground, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { backspace, buildBoard, DEL, ENTER, typeLetter } from './board';
import { WordleBoard, cellSizeFor } from './WordleBoard';
import { WordleKeyboard } from './WordleKeyboard';
import {
  createBattle,
  getBattle,
  getResults,
  guessInBattle,
  inviteUrl,
  joinBattle,
  startBattle,
  type BattleResults,
  type BattleState,
  type Difficulty,
} from './battleApi';

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

const DIFFICULTY_KEY: Record<Difficulty, TranslationKey> = {
  easy: 'games.difficulty.easy',
  medium: 'games.difficulty.medium',
  hard: 'games.difficulty.hard',
};

/**
 * How often a room asks the server what changed.
 *
 * The same 1.8s the browser uses, and for the same two reasons: in the lobby it
 * is how the host sees somebody join, and in play it is how you see the other
 * player closing in. A finished match is asked nothing further.
 */
const POLL_MS = 1_800;

/**
 * Wordle Battle on the phone (KUR-306): race a friend to the same word.
 *
 * Built on the REST endpoints, which the API documents as poll-safe — "the
 * realtime gateway pushing opponent progress is an additive transport on top of
 * these same endpoints" — so the socket can be laid over this later without the
 * screen changing.
 *
 * `id` is optional so the screen is both halves of the feature: without one it
 * creates or joins, with one it is that room. That is what lets an invite link
 * open straight into a match.
 */
export function WordleBattleScreen({ id: initialId, onExit }: { id?: string; onExit: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const [id, setId] = useState<string | null>(initialId ?? null);

  return (
    <Shell title={t('games.battle.name')} onExit={onExit}>
      {id ? <BattleRoom key={id} id={id} onLeave={() => setId(null)} /> : <CreateBattle onEnter={setId} />}
    </Shell>
  );
}

/** Pick a difficulty and open a room — or step into one somebody sent you. */
function CreateBattle({ onEnter }: { onEnter: (id: string) => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const res = await createBattle(client, difficulty);
    setBusy(false);
    if (res.ok) onEnter(res.data.id);
    else setError(res.error.code === 'EMPTY_POOL' ? t('games.emptyPool') : describeError(res.error, t));
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
        <Icon name="sparkle" size={44} tone="primary" />
        <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t('games.battle.intro')}</Text>
        <View style={styles.stretch}>
          <Segmented<Difficulty>
            options={DIFFICULTIES}
            value={difficulty}
            onChange={setDifficulty}
            labelOf={(d) => t(DIFFICULTY_KEY[d])}
          />
        </View>
        <ClayButton
          label={busy ? t('games.creating') : t('games.battle.create')}
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
            { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder, color: colors.textPrimary },
          ]}
        />
        <ClayButton label={t('games.battle.join')} tone="neutral" onPress={enter} style={styles.stretch} />
      </GlassCard>
    </>
  );
}

/** One room: lobby, play, scoreboard. Polls until the match is over. */
function BattleRoom({ id, onLeave }: { id: string; onLeave: () => void }): React.JSX.Element {
  const { client, user } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();

  const [battle, setBattle] = useState<BattleState | null>(null);
  const [results, setResults] = useState<BattleResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    const res = await getBattle(client, id);
    if (res.ok) {
      setBattle(res.data);
      loadedOnce.current = true;
    } else if (!loadedOnce.current) {
      // a later poll failing is a blip; the first one failing is the whole screen
      setError(describeError(res.error, t));
    }
  }, [client, id]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (battle?.status !== 'finished') void load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [load, battle?.status]);

  useEffect(() => {
    if (battle?.status !== 'finished' || results) return;
    void getResults(client, id).then((r) => {
      if (r.ok) setResults(r.data);
    });
  }, [battle?.status, results, client, id]);

  const me = battle?.me ?? null;
  const active = battle?.status === 'active' && me != null && me.status === 'playing' && !me.solved;

  const submit = useCallback(async () => {
    if (!battle || !me || !active || busy) return;
    if (draft.length !== battle.targetLength) {
      setNotice(t('games.wordle.enterLetters', { count: battle.targetLength }));
      return;
    }
    setBusy(true);
    setNotice(null);
    const res = await guessInBattle(client, id, draft.join(''));
    setBusy(false);
    if (res.ok) {
      setBattle(res.data);
      setDraft([]);
    } else {
      // a rejected guess costs no attempt — the draft stays put, with a reason
      setNotice(guessMessage(res.error, t));
    }
  }, [client, id, battle, me, active, busy, draft, t]);

  const press = useCallback(
    (key: string) => {
      if (!active || !battle) return;
      setNotice(null);
      if (key === ENTER) return void submit();
      if (key === DEL) return setDraft((d) => backspace(d));
      setDraft((d) => typeLetter(d, key, battle.targetLength));
    },
    [active, battle, submit],
  );

  const act = async (work: () => Promise<{ ok: true; data: BattleState } | { ok: false; error: ApiError }>) => {
    setBusy(true);
    setNotice(null);
    const res = await work();
    setBusy(false);
    if (res.ok) setBattle(res.data);
    else setNotice(describeError(res.error, t));
  };

  const share = (): void => {
    const url = inviteUrl(id);
    // the sheet's own dismissal is not a failure, and has nothing to report
    void Share.share({ message: url, url }).catch(() => undefined);
  };

  if (error && !battle) {
    return (
      <GlassCard style={styles.card}>
        <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
        <ClayButton label={t('common.retry')} tone="primary" onPress={() => void load()} style={styles.stretch} />
      </GlassCard>
    );
  }
  if (!battle) return <ActivityIndicator color={colors.primary} style={styles.loading} />;

  const playerCount = (battle.me ? 1 : 0) + battle.opponents.length;
  const isHost = battle.createdBy === user?.id;

  // ---- lobby -----------------------------------------------------------------
  if (battle.status === 'lobby') {
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
        {battle.me == null ? (
          <ClayButton
            label={busy ? t('games.joining') : t('games.battle.join')}
            tone="primary"
            onPress={() => void act(() => joinBattle(client, id))}
            style={styles.stretch}
          />
        ) : isHost && playerCount >= 2 ? (
          <ClayButton
            label={busy ? t('games.starting') : t('games.battle.start')}
            tone="primary"
            onPress={() => void act(() => startBattle(client, id))}
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
  if (battle.status === 'finished') {
    const mine = results?.ranking.find((r) => r.userId === user?.id);
    return (
      <GlassCard style={styles.card}>
        {/* no trophy icon here: the winning verdict already carries one */}
        <Text style={[styles.verdict, { color: colors.primary }]}>
          {mine?.rank === 1 ? t('games.youWon') : mine?.solved ? t('games.battle.solvedIt') : t('games.battle.over')}
        </Text>
        {results ? (
          <>
            <Text style={[styles.blurb, { color: colors.textSecondary }]}>
              {t('games.wordle.theWordWas')} {results.target.toUpperCase()}
            </Text>
            <View style={styles.stretch}>
              {results.ranking.map((r) => (
                <View key={r.userId} style={[styles.scoreLine, { borderColor: colors.glassBorder }]}>
                  <Text style={[styles.rank, { color: colors.textSecondary }]}>{r.rank}</Text>
                  <Text style={[styles.scoreName, { color: colors.textPrimary }]}>
                    {r.userId === user?.id ? t('games.you') : t('games.opponent')}
                  </Text>
                  <Text style={[styles.scoreValue, { color: colors.textSecondary }]}>
                    {r.solved
                      ? t('games.battle.solvedIn', { count: r.guessCount })
                      : t('games.battle.lettersProgress', { done: r.progress, total: results.target.length })}
                  </Text>
                  {r.xpAwarded ? <Text style={[styles.xp, { color: colors.gold }]}>+{r.xpAwarded} XP</Text> : null}
                </View>
              ))}
            </View>
          </>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
        <ClayButton label={t('games.battle.new')} tone="primary" onPress={onLeave} style={styles.stretch} />
      </GlassCard>
    );
  }

  // ---- play ------------------------------------------------------------------
  return (
    <>
      {battle.opponents.length > 0 ? (
        <View style={styles.opponents}>
          {battle.opponents.map((o, i) => (
            <View key={o.userId} style={styles.opponent}>
              <Text style={[styles.opponentName, { color: colors.textSecondary }]}>
                {battle.opponents.length > 1 ? t('games.battle.opponentNumbered', { n: i + 1 }) : t('games.opponent')}
              </Text>
              <View
                accessibilityLabel={t('games.battle.opponentProgress')}
                style={[styles.track, { backgroundColor: colors.controlTrack }]}
              >
                <View
                  style={[
                    styles.trackFill,
                    {
                      backgroundColor: o.solved ? colors.success : colors.primary,
                      width: `${Math.round((o.progress / battle.targetLength) * 100)}%`,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.opponentState, { color: o.solved ? colors.success : colors.textSecondary }]}>
                {o.solved
                  ? t('games.battle.opponentSolved')
                  : o.finished
                    ? t('games.battle.opponentDone')
                    : t('games.battle.opponentGuesses', { count: o.guessCount })}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {me ? (
        <>
          <WordleBoard
            board={buildBoard(me.guesses, battle.targetLength, draft, {
              finished: !active,
              maxAttempts: me.guesses.length + me.remainingAttempts,
            })}
            cellSize={cellSizeFor(battle.targetLength)}
          />
          {notice ? <Text style={[styles.error, { color: colors.danger }]}>{notice}</Text> : null}
          {!active ? (
            <Text style={[styles.waiting, { color: colors.textSecondary }]}>
              {me.solved ? t('games.battle.youSolvedWaiting') : t('games.battle.noTriesWaiting')}
            </Text>
          ) : null}
          <WordleKeyboard keyboard={me.keyboard} onKey={press} disabled={!active || busy} />
        </>
      ) : null}
    </>
  );
}

/**
 * Why a guess bounced.
 *
 * The two the server rejects on purpose get the catalogue's wording; anything
 * else is infrastructure and `describeError` already has the sentence for it.
 */
function guessMessage(error: ApiError, t: (key: TranslationKey) => string): string {
  if (error.code === 'WRONG_LENGTH') return t('games.wordle.wrongLength');
  if (error.code === 'NOT_A_WORD') return t('games.wordle.notAWord');
  return describeError(error, t);
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
  // button instead of wrapping over it: "Wordle" is one word, "Wordle ya
  // kurdî" is three
  card: { alignItems: 'center', gap: spacing.sm },
  stretch: { alignSelf: 'stretch', marginTop: spacing.sm },
  blurb: { fontSize: typography.sizes.md, textAlign: 'center', lineHeight: 20 },
  label: { fontSize: typography.sizes.sm, marginTop: spacing.sm },
  link: { fontSize: typography.sizes.sm, textAlign: 'center' },
  input: {
    alignSelf: 'stretch',
    borderWidth: StyleSheet.hairlineWidth,
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
  opponents: { gap: spacing.sm },
  opponent: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  opponentName: { fontSize: typography.sizes.sm, width: 84 },
  track: { flex: 1, height: 6, borderRadius: radii.pill, overflow: 'hidden' },
  trackFill: { height: 6, borderRadius: radii.pill },
  opponentState: { fontSize: typography.sizes.sm, minWidth: 72, textAlign: 'right' },
});
