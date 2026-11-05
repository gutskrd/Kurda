import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  IMPOSTOR_CLUE_LIMITS,
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
import { useReducedMotion } from '../a11y/useReducedMotion';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { multiSeatName } from '../play/GameRoom';
import { PartyComposer, PartyTimer, waitLeft } from '../party/Composer';
import { SLIP_KEY, partyTextError } from '../party/text';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';

export type ImpostorView = MultiView<ImpostorBoard | null>;
type Move = (body: unknown) => Promise<ApiResult<MultiMoveAnswer<ImpostorBoard | null, ImpostorOutcome>>>;

/** How each way the game can end reads, above the places. */
export const IMPOSTOR_END_KEY: Record<NonNullable<ImpostorBoard['endedBy']>, TranslationKey> = {
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
 * Kurdish Impostor's own staging on the phone, inside the room
 * (play/GameRoom.tsx) — the website's staging in the phone's parts: the table
 * with the players along its two sides and the one giving a clue in a pool of
 * light (a soft pulse, still under Reduce Motion), your card on the tabletop
 * with the category everyone is shown and the word for all but the impostor,
 * the clues round by round, and the box for your part: a clue on your turn, a
 * vote, or the caught impostor's four words.
 */
export function ImpostorBoardView({ view, skew, move }: { view: ImpostorView; skew: number; move: Move }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const reduce = useReducedMotion();
  const board = view.board;
  const now = useServerNow(skew, view.status === 'active');
  const glow = useRef(new Animated.Value(1)).current;
  const speaking = board?.phase === 'clues' ? (board.turn?.seat ?? null) : null;
  useEffect(() => {
    if (reduce || speaking === null) {
      glow.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 0.55, duration: 900, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, speaking, glow]);

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
        {lit ? <Animated.View style={[styles.light, { backgroundColor: colors.gold, opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.22] }) }]} /> : null}
        <View style={[styles.disc, { borderColor: lit ? colors.gold : p?.isMe ? colors.primary : colors.clayBorder, backgroundColor: lit ? colors.gold : colors.glassFill }]}>
          <Text style={[styles.discText, { color: lit ? '#2a1d05' : colors.textPrimary }]}>{name(s.seat).slice(0, 1).toUpperCase()}</Text>
        </View>
        <Text style={[styles.seatName, { color: colors.textPrimary }]} numberOfLines={1}>
          {name(s.seat)}
        </Text>
        <Text style={[styles.seatTag, { color: lit ? colors.gold : voted.has(s.seat) ? colors.success : colors.textSecondary }]} numberOfLines={1}>
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
        <Text style={[styles.whose, { color: mine ? colors.gold : colors.textPrimary }]}>{status}</Text>
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
                <Text style={[styles.cardWord, { color: colors.textPrimary, writingDirection: script.writingDirection }]}>{board.hand.word}</Text>
                <Text style={[styles.cardMeaning, { color: colors.textSecondary }]}>{meaningIn(board.hand.meanings, locale)}</Text>
              </>
            ) : board.hand?.role === 'impostor' ? (
              <>
                <View style={styles.impostorLine}>
                  <Icon name="eye-off" size={20} color={colors.danger} />
                  <Text style={[styles.impostorText, { color: colors.danger }]}>{t('games.impostor.youAreImpostor')}</Text>
                </View>
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
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.textPrimary }]}>
        {t('games.impostor.vote.title')}
      </Text>
      {mine !== null ? (
        <Text accessibilityLiveRegion="polite" style={[styles.cast, { color: colors.textPrimary }]}>
          {t('games.impostor.vote.cast', { name: name(mine) })}
        </Text>
      ) : board.yourVote ? (
        <View style={styles.options}>
          {others.map((s) => (
            <Pressable
              key={s.seat}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t('games.impostor.vote.pick', { name: name(s.seat) })}
              onPress={async () => {
                haptic('select');
                setBusy(true);
                setError(null);
                const res = await move({ vote: s.seat });
                setBusy(false);
                if (!res.ok) setError(partyTextError(res.error, t, 'games.impostor.slip.saysWord', locale));
              }}
              style={({ pressed }) => [styles.option, { borderColor: colors.clayBorder, backgroundColor: colors.glassFill, opacity: pressed || busy ? 0.7 : 1 }]}
            >
              <Text style={[styles.optionText, { color: colors.textPrimary }]}>{t('games.impostor.vote.pick', { name: name(s.seat) })}</Text>
            </Pressable>
          ))}
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
          style={({ pressed }) => [styles.option, { borderColor: colors.gold, backgroundColor: colors.glassFill, opacity: !board.yourGuess ? 0.6 : pressed ? 0.7 : 1 }]}
        >
          <Text style={[styles.guessText, script, { color: colors.textPrimary }]}>{o}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * The reveal on the phone: every seat's card turns over in turn — the
 * impostor's shows who they were, the rest the word (at once under Reduce
 * Motion) — then the word with its meaning, how it ended, every clue and who
 * voted for whom.
 */
export function ImpostorReveal({ view }: { view: ImpostorView }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const reduce = useReducedMotion();
  const board = view.board;
  const turn = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) {
      turn.setValue(1);
      return;
    }
    Animated.timing(turn, { toValue: 1, duration: 520, useNativeDriver: true }).start();
  }, [reduce, turn]);
  if (!board?.reveal) return null;
  const reveal = board.reveal;
  const name = (seat: number): string => {
    const p = view.players.find((x) => x.seat === seat);
    return p ? multiSeatName(p, t) : t('stories.player', { seat });
  };
  const script = kurdishStyle(board.dialect);
  const scaleX = turn.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0, 1] });
  const face = turn.interpolate({ inputRange: [0, 0.5, 0.51, 1], outputRange: [0, 0, 1, 1] });
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
                <Animated.View style={{ opacity: face, alignItems: 'center' }}>
                  {isImpostor ? <Icon name="eye-off" size={18} color={colors.danger} /> : null}
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
              {v.for === null ? t('games.impostor.noVote', { name: name(v.seat) }) : t('games.impostor.votedFor', { name: name(v.seat), target: name(v.for) })}
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
  phase: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 0.6, textTransform: 'uppercase' },
  whose: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  caught: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  table: { gap: spacing.sm },
  seats: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs },
  seat: { flex: 1, maxWidth: 96, alignItems: 'center', gap: 2, paddingVertical: spacing.xs, minHeight: MIN_TOUCH_TARGET },
  light: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radii.lg },
  disc: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  discText: { fontWeight: typography.weights.bold, fontSize: typography.sizes.md },
  seatName: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, maxWidth: '100%' },
  seatTag: { fontSize: typography.sizes.xs },
  tabletop: { borderWidth: 1, borderRadius: 120, padding: spacing.md, alignItems: 'center' },
  card: { alignSelf: 'center', width: '100%', maxWidth: 300, alignItems: 'center', gap: 2, padding: spacing.md, borderWidth: 1.5, borderRadius: radii.md },
  cardLabel: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 0.6, textTransform: 'uppercase' },
  cardHint: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, textAlign: 'center' },
  cardWord: { fontSize: 28, fontWeight: typography.weights.bold, marginTop: spacing.xs, textAlign: 'center' },
  cardMeaning: { fontSize: typography.sizes.sm, textAlign: 'center' },
  impostorLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  impostorText: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  section: { gap: spacing.xs },
  sectionTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  muted: { fontSize: typography.sizes.sm },
  clue: { borderRadius: radii.md, paddingVertical: spacing.sm, paddingHorizontal: 12, gap: 2 },
  clueBy: { fontSize: typography.sizes.xs },
  clueText: { fontSize: 18, fontWeight: typography.weights.semibold },
  noClue: { fontSize: typography.sizes.sm, fontStyle: 'italic' },
  options: { gap: spacing.sm },
  option: { minHeight: 48, borderWidth: 1.5, borderRadius: radii.md, paddingHorizontal: spacing.md, justifyContent: 'center' },
  optionText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, textAlign: 'center' },
  guessText: { fontSize: 20, fontWeight: typography.weights.bold, textAlign: 'center' },
  cast: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  reveal: { alignSelf: 'stretch', gap: spacing.md },
  flips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  flipWrap: { width: 78, alignItems: 'center', gap: 4 },
  flip: { width: 72, height: 92, borderWidth: 1.5, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', padding: 4 },
  flipText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, textAlign: 'center' },
  flipName: { fontSize: typography.sizes.xs },
  revealWord: { alignItems: 'center', gap: 2, padding: spacing.md, borderRadius: radii.lg },
  whoWas: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, textAlign: 'center' },
});
