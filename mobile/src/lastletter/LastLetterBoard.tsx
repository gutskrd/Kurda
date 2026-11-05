import { useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import {
  lastLetterSlip,
  letterDirection,
  type LastLetterBoard,
  type LastLetterOutcome,
  type LastLetterStrikeReason,
  type LetterDialect,
  type MultiMoveAnswer,
  type MultiView,
} from '@kurda/shared';
import type { ApiResult } from '../api/types';
import { describeError } from '../api/errors';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { multiSeatName } from '../play/GameRoom';
import { ClayButton } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';

export type LastLetterView = MultiView<LastLetterBoard | null>;

/** Why a word was struck, in the reader's words. */
export const REASON_KEY: Record<LastLetterStrikeReason, TranslationKey> = {
  'not-a-word': 'games.lastLetter.reason.notAWord',
  'wrong-letter': 'games.lastLetter.reason.wrongLetter',
  used: 'games.lastLetter.reason.used',
  'not-allowed': 'games.lastLetter.reason.notAllowed',
  'not-one-word': 'games.lastLetter.reason.notOneWord',
  time: 'games.lastLetter.reason.time',
  gone: 'games.lastLetter.reason.gone',
};

/** The server's time, ticking every half second while `on`. */
function useServerNow(skew: number, on: boolean): number {
  const [now, setNow] = useState(() => Date.now() + skew);
  useEffect(() => {
    setNow(Date.now() + skew);
    if (!on) return;
    const timer = setInterval(() => setNow(Date.now() + skew), 500);
    return () => clearInterval(timer);
  }, [skew, on]);
  return now;
}

/** How a Soranî word is laid out: right to left, aligned to its own start. */
function scriptStyle(dialect: LetterDialect): { writingDirection: 'rtl' | 'ltr'; textAlign: 'right' | 'left' } {
  return letterDirection(dialect) === 'rtl' ? { writingDirection: 'rtl', textAlign: 'right' } : { writingDirection: 'ltr', textAlign: 'left' };
}

/**
 * The Last Letter's own staging on the phone, inside the room (play/GameRoom):
 * the ring around the next letter emptying with the turn (the server's
 * clock), the chain of word cards with each link drawn between them and read
 * in the dialect's own direction, each player's three strike marks, and on
 * your turn the word box, which says a slip it can see before it costs a
 * strike. A strike shakes the seat that took it and buzzes the phone of the
 * one who did; with Reduce Motion nothing moves, the colour says it.
 */
export function LastLetterBoardView({
  view,
  skew,
  move,
}: {
  view: LastLetterView;
  skew: number;
  move: (body: unknown) => Promise<ApiResult<MultiMoveAnswer<LastLetterBoard | null, LastLetterOutcome>>>;
}): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const board = view.board;
  const now = useServerNow(skew, view.status === 'active');
  const shake = useRef(new Animated.Value(0)).current;
  const [struck, setStruck] = useState<number | null>(null);
  const chain = useRef<ScrollView>(null);
  const lastStrike = board?.strikes.at(-1) ?? null;
  const strikeKey = lastStrike ? `${lastStrike.seat}:${lastStrike.turn}:${lastStrike.reason}` : null;
  const seenStrike = useRef(strikeKey);
  const seenLength = useRef(board?.chain.length ?? 0);

  useEffect(() => {
    if (!strikeKey || strikeKey === seenStrike.current || !lastStrike) {
      seenStrike.current = strikeKey;
      return;
    }
    seenStrike.current = strikeKey;
    if (lastStrike.seat === view.me?.seat) haptic('wrong');
    setStruck(lastStrike.seat);
    if (!reduce) {
      shake.setValue(0);
      Animated.sequence(
        [6, -6, 4, -3, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 70, useNativeDriver: true })),
      ).start();
    }
    const timer = setTimeout(() => setStruck(null), 700);
    return () => clearTimeout(timer);
  }, [strikeKey, lastStrike, view.me?.seat, reduce, shake]);

  useEffect(() => {
    if (!board) return;
    if (board.chain.length > seenLength.current && board.chain.at(-1)?.seat === view.me?.seat) haptic('correct');
    seenLength.current = board.chain.length;
    chain.current?.scrollToEnd({ animated: !reduce });
  }, [board, view.me?.seat, reduce]);

  if (!board) return null;
  const name = (seat: number): string => {
    const p = view.players.find((x) => x.seat === seat);
    return p ? multiSeatName(p, t) : t('stories.player', { seat });
  };
  const turn = board.turn;
  const remaining = turn ? Math.max(0, Date.parse(turn.endsAt) - now) : 0;
  const total = turn ? Math.max(1, Date.parse(turn.endsAt) - Date.parse(turn.startedAt)) : 1;
  const seconds = Math.ceil(remaining / 1000);
  const low = seconds <= 5 && board.yourTurn;
  const rtl = letterDirection(board.dialect) === 'rtl';
  const words = rtl ? [...board.chain].reverse() : board.chain;

  return (
    <View style={styles.board}>
      <View style={styles.turn} accessibilityLiveRegion="polite">
        <TurnRing share={Math.min(1, remaining / total)} low={low} label={t('games.lastLetter.timeLeft', { count: seconds })}>
          <Text style={[styles.letter, { color: board.required ? colors.gold : colors.textSecondary }]}>{board.requiredSpellings[0] ?? board.required ?? '✱'}</Text>
        </TurnRing>
        <View style={styles.turnText}>
          <Text style={[styles.whose, { color: board.yourTurn ? colors.primary : colors.textPrimary }]}>
            {board.yourTurn ? t('games.lastLetter.yourTurn') : turn ? t('games.lastLetter.theirTurn', { name: name(turn.seat) }) : ''}
          </Text>
          <Text style={[styles.starts, { color: colors.textSecondary }]}>
            {board.required ? `${t('games.lastLetter.startsWith')} ${board.requiredSpellings.join(' · ')}` : t('games.lastLetter.firstWord')}
          </Text>
        </View>
      </View>

      {board.chain.length === 0 ? null : (
        <ScrollView
          ref={chain}
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityLabel={t('games.lastLetter.chain')}
          contentContainerStyle={styles.chain}
        >
          {words.map((w, i) => (
            <View key={w.n} style={styles.cardRow}>
              {i > 0 ? <View style={[styles.link, { backgroundColor: colors.gold }]} /> : null}
              <View
                accessible
                accessibilityLabel={[w.word, w.meaning, name(w.seat)].filter(Boolean).join(', ')}
                style={[styles.card, { borderColor: w.seat === view.me?.seat ? colors.primary : colors.clayBorder, backgroundColor: colors.glassFill }]}
              >
                <Text style={[styles.word, scriptStyle(board.dialect), { color: colors.textPrimary }]}>{w.word}</Text>
                {w.meaning ? <Text style={[styles.meaning, { color: colors.textSecondary }]}>{w.meaning}</Text> : null}
                <Text style={[styles.by, { color: colors.textSecondary }]} numberOfLines={1}>
                  {name(w.seat)}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.seats}>
        {board.seats.map((s) => {
          const p = view.players.find((x) => x.seat === s.seat);
          const moving = struck === s.seat && !reduce;
          return (
            <Animated.View
              key={s.seat}
              style={[
                styles.seat,
                {
                  borderColor: struck === s.seat ? colors.danger : turn?.seat === s.seat ? colors.primary : colors.clayBorder,
                  opacity: s.out ? 0.55 : 1,
                  transform: moving ? [{ translateX: shake }] : [],
                },
              ]}
            >
              <Text style={[styles.seatName, { color: colors.textPrimary }]}>{name(s.seat)}</Text>
              <View
                accessible
                accessibilityRole="image"
                accessibilityLabel={t('games.lastLetter.strikes', { count: s.strikes, max: board.maxStrikes })}
                style={styles.strikes}
              >
                {Array.from({ length: board.maxStrikes }, (_, i) => (
                  <View key={i} style={[styles.strike, { borderColor: colors.danger, backgroundColor: i < s.strikes ? colors.danger : 'transparent' }]} />
                ))}
              </View>
              {s.out ? (
                <Text style={[styles.tag, { color: colors.textSecondary }]}>{s.left ? t('games.lastLetter.reason.gone') : t('games.lastLetter.out')}</Text>
              ) : p?.away ? (
                <Text style={[styles.tag, { color: colors.textSecondary }]}>{t('play.room.away')}</Text>
              ) : null}
            </Animated.View>
          );
        })}
      </View>

      {lastStrike ? (
        <Text accessibilityLiveRegion="polite" style={[styles.announce, { color: colors.danger }]}>
          {t('games.lastLetter.strikeLine', { name: name(lastStrike.seat), reason: t(REASON_KEY[lastStrike.reason]) })}
        </Text>
      ) : null}

      {board.yourTurn ? <WordBox board={board} move={move} /> : null}
    </View>
  );
}

/** The ring around the next letter: full at the start of a turn, empty when its time is up. */
export function TurnRing({ share, low, label, children }: { share: number; low: boolean; label: string; children: React.ReactNode }): React.JSX.Element {
  const { colors } = useTheme();
  const r = 34;
  const length = 2 * Math.PI * r;
  return (
    <View accessible accessibilityRole="timer" accessibilityLabel={label} style={styles.ring}>
      <Svg width={80} height={80} viewBox="0 0 80 80">
        <Circle cx={40} cy={40} r={r} stroke={colors.controlTrack} strokeWidth={6} fill="none" />
        <Circle
          cx={40}
          cy={40}
          r={r}
          stroke={low ? colors.danger : colors.primary}
          strokeWidth={6}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${length}`}
          strokeDashoffset={length * (1 - share)}
          transform="rotate(-90 40 40)"
        />
      </Svg>
      <View style={styles.ringInner}>{children}</View>
    </View>
  );
}

/** The word box on your turn, which says a slip it can see before the word is sent. */
function WordBox({
  board,
  move,
}: {
  board: LastLetterBoard;
  move: (body: unknown) => Promise<ApiResult<MultiMoveAnswer<LastLetterBoard | null, LastLetterOutcome>>>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slip = lastLetterSlip(board, word);
  const hint = !slip
    ? null
    : slip.kind === 'script'
      ? t('games.lastLetter.hintScript')
      : slip.kind === 'letter'
        ? t('games.lastLetter.hintLetter', { letter: slip.letter })
        : t('games.lastLetter.hintUsed');

  const send = async (): Promise<void> => {
    if (!word.trim() || slip || busy) return;
    setBusy(true);
    setError(null);
    const res = await move({ word });
    setBusy(false);
    if (res.ok) setWord('');
    else setError(describeError(res.error, t));
  };

  return (
    <View style={styles.compose}>
      <TextInput
        value={word}
        onChangeText={setWord}
        onSubmitEditing={() => void send()}
        placeholder={
          !board.required
            ? t('games.lastLetter.placeholderAny')
            : letterDirection(board.dialect) === 'rtl'
              ? `${board.requiredSpellings[0] ?? board.required}…`
              : t('games.lastLetter.placeholder', { letter: board.requiredSpellings[0] ?? board.required })
        }
        placeholderTextColor={colors.textSecondary}
        accessibilityLabel={t('games.lastLetter.yourWord')}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        maxLength={40}
        returnKeyType="send"
        style={[styles.input, scriptStyle(board.dialect), { color: colors.textPrimary, borderColor: slip ? colors.danger : colors.clayBorder }]}
      />
      <ClayButton label={busy ? '…' : t('games.lastLetter.send')} tone="primary" busy={busy} disabled={!word.trim() || slip !== null} onPress={() => void send()} />
      {error ?? hint ? (
        <Text accessibilityLiveRegion="polite" style={[styles.hint, { color: colors.danger }]}>
          {error ?? hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { gap: spacing.md },
  turn: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  turnText: { flex: 1, gap: 2 },
  whose: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  starts: { fontSize: typography.sizes.sm },
  ring: { width: 80, height: 80 },
  ringInner: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  letter: { fontSize: 32, fontWeight: typography.weights.bold },
  chain: { alignItems: 'center', paddingVertical: spacing.xs },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  link: { width: 10, height: 3, borderRadius: radii.pill },
  card: { minWidth: 92, maxWidth: 170, paddingVertical: spacing.sm, paddingHorizontal: 12, borderWidth: 1, borderRadius: radii.md, gap: 2 },
  word: { fontSize: 20, fontWeight: typography.weights.bold },
  meaning: { fontSize: typography.sizes.xs },
  by: { fontSize: typography.sizes.xs },
  seats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  seat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: radii.pill,
  },
  seatName: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  strikes: { flexDirection: 'row', gap: 4 },
  strike: { width: 9, height: 9, borderRadius: radii.pill, borderWidth: 1.5 },
  tag: { fontSize: typography.sizes.xs },
  announce: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  compose: { gap: spacing.sm },
  input: { minHeight: 48, fontSize: 20, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: 12 },
  hint: { fontSize: typography.sizes.sm },
});
