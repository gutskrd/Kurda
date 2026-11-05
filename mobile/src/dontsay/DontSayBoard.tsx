import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  DONT_SAY_CLUE_LIMITS,
  DONT_SAY_GUESS_LIMITS,
  dialectDirection,
  dontSayClueSlip,
  dontSayGuessSlip,
  meaningIn,
  sameClue,
  type DontSayBoard,
  type DontSayOutcome,
  type DontSayResult,
  type MultiMoveAnswer,
  type MultiView,
} from '@kurda/shared';
import type { Translate } from '../api/errors';
import type { ApiResult } from '../api/types';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { kurdishStyle, useServerNow } from '../impostor/ImpostorBoard';
import { multiSeatName } from '../play/GameRoom';
import { teamName, useTeamTone } from '../play/TeamPicker';
import { PartyComposer, PartyTimer, waitLeft } from '../party/Composer';
import { SLIP_KEY, partyTextError } from '../party/text';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';

export type DontSayView = MultiView<DontSayBoard | null>;
type Move = (body: unknown) => Promise<ApiResult<MultiMoveAnswer<DontSayBoard | null, DontSayOutcome>>>;

export const RESULT_KEY: Record<DontSayResult, TranslationKey> = {
  guessed: 'games.dontSay.result.guessed',
  buzzed: 'games.dontSay.result.buzzed',
  skipped: 'games.dontSay.result.skipped',
  time: 'games.dontSay.result.time',
};

/** A team's name, or in a co-op game the one table everyone plays at. */
export function sideName(board: Pick<DontSayBoard, 'mode'>, team: number, t: Translate): string {
  return board.mode === 'coop' ? t('games.dontSay.together') : teamName(team, t);
}

/**
 * Don't Say the Word!'s own staging on the phone, inside the room
 * (play/GameRoom.tsx) — the website's staging in the phone's parts: the
 * teams' scores in their colours, a bar for the turn's minute (after a moment
 * to get ready), the stack of cards — the describer's on top, its forbidden
 * words struck through; everyone else sees its back — the buzzer that jumps
 * when a clue says a forbidden word (whose text nobody else sees), the clues
 * and guesses for the card in play, the box for the viewer's part, and the
 * cards played so far.
 */
export function DontSayBoardView({ view, skew, move }: { view: DontSayView; skew: number; move: Move }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const reduce = useReducedMotion();
  const toneOf = useTeamTone();
  const board = view.board;
  const now = useServerNow(skew, view.status === 'active');
  const press = useRef(new Animated.Value(0)).current;
  const [buzzing, setBuzzing] = useState(false);
  const buzzN = board?.buzz?.n ?? 0;
  const seenBuzz = useRef(buzzN);
  useEffect(() => {
    if (buzzN === seenBuzz.current) return;
    seenBuzz.current = buzzN;
    if (board?.buzz?.seat === view.me?.seat) haptic('wrong');
    setBuzzing(true);
    if (!reduce) {
      press.setValue(0);
      Animated.sequence([
        Animated.timing(press, { toValue: 1, duration: 90, useNativeDriver: true }),
        Animated.timing(press, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]).start();
    }
    const timer = setTimeout(() => setBuzzing(false), 1_000);
    return () => clearTimeout(timer);
  }, [buzzN, board?.buzz?.seat, view.me?.seat, reduce, press]);

  if (!board) return null;
  const name = (seat: number): string => {
    const p = view.players.find((x) => x.seat === seat);
    return p ? multiSeatName(p, t) : t('stories.player', { seat });
  };
  const script = kurdishStyle(board.dialect);
  const rtl = dialectDirection(board.dialect).dir === 'rtl';
  const turn = board.turn;
  const ready = turn ? now >= Date.parse(turn.readyAt) : false;
  const left = turn ? (ready ? waitLeft(turn.readyAt, turn.endsAt, now) : waitLeft(turn.startedAt, turn.readyAt, now)) : { share: 0, seconds: 0 };
  const tone = toneOf(turn?.team ?? 1);
  const lastDone = board.done.at(-1);
  const myGuesses = board.guesses.filter((g) => g.seat === view.me?.seat).map((g) => g.text);
  const roleLine =
    board.role === 'describer'
      ? t('games.dontSay.youDescribe')
      : board.role === 'guesser'
        ? t('games.dontSay.youGuess', { name: turn ? name(turn.seat) : '' })
        : turn
          ? t('games.dontSay.theyDescribe', { name: name(turn.seat), team: sideName(board, turn.team, t) })
          : '';

  return (
    <View style={styles.board}>
      <View accessibilityLabel={t('games.dontSay.scores')} style={styles.scores}>
        {board.teams.map((team) => {
          const tt = toneOf(team.team);
          const on = turn?.team === team.team;
          return (
            <View key={team.team} accessible accessibilityLabel={`${sideName(board, team.team, t)}: ${team.score}`} style={[styles.score, { borderColor: tt.fill, borderWidth: on ? 2 : 1 }]}>
              <View style={[styles.swatch, { backgroundColor: tt.fill }]} />
              <Text style={[styles.scoreName, { color: colors.textPrimary }]} numberOfLines={1}>
                {sideName(board, team.team, t)}
              </Text>
              <Text style={[styles.scoreN, { color: tt.text }]}>{team.score}</Text>
            </View>
          );
        })}
        {board.goal !== null ? <Text style={[styles.muted, { color: colors.textSecondary }]}>{t('games.dontSay.goal', { count: board.goal })}</Text> : null}
      </View>

      {turn ? (
        <View accessibilityLiveRegion="polite" style={styles.status}>
          <Text style={[styles.turn, { color: tone.text }]}>{t('games.dontSay.turn', { n: turn.n, of: turn.of })}</Text>
          <Text style={[styles.role, { color: colors.textPrimary }]}>{ready ? roleLine : t('games.dontSay.getReady')}</Text>
          <PartyTimer share={left.share} low={ready && board.role !== 'watcher' && left.seconds <= 5} label={t('games.party.timeLeft', { count: left.seconds })} color={tone.fill} />
        </View>
      ) : null}

      <View style={styles.table}>
        <View style={styles.stack}>
          <View style={[styles.under, styles.underTwo, { backgroundColor: tone.fill, opacity: 0.18 }]} />
          <View style={[styles.under, { backgroundColor: tone.fill, opacity: 0.3 }]} />
          {board.card ? (
            <View accessible accessibilityLabel={t('games.dontSay.card')} style={[styles.card, { borderColor: tone.fill, backgroundColor: colors.background }]}>
              <Text style={[styles.target, script, { color: tone.text, textAlign: 'center' }]}>{board.card.target}</Text>
              <Text style={[styles.muted, { color: colors.textSecondary, textAlign: 'center' }]}>{meaningIn(board.card.meanings, locale)}</Text>
              <Text style={[styles.forbiddenLabel, { color: colors.danger }]}>{t('games.dontSay.forbidden')}</Text>
              {board.card.forbidden.map((f) => (
                <Text key={f} style={[styles.forbidden, { color: colors.textPrimary, textDecorationColor: colors.danger, writingDirection: rtl ? 'rtl' : 'ltr' }]}>
                  {f}
                </Text>
              ))}
            </View>
          ) : (
            <View importantForAccessibility="no-hide-descendants" style={[styles.card, styles.back, { borderColor: tone.fill, backgroundColor: tone.fill }]}>
              <Text style={[styles.backMark, { color: tone.ink }]}>?</Text>
            </View>
          )}
        </View>
        <Animated.View
          importantForAccessibility="no-hide-descendants"
          style={[styles.buzzer, { transform: [{ scaleY: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] }) }] }]}
        >
          <View style={[styles.cap, { backgroundColor: buzzing ? colors.danger : colors.dangerFill, borderColor: colors.danger }]} />
          <View style={[styles.base, { backgroundColor: colors.clayBorder }]} />
        </Animated.View>
      </View>
      {buzzing && board.buzz ? (
        <Text accessibilityLiveRegion="assertive" style={[styles.buzzLine, { color: colors.danger }]}>
          {t('games.dontSay.buzz', { name: name(board.buzz.seat) })}
        </Text>
      ) : null}
      {lastDone && lastDone.result === 'guessed' && lastDone.by !== null ? (
        <Text accessibilityLiveRegion="polite" style={[styles.rightLine, { color: colors.success }]}>
          {t('games.dontSay.right', { name: name(lastDone.by) })} {lastDone.target}
        </Text>
      ) : null}

      <View style={styles.section}>
        <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.textPrimary }]}>
          {t('games.dontSay.clues')}
        </Text>
        {board.clues.length === 0 ? <Text style={[styles.muted, { color: colors.textSecondary }]}>{t('games.dontSay.noClues')}</Text> : null}
        {board.clues.map((c) => (
          <View key={c.n} style={[styles.line, { backgroundColor: colors.glassFill }]}>
            <Text style={[styles.lineText, script, { color: colors.textPrimary }]}>{c.text}</Text>
          </View>
        ))}
      </View>
      {board.guesses.length > 0 ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            {t('games.dontSay.guesses')}
          </Text>
          {board.guesses.map((g) => (
            <View key={g.n} style={[styles.line, { backgroundColor: colors.glassFill }]}>
              <Text style={[styles.lineBy, { color: colors.textSecondary }]}>{name(g.seat)}</Text>
              <Text style={[styles.lineText, script, { color: colors.textPrimary }]}>{g.text}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {board.role === 'describer' && ready ? (
        <>
          <PartyComposer
            label={t('games.dontSay.clue')}
            placeholder={rtl ? '…' : t('games.dontSay.cluePlaceholder')}
            sendLabel={t('games.dontSay.sendClue')}
            dialect={board.dialect}
            maxLength={DONT_SAY_CLUE_LIMITS.maxChars}
            slip={(text) => {
              const why = dontSayClueSlip(board, text);
              if (!why) return null;
              if (why === 'says-word') return t('games.dontSay.slip.saysWord');
              const key = SLIP_KEY[why];
              return key ? t(key) : null;
            }}
            onSend={(clue) => move({ clue })}
            errorOf={(e) => partyTextError(e, t, 'games.dontSay.slip.saysWord', locale)}
          />
          <Skip left={board.skipsLeft ?? 0} move={move} />
        </>
      ) : null}
      {board.role === 'guesser' && ready ? (
        <PartyComposer
          label={t('games.dontSay.guess')}
          placeholder={rtl ? '…' : t('games.dontSay.guessPlaceholder')}
          sendLabel={t('games.dontSay.sendGuess')}
          dialect={board.dialect}
          maxLength={DONT_SAY_GUESS_LIMITS.maxChars}
          slip={(text) => {
            // the same guess twice is no new guess, and the chat's spam check counts repeats
            if (myGuesses.some((g) => sameClue(g, text, board.dialect))) return t('games.dontSay.slip.repeat');
            const why = dontSayGuessSlip(board.dialect, text);
            const key = why ? SLIP_KEY[why] : null;
            return key ? t(key) : null;
          }}
          onSend={async (guess) => {
            const res = await move({ guess });
            if (res.ok && res.data.outcome.kind === 'guess') haptic(res.data.outcome.right ? 'correct' : 'tap');
            return res;
          }}
          errorOf={(e) => partyTextError(e, t, 'games.dontSay.slip.saysWord', locale)}
        />
      ) : null}
      {board.role === 'watcher' && turn ? <Text style={[styles.muted, { color: colors.textSecondary }]}>{t('games.dontSay.youWatch')}</Text> : null}

      {board.done.length > 0 ? <DoneCards board={board} name={name} /> : null}
    </View>
  );
}

function Skip({ left, move }: { left: number; move: Move }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  return (
    <Pressable
      disabled={busy || left <= 0}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy || left <= 0 }}
      onPress={async () => {
        haptic('select');
        setBusy(true);
        await move({ skip: true });
        setBusy(false);
      }}
      style={({ pressed }) => [styles.skip, { borderColor: colors.clayBorder, opacity: left <= 0 ? 0.5 : pressed ? 0.7 : 1 }]}
    >
      <Text style={[styles.skipText, { color: colors.textPrimary }]}>{t('games.dontSay.skip', { count: left })}</Text>
    </Pressable>
  );
}

/** The cards played so far, newest first: the word, its meaning and how it went; its forbidden words once the game is over. */
export function DoneCards({ board, name, title }: { board: DontSayBoard; name: (seat: number) => string; title?: string }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const toneOf = useTeamTone();
  const script = kurdishStyle(board.dialect);
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.textPrimary }]}>
        {title ?? t('games.dontSay.done')}
      </Text>
      {[...board.done].reverse().map((d, i) => (
        <View key={`${d.turn}:${i}`} style={[styles.done, { borderColor: colors.clayBorder, borderStartColor: toneOf(d.team).fill }]}>
          <Text style={[styles.doneTarget, script, { color: colors.textPrimary }]}>{d.target}</Text>
          <Text style={[styles.muted, { color: colors.textSecondary }]}>{meaningIn(d.meanings, locale)}</Text>
          {d.forbidden ? (
            <Text style={[styles.doneForbidden, script, { color: colors.textPrimary, textDecorationColor: colors.danger }]}>{d.forbidden.join(' · ')}</Text>
          ) : null}
          <Text style={[styles.muted, { color: d.result === 'guessed' ? colors.success : d.result === 'buzzed' ? colors.danger : colors.textSecondary }]}>
            {t(RESULT_KEY[d.result])}
            {d.result === 'guessed' && d.by !== null ? ` · ${name(d.by)}` : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** The end on the phone: the final scores and how it ended, then every card in full. */
export function DontSayEnding({ view }: { view: DontSayView }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  const toneOf = useTeamTone();
  const board = view.board;
  if (!board) return null;
  const name = (seat: number): string => {
    const p = view.players.find((x) => x.seat === seat);
    return p ? multiSeatName(p, t) : t('stories.player', { seat });
  };
  const [a, b] = board.teams;
  const line =
    board.mode === 'coop'
      ? (board.teams[0]?.score ?? 0) >= (board.goal ?? 0)
        ? t('games.dontSay.end.goalMet')
        : t('games.dontSay.end.goalMissed', { count: board.teams[0]?.score ?? 0, goal: board.goal ?? 0 })
      : a && b && a.score === b.score
        ? t('games.dontSay.end.draw')
        : t('games.dontSay.end.teamWon', { team: teamName((a && b && a.score > b.score ? a : b)?.team ?? 1, t) });
  const why = board.endedBy === 'deck-empty' ? 'games.dontSay.end.deckEmpty' : board.endedBy === 'too-few' || board.endedBy === 'abandoned' ? 'games.dontSay.end.tooFew' : null;
  return (
    <View style={styles.ending}>
      <View style={styles.scores}>
        {board.teams.map((team) => (
          <View key={team.team} style={[styles.score, { borderColor: toneOf(team.team).fill, borderWidth: 1 }]}>
            <View style={[styles.swatch, { backgroundColor: toneOf(team.team).fill }]} />
            <Text style={[styles.scoreName, { color: colors.textPrimary }]}>{sideName(board, team.team, t)}</Text>
            <Text style={[styles.scoreN, { color: toneOf(team.team).text }]}>{team.score}</Text>
          </View>
        ))}
      </View>
      <Text style={[styles.endLine, { color: colors.textPrimary }]}>{line}</Text>
      {why ? <Text style={[styles.muted, { color: colors.textSecondary }]}>{t(why)}</Text> : null}
      {board.done.length > 0 ? <DoneCards board={board} name={name} title={t('games.dontSay.recap')} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { gap: spacing.md },
  ending: { alignSelf: 'stretch', gap: spacing.md },
  scores: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  score: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET, paddingHorizontal: 14, borderRadius: radii.pill },
  swatch: { width: 12, height: 12, borderRadius: 6 },
  scoreName: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  scoreN: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  status: { gap: spacing.xs },
  turn: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 0.6, textTransform: 'uppercase' },
  role: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  table: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stack: { flex: 1, paddingEnd: 10, paddingBottom: 10 },
  under: { position: 'absolute', top: 10, start: 10, end: 0, bottom: 0, borderRadius: radii.lg },
  underTwo: { top: 5, start: 5, end: 5, bottom: 5 },
  card: { minHeight: 190, borderWidth: 2, borderRadius: radii.lg, padding: spacing.md, alignItems: 'center', justifyContent: 'center', gap: 2 },
  back: { opacity: 0.85 },
  backMark: { fontSize: 56, fontWeight: typography.weights.bold },
  target: { fontSize: 28, fontWeight: typography.weights.bold },
  forbiddenLabel: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: spacing.sm },
  forbidden: { fontSize: 18, fontWeight: typography.weights.semibold, textDecorationLine: 'line-through' },
  buzzer: { width: 72, alignItems: 'center' },
  cap: { width: 56, height: 28, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderBottomLeftRadius: 5, borderBottomRightRadius: 5, borderWidth: 1 },
  base: { width: 72, height: 12, borderRadius: radii.sm },
  buzzLine: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  rightLine: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  section: { gap: spacing.xs },
  sectionTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  muted: { fontSize: typography.sizes.sm },
  line: { borderRadius: radii.md, paddingVertical: spacing.sm, paddingHorizontal: 12, gap: 2 },
  lineBy: { fontSize: typography.sizes.xs },
  lineText: { fontSize: 17, fontWeight: typography.weights.semibold },
  skip: { minHeight: MIN_TOUCH_TARGET, borderWidth: 1, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  skipText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  done: { borderWidth: 1, borderStartWidth: 4, borderRadius: radii.md, padding: spacing.sm, gap: 2 },
  doneTarget: { fontSize: 18, fontWeight: typography.weights.bold },
  doneForbidden: { fontSize: typography.sizes.sm, textDecorationLine: 'line-through' },
  endLine: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, textAlign: 'center' },
});
