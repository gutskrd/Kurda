import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  BLUFF_FAKE_MAX,
  dialectDirection,
  type BluffBoard,
  type BluffOutcome,
  type BluffReveal,
  type GameDialect,
  type MultiMoveAnswer,
  type MultiView,
} from '@kurda/shared';
import type { ApiResult } from '../api/types';
import { describeError } from '../api/errors';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { multiSeatName } from '../play/GameRoom';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { radii, spacing, typography } from '../theme/tokens';
import { languageName } from '../games/partyChoices';

export type BluffView = MultiView<BluffBoard | null>;
type Move = (body: unknown) => Promise<ApiResult<MultiMoveAnswer<BluffBoard | null, BluffOutcome>>>;

/** The table and its paper: the same in either theme, as a real table is. */
const FELT = '#2f4a33';
const FELT_EDGE = '#253b28';
const PAPER = '#fbf6e9';
const PAPER_LINE = '#e5dcc6';
const INK = '#2a2a33';
const SOFT_INK = '#5b5b66';
const ON_FELT = '#f4f1e8';
const GOLD = '#e9c46a';
const REAL = '#3e7d4f';

/** A seat's own colour, for its tokens: the same on every screen. */
export function seatHue(seat: number): string {
  return `hsl(${(seat * 67 + 150) % 360}, 58%, 46%)`;
}

function initial(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '?';
}

/** How a Kurdish word is laid out: in its own direction. */
function script(dialect: GameDialect): { writingDirection: 'rtl' | 'ltr' } {
  return { writingDirection: dialectDirection(dialect).dir };
}

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

/**
 * Kurdish Bluff's own staging on the phone, inside the room
 * (play/GameRoom.tsx), as the website's (web/src/bluff/BluffTable.tsx): a felt
 * table with the word on its own card at the head. While everyone writes, each
 * fake goes down face down and yours stays face up; then every meaning is laid
 * out as a handwritten note, lettered, yours left out, and a tap drops your
 * token on the one you believe while the others' wait face down. At the reveal
 * each card turns over — the real one stamped, each fake signed, everyone's
 * tokens on the card they chose — and the word is taught with its example.
 * With Reduce Motion nothing turns or drops; the cards simply show their other
 * side.
 */
export function BluffTableView({ view, skew, move }: { view: BluffView; skew: number; move: Move }): React.JSX.Element | null {
  const { t } = useI18n();
  const board = view.board;
  const now = useServerNow(skew, view.status === 'active');
  const mySeat = view.me?.seat ?? null;
  const name = (seat: number): string => {
    const p = view.players.find((x) => x.seat === seat);
    return p ? multiSeatName(p, t) : t('stories.player', { seat });
  };
  const felt = useRef<number | null>(null);
  useEffect(() => {
    if (!board || board.phase !== 'reveal' || !board.reveal || felt.current === board.reveal.round) return;
    felt.current = board.reveal.round;
    const mine = board.reveal.points.find((p) => p.seat === mySeat);
    if (mine) haptic(mine.total > 0 ? 'correct' : 'wrong');
  }, [board, mySeat]);
  if (!board) return null;
  const present = board.scores.filter((s) => !s.left).length;
  const left = board.phaseEndsAt ? Math.max(0, Date.parse(board.phaseEndsAt) - now) : 0;
  const total = board.phaseEndsAt && board.phaseStartedAt ? Math.max(1, Date.parse(board.phaseEndsAt) - Date.parse(board.phaseStartedAt)) : 1;
  const phaseTitle = board.phase === 'write' ? t('games.bluff.phaseWrite') : board.phase === 'vote' ? t('games.bluff.phaseVote') : t('games.bluff.phaseReveal');

  return (
    <View style={styles.table}>
      <View style={styles.head}>
        <Text style={styles.headText}>{t('games.bluff.round', { n: board.round, total: board.rounds })}</Text>
        <Text style={styles.headText}>{languageName(board.language)}</Text>
      </View>
      {board.phase !== 'done' && board.phaseEndsAt ? (
        <View
          style={styles.time}
          accessibilityRole="timer"
          accessibilityLabel={t('games.bluff.timeLeft', { count: Math.ceil(left / 1000) })}
          accessible
        >
          <View style={[styles.timeFill, { width: `${Math.min(100, (left / total) * 100)}%`, backgroundColor: left <= 10_000 ? '#e76f51' : GOLD }]} />
        </View>
      ) : null}
      <View style={styles.wordCard}>
        <Text style={[styles.word, script(board.dialect)]}>
          {board.word}
        </Text>
        <Text style={styles.phase} accessibilityRole="header" accessibilityLiveRegion="polite">
          {phaseTitle}
        </Text>
      </View>
      {board.phase === 'write' ? <WritePhase board={board} present={present} move={move} /> : null}
      {board.phase === 'vote' ? <VotePhase board={board} mySeat={mySeat} move={move} /> : null}
      {board.phase === 'reveal' && board.reveal ? <RevealPhase reveal={board.reveal} mySeat={mySeat} name={name} dialect={board.dialect} /> : null}
      <Scores board={board} name={name} mySeat={mySeat} />
    </View>
  );
}

function WritePhase({ board, present, move }: { board: BluffBoard; present: number; move: Move }): React.JSX.Element {
  const { t } = useI18n();
  const mine = board.mine;
  const down = board.writtenBy.length;
  return (
    <View style={styles.section}>
      {mine?.canWrite ? (
        <FakeForm move={move} />
      ) : mine?.knewIt ? (
        <View style={styles.knew} accessibilityLiveRegion="polite">
          <Icon name="check" size={18} color={ON_FELT} />
          <Text style={styles.onFelt}>{t('games.bluff.knewIt')}</Text>
        </View>
      ) : mine?.wrote ? (
        <View style={[styles.note, styles.tiltLeft]}>
          <Text style={styles.noteLabel}>{t('games.bluff.yourFake')}</Text>
          <Text style={styles.noteText}>{mine.wrote}</Text>
        </View>
      ) : null}
      <View style={styles.pile} accessible accessibilityRole="image" accessibilityLabel={t('games.bluff.written', { count: down, total: present })}>
        {Array.from({ length: present }, (_, i) => (
          <View key={i} style={[styles.back, i < down ? styles.backDown : styles.backEmpty]} />
        ))}
      </View>
      <Text style={styles.muted}>{t('games.bluff.written', { count: down, total: present })}</Text>
    </View>
  );
}

function FakeForm({ move }: { move: Move }): React.JSX.Element {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const left = BLUFF_FAKE_MAX - Array.from(text).length;
  const send = async (): Promise<void> => {
    if (!text.trim() || busy || left < 0) return;
    setBusy(true);
    setError(null);
    const res = await move({ kind: 'write', text });
    setBusy(false);
    if (!res.ok) {
      haptic('error');
      setError(describeError(res.error, t));
    } else haptic('correct');
  };
  return (
    <View style={styles.note}>
      <Text style={styles.noteLabel} nativeID="bluff-fake-label">
        {t('games.bluff.yourFake')}
      </Text>
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        maxLength={BLUFF_FAKE_MAX}
        placeholder={t('games.bluff.placeholder')}
        placeholderTextColor={SOFT_INK}
        accessibilityLabel={t('games.bluff.yourFake')}
        aria-labelledby="bluff-fake-label"
        style={styles.input}
      />
      <Text style={styles.noteMuted}>{t('games.bluff.charsLeft', { count: Math.max(0, left) })}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <ClayButton label={busy ? '…' : t('games.bluff.send')} tone="primary" busy={busy} disabled={!text.trim()} onPress={() => void send()} />
    </View>
  );
}

function Token({ seat, name, mine = false, faceDown = false }: { seat: number; name?: string; mine?: boolean; faceDown?: boolean }): React.JSX.Element {
  return (
    <View
      style={[styles.token, { backgroundColor: faceDown ? '#c9a94d' : seatHue(seat) }, mine && styles.tokenMine]}
      accessible={!!name}
      accessibilityLabel={name}
    >
      {!faceDown && name ? <Text style={styles.tokenText}>{initial(name)}</Text> : null}
    </View>
  );
}

function VotePhase({ board, mySeat, move }: { board: BluffBoard; mySeat: number | null; move: Move }): React.JSX.Element {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = board.mine;
  const vote = async (option: string): Promise<void> => {
    if (!mine?.canVote || busy) return;
    haptic('select');
    setBusy(true);
    setError(null);
    const res = await move({ kind: 'vote', option });
    setBusy(false);
    if (!res.ok) setError(describeError(res.error, t));
  };
  return (
    <View style={styles.section}>
      <Text style={styles.muted}>{mine?.canVote ? t('games.bluff.voteHint') : mine?.vote ? '' : t('games.bluff.notVoting')}</Text>
      {(board.options ?? []).map((o, i) => {
        const chosen = mine?.vote === o.id;
        return (
          <Pressable
            key={o.id}
            onPress={() => void vote(o.id)}
            disabled={!mine?.canVote || busy}
            accessibilityRole="button"
            accessibilityState={{ selected: chosen, disabled: !mine?.canVote || busy }}
            accessibilityLabel={`${o.id}: ${o.text}`}
            style={({ pressed }) => [styles.note, styles.card, i % 2 ? styles.tiltRight : styles.tiltLeft, chosen && styles.chosen, pressed && styles.pressed]}
          >
            <View style={styles.letter}>
              <Text style={styles.letterText}>{o.id}</Text>
            </View>
            <Text style={[styles.noteText, styles.cardText]}>{o.text}</Text>
            {chosen && mySeat !== null ? (
              <View style={styles.pinned}>
                <Token seat={mySeat} name={t('games.bluff.yourVote')} mine />
              </View>
            ) : null}
          </Pressable>
        );
      })}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View
        style={styles.tray}
        accessible
        accessibilityRole="image"
        accessibilityLabel={t('games.bluff.voted', { count: board.votedBy.length, total: board.voters.length })}
      >
        {board.votedBy
          .filter((s) => s !== mySeat)
          .map((s) => (
            <Token key={s} seat={s} faceDown />
          ))}
        <Text style={styles.muted}>{t('games.bluff.voted', { count: board.votedBy.length, total: board.voters.length })}</Text>
      </View>
    </View>
  );
}

/** A card turning over: from edge-on to flat, one after another; still under Reduce Motion. */
function Turning({ index, children, style }: { index: number; children: React.ReactNode; style: StyleProp<ViewStyle> }): React.JSX.Element {
  const reduce = useReducedMotion();
  const turn = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) return;
    const anim = Animated.timing(turn, { toValue: 1, duration: 480, delay: index * 110, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [turn, index, reduce]);
  const rotateY = turn.interpolate({ inputRange: [0, 1], outputRange: ['90deg', '0deg'] });
  return <Animated.View style={[style, { opacity: turn.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }), transform: [{ perspective: 700 }, { rotateY }] }]}>{children}</Animated.View>;
}

export function RevealPhase({ reveal, mySeat, name, dialect }: { reveal: BluffReveal; mySeat: number | null; name: (seat: number) => string; dialect: GameDialect }): React.JSX.Element {
  const { t } = useI18n();
  const bluffed = reveal.options.some((o) => !o.real);
  return (
    <View style={styles.section}>
      {reveal.options.map((o, i) => (
        <Turning key={o.id} index={i} style={[styles.note, styles.card, o.real && styles.real]}>
          <View style={styles.letter}>
            <Text style={styles.letterText}>{o.id}</Text>
          </View>
          <Text style={[styles.noteText, styles.cardText]}>{o.text}</Text>
          {o.real ? (
            <Text style={styles.stamp}>{t('games.bluff.real')}</Text>
          ) : (
            <Text style={styles.by}>{t('games.bluff.by', { names: o.authors.map(name).join(', ') })}</Text>
          )}
          {o.voters.length > 0 ? (
            <View style={styles.tokens}>
              {o.voters.map((s) => (
                <Token key={s} seat={s} name={name(s)} mine={s === mySeat} />
              ))}
            </View>
          ) : null}
        </Turning>
      ))}
      {!bluffed ? <Text style={styles.muted}>{t('games.bluff.nobodyBluffed')}</Text> : null}
      <View style={styles.lesson}>
        <Text style={[styles.lessonWord, script(dialect)]}>
          {reveal.word}
        </Text>
        <Text style={styles.onFelt}>{reveal.real}</Text>
        {reveal.example ? (
          <>
            <Text style={styles.exampleLabel}>{t('games.bluff.example')}</Text>
            <Text style={[styles.onFelt, script(dialect)]}>
              {reveal.example.ku}
            </Text>
            {reveal.example.meaning ? <Text style={styles.muted}>{reveal.example.meaning}</Text> : null}
          </>
        ) : null}
      </View>
      {reveal.points
        .filter((p) => p.total > 0)
        .map((p) => (
          <View key={p.seat} style={styles.pointRow}>
            <Text style={[styles.onFelt, styles.bold]}>{name(p.seat)}</Text>
            {p.found + p.knewIt > 0 ? <Text style={styles.chip}>{t('games.bluff.found', { count: p.found + p.knewIt })}</Text> : null}
            {p.fooled > 0 ? <Text style={[styles.chip, styles.chipFooled]}>{t('games.bluff.fooled', { count: p.fooled })}</Text> : null}
          </View>
        ))}
    </View>
  );
}

function Scores({ board, name, mySeat }: { board: BluffBoard; name: (seat: number) => string; mySeat: number | null }): React.JSX.Element {
  const { t } = useI18n();
  const sorted = [...board.scores].sort((a, b) => b.score - a.score || a.seat - b.seat);
  return (
    <View style={styles.scores} accessibilityLabel={t('games.bluff.scores')}>
      {sorted.map((s) => (
        <View key={s.seat} style={[styles.score, s.seat === mySeat && styles.scoreMine, s.left && styles.gone]}>
          <Token seat={s.seat} name={name(s.seat)} />
          <Text style={[styles.onFelt, styles.bold]}>{name(s.seat)}</Text>
          <Text style={styles.onFelt}>{t('games.bluff.points', { count: s.score })}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  table: { gap: spacing.md, padding: spacing.md, borderRadius: radii.xl, backgroundColor: FELT, borderWidth: 5, borderColor: FELT_EDGE },
  head: { flexDirection: 'row', justifyContent: 'space-between' },
  headText: { color: ON_FELT, fontWeight: typography.weights.bold, fontSize: typography.sizes.sm },
  time: { height: 6, borderRadius: radii.pill, backgroundColor: FELT_EDGE, overflow: 'hidden' },
  timeFill: { height: '100%' },
  wordCard: { alignItems: 'center', gap: 4, padding: spacing.md, borderRadius: radii.lg, backgroundColor: PAPER },
  word: { fontSize: 34, fontWeight: typography.weights.bold, color: INK, textAlign: 'center' },
  phase: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: SOFT_INK, textAlign: 'center' },
  section: { gap: spacing.sm },
  onFelt: { color: ON_FELT, fontSize: typography.sizes.md },
  bold: { fontWeight: typography.weights.bold },
  muted: { color: '#d9e4d6', fontSize: typography.sizes.sm },
  knew: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  note: { gap: 6, padding: spacing.md, borderRadius: radii.sm, backgroundColor: PAPER, borderBottomWidth: 2, borderBottomColor: PAPER_LINE },
  noteLabel: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, color: SOFT_INK },
  noteText: { fontSize: 19, lineHeight: 27, color: INK, fontStyle: 'italic' },
  noteMuted: { fontSize: typography.sizes.xs, color: SOFT_INK },
  input: { minHeight: 84, textAlignVertical: 'top', padding: 0, fontSize: 19, lineHeight: 27, color: INK, fontStyle: 'italic' },
  error: { color: '#b3261e', fontSize: typography.sizes.sm },
  tiltLeft: { transform: [{ rotate: '-0.8deg' }] },
  tiltRight: { transform: [{ rotate: '0.7deg' }] },
  card: { minHeight: MIN_TOUCH_TARGET * 2, paddingLeft: 52 },
  cardText: { flexShrink: 1 },
  chosen: { borderWidth: 3, borderColor: GOLD },
  pressed: { opacity: 0.85 },
  real: { borderWidth: 4, borderColor: REAL },
  letter: { position: 'absolute', left: 12, top: 12, width: 28, height: 28, borderRadius: radii.pill, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
  letterText: { color: PAPER, fontWeight: typography.weights.bold, fontSize: 14 },
  pinned: { position: 'absolute', right: 10, bottom: 10 },
  token: { width: 30, height: 30, borderRadius: radii.pill, borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' },
  tokenMine: { borderColor: INK },
  tokenText: { color: '#fff', fontWeight: typography.weights.bold, fontSize: 13 },
  tokens: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tray: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  pile: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  back: { width: 34, height: 46, borderRadius: radii.xs },
  backDown: { backgroundColor: '#c9a94d', borderWidth: 2, borderColor: '#b8963d' },
  backEmpty: { borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.35)' },
  stamp: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 2, borderWidth: 2, borderColor: REAL, borderRadius: radii.xs, color: REAL, fontWeight: typography.weights.bold, transform: [{ rotate: '-4deg' }] },
  by: { color: SOFT_INK, fontWeight: typography.weights.semibold },
  lesson: { gap: 4, padding: spacing.md, borderRadius: radii.lg, backgroundColor: 'rgba(0,0,0,0.22)' },
  lessonWord: { color: ON_FELT, fontSize: 24, fontWeight: typography.weights.bold },
  exampleLabel: { color: '#d9e4d6', fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, marginTop: 6 },
  pointRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  chip: { overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 2, borderRadius: radii.pill, backgroundColor: GOLD, color: '#2a1d05', fontWeight: typography.weights.bold, fontSize: typography.sizes.xs },
  chipFooled: { backgroundColor: '#f4a3b8', color: '#2b0f1b' },
  scores: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  score: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: MIN_TOUCH_TARGET, paddingRight: spacing.md, paddingLeft: 6, borderRadius: radii.pill, backgroundColor: 'rgba(0,0,0,0.22)' },
  scoreMine: { borderWidth: 2, borderColor: GOLD },
  gone: { opacity: 0.55 },
});
