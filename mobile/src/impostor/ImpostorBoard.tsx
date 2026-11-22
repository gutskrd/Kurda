import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import {
  IMPOSTOR_CLUE_LIMITS,
  IMPOSTOR_UNSURE_VOTE,
  dialectDirection,
  impostorClueSlip,
  meaningIn,
  type ImpostorBoard,
  type ImpostorOutcome,
  type MultiMoveAnswer,
  type MultiView,
} from '@kurda/shared';
import type { ApiResult } from '../api/types';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useAuth } from '../auth/AuthContext';
import { useMotionAlive } from '../a11y/useMotionAlive';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { multiSeatName } from '../play/GameRoom';
import { PartyComposer, PartyTimer, waitLeft } from '../party/Composer';
import { SLIP_KEY, partyTextError } from '../party/text';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { PULSE_MS, pressedDim } from '../theme/motion';
import { timing, turnCard } from '../theme/animate';
import { EmblemArt } from './art';

export type ImpostorView = MultiView<ImpostorBoard | null>;
type Move = (body: unknown) => Promise<ApiResult<MultiMoveAnswer<ImpostorBoard | null, ImpostorOutcome>>>;

/** How each way the game can end reads, above the places. */
const IMPOSTOR_END_KEY: Record<NonNullable<ImpostorBoard['endedBy']>, TranslationKey> = {
  escaped: 'games.impostor.end.escaped',
  caught: 'games.impostor.end.caught',
  guessed: 'games.impostor.end.guessed',
  'impostor-left': 'games.impostor.end.left',
  'too-few': 'games.impostor.end.tooFew',
  abandoned: 'games.impostor.end.tooFew',
};

/** The server's time, ticking every half second while `on`. */
export function useServerNow(skew: number, on: boolean): number {
  const [now, setNow] = useState(() => Date.now() + skew);
  useEffect(() => {
    setNow(Date.now() + skew);
    if (!on) return;
    const timer = setInterval(() => setNow(Date.now() + skew), 500);
    return () => clearInterval(timer);
  }, [skew, on]);
  return now;
}

/** How a variety's Kurdish is laid out: Soranî right to left, aligned to its own start. */
export function kurdishStyle(dialect: ImpostorBoard['dialect']): { writingDirection: 'rtl' | 'ltr'; textAlign: 'right' | 'left' } {
  return dialectDirection(dialect).dir === 'rtl' ? { writingDirection: 'rtl', textAlign: 'right' } : { writingDirection: 'ltr', textAlign: 'left' };
}

/**
 * Impostor's staging inside the room (play/GameRoom.tsx), as the website stages it: the players along the table's two
 * sides with the one giving a clue lit (a soft pulse, still under Reduce Motion), your card with the category and, for
 * all but the impostor, the word, the clues by round, and the box for your part (a clue, a vote, or the caught
 * impostor's four words). The vote includes "not sure", which names nobody but still counts, so the table is not kept
 * waiting.
 */
export function ImpostorBoardView({ view, skew, move }: { view: ImpostorView; skew: number; move: Move }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const board = view.board;
  const now = useServerNow(skew, view.status === 'active');
  const glow = useRef(new Animated.Value(1)).current;
  const speaking = board?.phase === 'clues' ? (board.turn?.seat ?? null) : null;
  // The mark on whose turn it is breathes only while the table is the screen in front.
  const alive = useMotionAlive();
  useEffect(() => {
    if (!alive || speaking === null) {
      glow.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        timing(glow, 0.55, PULSE_MS.turn, { easing: Easing.inOut(Easing.sin) }),
        timing(glow, 1, PULSE_MS.turn, { easing: Easing.inOut(Easing.sin) }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [alive, speaking, glow]);

  if (!board) return null;
  const name = (seat: number): string => {
    const p = view.players.find((x) => x.seat === seat);
    return p ? multiSeatName(p, t) : t('stories.player', { seat });
  };
  const script = kurdishStyle(board.dialect);
  const wait = board.phase === 'clues' ? board.turn : board.phase === 'vote' ? board.vote : board.guess;
  const left = waitLeft(wait?.startedAt, wait?.endsAt, now);
  const mine = board.yourTurn || board.yourVote || board.yourGuess;
  const voted = new Set(board.vote?.voted ?? []);
  const half = Math.ceil(board.seats.length / 2);
  const status =
    board.phase === 'clues'
      ? board.yourTurn
        ? t('games.impostor.yourTurn')
        : t('games.impostor.theirTurn', { name: name(board.turn?.seat ?? 0) })
      : board.phase === 'vote'
        ? t('games.impostor.vote.title')
        : board.guess
          ? board.yourGuess
            ? t('games.impostor.guessPrompt')
            : t('games.impostor.guessWaiting', { name: name(board.guess.seat) })
          : '';

  const seatView = (s: ImpostorBoard['seats'][number]): React.JSX.Element => {
    const p = view.players.find((x) => x.seat === s.seat);
    const lit = speaking === s.seat;
    const tag = lit
      ? t('games.impostor.speaking')
      : voted.has(s.seat)
        ? t('games.impostor.voted')
        : s.left
          ? t('games.lastLetter.reason.gone')
          : p?.away
            ? t('play.room.away')
            : t('games.impostor.clueCount', { count: board.clues.filter((c) => c.seat === s.seat && c.text !== null).length });
    return (
      <View
        key={s.seat}
        accessible
        accessibilityLabel={`${name(s.seat)}, ${tag}`}
        accessibilityState={{ selected: lit }}
        style={[styles.seat, { opacity: s.left ? 0.5 : 1 }]}
      >
        {/* The speaker is lit in the violet that marks where you are; gold is kept for what is earned. */}
        {lit ? <Animated.View style={[styles.light, { backgroundColor: colors.primary, opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.22] }) }]} /> : null}
        <View style={[styles.disc, { borderColor: lit || p?.isMe ? colors.primary : colors.clayBorder, backgroundColor: lit ? colors.primary : colors.glassFill }]}>
          <Text style={[styles.discText, { color: lit ? colors.textOnPrimary : colors.textPrimary }]}>{name(s.seat).slice(0, 1).toUpperCase()}</Text>
        </View>
        <Text style={[styles.seatName, { color: colors.textPrimary }]} numberOfLines={1}>
          {name(s.seat)}
        </Text>
        <Text style={[styles.seatTag, { color: lit ? colors.primary : colors.textSecondary }]} numberOfLines={1}>
          {tag}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.board}>
      <View accessibilityLiveRegion="polite" style={styles.status}>
        <Text style={[styles.phase, { color: colors.textSecondary }]}>
          {board.phase === 'clues' && board.turn
            ? t('games.impostor.round', { round: board.turn.round, rounds: board.rounds })
            : board.phase === 'vote'
              ? t('games.impostor.vote.phase')
              : t('games.impostor.guessPhase')}
        </Text>
        <Text style={[styles.whose, { color: mine ? colors.primary : colors.textPrimary }]}>{status}</Text>
        {board.phase === 'guess' && board.accused ? (
          <Text style={[styles.caught, { color: colors.danger }]}>
            {board.accused.seat === view.me?.seat ? t('games.impostor.youCaught') : t('games.impostor.caught', { name: name(board.accused.seat) })}
          </Text>
        ) : null}
      </View>
      {wait ? <PartyTimer share={left.share} low={mine && left.seconds <= 5} label={t('games.party.timeLeft', { count: left.seconds })} /> : null}

      <View accessibilityLabel={t('games.impostor.table')} style={styles.table}>
        <View style={styles.seats}>{board.seats.slice(0, half).map(seatView)}</View>
        <View style={[styles.tabletop, { borderColor: colors.clayBorder, backgroundColor: colors.glassFill }]}>
          <View accessible accessibilityLabel={t('games.impostor.yourCard')} style={[styles.card, { borderColor: board.hand?.role === 'impostor' ? colors.danger : colors.clayBorder, backgroundColor: colors.background }]}>
            <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>{t('games.impostor.category')}</Text>
            <Text style={[styles.cardHint, { color: colors.textPrimary }]}>
              <Text style={kurdishStyle(board.dialect)}>{board.hint.ku}</Text> · {meaningIn(board.hint.meanings, locale)}
            </Text>
            {board.hand?.role === 'player' ? (
              <>
                <View style={styles.cardArt}>
                  <EmblemArt emblem="deer" size={76} />
                </View>
                <Text style={[styles.cardWord, { color: colors.textPrimary, writingDirection: script.writingDirection }]}>{board.hand.word}</Text>
                <Text style={[styles.cardMeaning, { color: colors.textSecondary }]}>{meaningIn(board.hand.meanings, locale)}</Text>
              </>
            ) : board.hand?.role === 'impostor' ? (
              <>
                <View style={styles.cardArt}>
                  <EmblemArt emblem="wolf" size={76} />
                </View>
                <Text style={[styles.impostorText, { color: colors.danger }]}>{t('games.impostor.youAreImpostor')}</Text>
                <Text style={[styles.cardMeaning, { color: colors.textSecondary }]}>{t('games.impostor.blendIn')}</Text>
              </>
            ) : null}
          </View>
        </View>
        <View style={styles.seats}>{board.seats.slice(half).map(seatView)}</View>
      </View>

      <View style={styles.section}>
        <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.textPrimary }]}>
          {t('games.impostor.clues')}
        </Text>
        {board.clues.length === 0 ? <Text style={[styles.muted, { color: colors.textSecondary }]}>{t('games.impostor.noCluesYet')}</Text> : null}
        {board.clues.map((c, i) => (
          <View key={`${c.seat}:${i}`} style={[styles.clue, { backgroundColor: c.seat === view.me?.seat ? colors.controlTrack : colors.glassFill }]}>
            <Text style={[styles.clueBy, { color: colors.textSecondary }]} numberOfLines={1}>
              {t('games.impostor.roundShort', { round: c.round })} · {name(c.seat)}
            </Text>
            {c.text === null ? (
              <Text style={[styles.noClue, { color: colors.textSecondary }]}>{t('games.impostor.noClue')}</Text>
            ) : (
              <Text style={[styles.clueText, script, { color: colors.textPrimary }]}>{c.text}</Text>
            )}
          </View>
        ))}
      </View>

      {board.yourTurn ? (
        <PartyComposer
          label={t('games.impostor.yourClue')}
          placeholder={dialectDirection(board.dialect).dir === 'rtl' ? '…' : t('games.impostor.cluePlaceholder')}
          sendLabel={t('games.impostor.send')}
          dialect={board.dialect}
          maxLength={IMPOSTOR_CLUE_LIMITS.maxChars}
          slip={(text) => {
            const why = impostorClueSlip(board, text);
            if (!why) return null;
            if (why === 'says-word') return t('games.impostor.slip.saysWord');
            const key = SLIP_KEY[why as keyof typeof SLIP_KEY];
            return key ? t(key) : null;
          }}
          onSend={async (clue) => {
            const res = await move({ clue });
            if (res.ok) haptic('correct');
            return res;
          }}
          errorOf={(e) => partyTextError(e, t, 'games.impostor.slip.saysWord', locale)}
        />
      ) : null}

      {board.phase === 'vote' && view.me ? <Vote view={view} board={board} name={name} move={move} /> : null}
      {board.phase === 'guess' && board.guess ? <Guess board={board} move={move} /> : null}
    </View>
  );
}

function Vote({ view, board, name, move }: { view: ImpostorView; board: ImpostorBoard; name: (seat: number) => string; move: Move }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const others = board.seats.filter((s) => !s.left && s.seat !== view.me?.seat);
  const mine = board.vote?.mine ?? null;
  // A seat, or IMPOSTOR_UNSURE_VOTE for "not sure".
  const vote = async (seat: number): Promise<void> => {
    haptic('select');
    setBusy(true);
    setError(null);
    const res = await move({ vote: seat });
    setBusy(false);
    if (!res.ok) setError(partyTextError(res.error, t, 'games.impostor.slip.saysWord', locale));
  };
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.textPrimary }]}>
        {t('games.impostor.vote.title')}
      </Text>
      {mine !== null ? (
        <Text accessibilityLiveRegion="polite" style={[styles.cast, { color: colors.textPrimary }]}>
          {mine === IMPOSTOR_UNSURE_VOTE ? t('games.impostor.vote.castUnsure') : t('games.impostor.vote.cast', { name: name(mine) })}
        </Text>
      ) : board.yourVote ? (
        <View style={styles.options}>
          {others.map((s) => (
            <Pressable
              key={s.seat}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t('games.impostor.vote.pick', { name: name(s.seat) })}
              onPress={() => void vote(s.seat)}
              style={({ pressed }) => [styles.option, { borderColor: colors.clayBorder, backgroundColor: colors.glassFill, opacity: pressed || busy ? 0.7 : 1 }]}
            >
              <Text style={[styles.optionText, { color: colors.textPrimary }]}>{t('games.impostor.vote.pick', { name: name(s.seat) })}</Text>
            </Pressable>
          ))}
          {/* The quieter choice, set apart by its dashed edge: it names nobody, and still counts as this player's
             vote. */}
          <Pressable
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t('games.impostor.vote.unsure')}
            onPress={() => void vote(IMPOSTOR_UNSURE_VOTE)}
            style={({ pressed }) => [styles.option, styles.unsure, { borderColor: colors.clayBorder, opacity: pressed || busy ? 0.7 : 1 }]}
          >
            <Text style={[styles.optionText, { color: colors.textSecondary }]}>{t('games.impostor.vote.unsure')}</Text>
          </Pressable>
        </View>
      ) : null}
      <Text style={[styles.muted, { color: colors.textSecondary }]}>
        {t('games.impostor.vote.waiting', { count: board.vote?.voted.length ?? 0, total: board.seats.filter((s) => !s.left).length })}
      </Text>
      {error ? <Text style={[styles.muted, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

function Guess({ board, move }: { board: ImpostorBoard; move: Move }): React.JSX.Element {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const script = kurdishStyle(board.dialect);
  return (
    <View style={styles.options}>
      {(board.guess?.options ?? []).map((o, i) => (
        <Pressable
          key={`${o}:${i}`}
          disabled={busy || !board.yourGuess}
          accessibilityRole="button"
          accessibilityLabel={o}
          accessibilityState={{ disabled: busy || !board.yourGuess }}
          onPress={async () => {
            setBusy(true);
            const res = await move({ guess: i });
            setBusy(false);
            if (res.ok) haptic(res.data.outcome.kind === 'guess' && res.data.outcome.right ? 'correct' : 'wrong');
          }}
          // Edged in the violet of what can be pressed, as on one phone; gold is kept for what is earned.
          style={({ pressed }) => [styles.option, { borderColor: colors.primary, backgroundColor: colors.glassFill, opacity: !board.yourGuess ? 0.6 : pressed ? pressedDim : 1 }]}
        >
          <Text style={[styles.guessText, script, { color: colors.textPrimary }]}>{o}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * The reveal: every seat's card turns over in turn (at once under Reduce Motion), then the word with its meaning, how
 * it ended and, when the impostor got away, why (a tied vote, or the table voting out someone else), every clue, and
 * who voted for whom.
 */
export function ImpostorReveal({ view }: { view: ImpostorView }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const reduce = useReducedMotion();
  const board = view.board;
  const turn = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) {
      turn.setValue(1);
      return;
    }
    turnCard(turn).start();
  }, [reduce, turn]);
  if (!board?.reveal) return null;
  const reveal = board.reveal;
  const name = (seat: number): string => {
    const p = view.players.find((x) => x.seat === seat);
    return p ? multiSeatName(p, t) : t('stories.player', { seat });
  };
  const script = kurdishStyle(board.dialect);
  // These lines read with names, the viewer's own included: "You" in its place reads wrongly in Kurdish, where the
  // voter takes another form (te, not tu), and in English after "wasn't".
  const mine = user ? user.displayName || user.username : null;
  const named = (seat: number): string => (view.players.find((p) => p.seat === seat)?.isMe && mine ? mine : name(seat));
  // An older server sends no reason, and the reveal simply says the impostor got away.
  const escape = reveal.escape ?? null;
  const why =
    escape === 'tie'
      ? t('games.impostor.end.tie')
      : escape === 'wrong-out' && board.accused
        ? t('games.impostor.end.wrongOut', { name: named(board.accused.seat) })
        : null;
  const scaleX = turn.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0, 1] });
  // The turn goes a touch past flat before it settles, so the face is already there by then.
  const face = turn.interpolate({ inputRange: [0, 0.5, 0.51, 1], outputRange: [0, 0, 1, 1], extrapolate: 'clamp' });
  return (
    <View style={styles.reveal}>
      <View accessibilityLabel={t('games.impostor.table')} style={styles.flips}>
        {board.seats.map((s) => {
          const isImpostor = s.seat === reveal.impostor;
          return (
            <View key={s.seat} style={styles.flipWrap}>
              <Animated.View
                accessible
                accessibilityLabel={`${name(s.seat)}: ${isImpostor ? t('games.impostor.impostorTag') : reveal.word}`}
                style={[styles.flip, { borderColor: isImpostor ? colors.danger : colors.clayBorder, backgroundColor: colors.glassFill, transform: [{ scaleX }] }]}
              >
                <Animated.View style={{ opacity: face, alignItems: 'center', gap: 2 }}>
                  <EmblemArt emblem={isImpostor ? 'wolf' : 'deer'} size={38} />
                  <Text style={[styles.flipText, { color: isImpostor ? colors.danger : colors.textPrimary }]} numberOfLines={2}>
                    {isImpostor ? t('games.impostor.impostorTag') : reveal.word}
                  </Text>
                </Animated.View>
              </Animated.View>
              <Text style={[styles.flipName, { color: colors.textSecondary }]} numberOfLines={1}>
                {name(s.seat)}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={[styles.revealWord, { backgroundColor: colors.glassFill }]}>
        <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>{t('games.impostor.reveal.title')}</Text>
        <Text style={[styles.cardWord, { color: colors.textPrimary, writingDirection: script.writingDirection }]}>{reveal.word}</Text>
        <Text style={[styles.cardMeaning, { color: colors.textSecondary }]}>{meaningIn(reveal.meanings, locale)}</Text>
      </View>
      <Text style={[styles.whoWas, { color: colors.textPrimary }]}>
        {reveal.impostor === view.me?.seat ? t('games.impostor.reveal.youWere') : t('games.impostor.reveal.impostor', { name: name(reveal.impostor) })}
      </Text>
      {why ? <Text style={[styles.muted, { color: colors.textSecondary }]}>{why}</Text> : null}
      {board.endedBy ? <Text style={[styles.muted, { color: colors.textSecondary }]}>{t(IMPOSTOR_END_KEY[board.endedBy])}</Text> : null}
      {reveal.guessed ? (
        <Text style={[styles.muted, { color: colors.textSecondary }]}>
          {t('games.impostor.guessedWith')} {reveal.guessed}
        </Text>
      ) : null}
      {reveal.votes.length > 0 ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            {t('games.impostor.votes')}
          </Text>
          {reveal.votes.map((v) => (
            <Text key={v.seat} style={[styles.muted, { color: colors.textPrimary }]}>
              {v.for === null
                ? t('games.impostor.noVote', { name: named(v.seat) })
                : v.for === IMPOSTOR_UNSURE_VOTE
                  ? t('games.impostor.votedUnsure', { name: named(v.seat) })
                  : t('games.impostor.votedFor', { name: named(v.seat), target: named(v.for) })}
            </Text>
          ))}
        </View>
      ) : null}
      <View style={styles.section}>
        <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.textPrimary }]}>
          {t('games.impostor.clues')}
        </Text>
        {board.clues.map((c, i) => (
          <View key={i} style={[styles.clue, { backgroundColor: colors.glassFill, borderColor: c.seat === reveal.impostor ? colors.danger : 'transparent', borderWidth: 1 }]}>
            <Text style={[styles.clueBy, { color: colors.textSecondary }]}>{name(c.seat)}</Text>
            {c.text === null ? (
              <Text style={[styles.noClue, { color: colors.textSecondary }]}>{t('games.impostor.noClue')}</Text>
            ) : (
              <Text style={[styles.clueText, script, { color: colors.textPrimary }]}>{c.text}</Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  board: { gap: spacing.md },
  status: { gap: 2 },
  phase: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, letterSpacing: 0.6, textTransform: 'uppercase' },
  whose: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  caught: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  table: { gap: spacing.sm },
  seats: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs },
  seat: { flex: 1, maxWidth: 96, alignItems: 'center', gap: 2, paddingVertical: spacing.xs, minHeight: MIN_TOUCH_TARGET },
  light: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radii.lg },
  disc: { width: 38, height: 38, borderRadius: radii.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  discText: { fontWeight: typography.weights.bold, fontSize: typography.sizes.text },
  seatName: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, maxWidth: '100%' },
  seatTag: { fontSize: typography.sizes.text },
  tabletop: { borderWidth: 1, borderRadius: radii.pill, padding: spacing.md, alignItems: 'center' },
  card: { alignSelf: 'center', width: '100%', maxWidth: 300, alignItems: 'center', gap: 2, padding: spacing.md, borderWidth: 1.5, borderRadius: radii.md },
  cardLabel: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, letterSpacing: 0.6, textTransform: 'uppercase' },
  cardHint: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, textAlign: 'center' },
  cardArt: { marginTop: spacing.sm },
  cardWord: { fontSize: typography.sizes.title, fontWeight: typography.weights.bold, marginTop: spacing.xs, textAlign: 'center' },
  cardMeaning: { fontSize: typography.sizes.text, textAlign: 'center' },
  impostorText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, marginTop: spacing.xs },
  section: { gap: spacing.xs },
  sectionTitle: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  muted: { fontSize: typography.sizes.text },
  clue: { borderRadius: radii.md, paddingVertical: spacing.sm, paddingHorizontal: 12, gap: 2 },
  clueBy: { fontSize: typography.sizes.text },
  clueText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  noClue: { fontSize: typography.sizes.text, fontStyle: 'italic' },
  options: { gap: spacing.sm },
  option: { minHeight: 48, borderWidth: 1.5, borderRadius: radii.md, paddingHorizontal: spacing.md, justifyContent: 'center' },
  optionText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, textAlign: 'center' },
  unsure: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  guessText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, textAlign: 'center' },
  cast: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  reveal: { alignSelf: 'stretch', gap: spacing.md },
  flips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  flipWrap: { width: 78, alignItems: 'center', gap: 4 },
  flip: { width: 72, height: 92, borderWidth: 1.5, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', padding: 4 },
  flipText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, textAlign: 'center' },
  flipName: { fontSize: typography.sizes.text },
  revealWord: { alignItems: 'center', gap: 2, padding: spacing.md, borderRadius: radii.lg },
  whoWas: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, textAlign: 'center' },
});
