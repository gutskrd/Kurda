import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  WHO_AM_I_ANSWER_SECONDS,
  WHO_AM_I_ASK_SECONDS,
  WHO_AM_I_COUCH_MAX_PLAYERS,
  WHO_AM_I_COUCH_MIN_PLAYERS,
  WHO_AM_I_DECIDE_SECONDS,
  WHO_AM_I_TABLE_MAX_PLAYERS,
  WHO_AM_I_TABLE_MIN_PLAYERS,
  meaningIn,
  whoAmIPoints,
  type GameDifficulty,
  type MultiMoveAnswer,
  type MultiView,
  type WhoAmICouchOffer,
  type WhoAmITableBoard,
  type WhoAmITableMove,
  type WhoAmITableOutcome,
} from '@kurda/shared';
import type { ApiError, ApiResult } from '../api/types';
import { describeError } from '../api/errors';
import { GuestWall, useAccountGate } from '../auth/AccountGate';
import { haptic } from '../feedback/haptics';
import { leftResults } from '../feedback/gameFinished';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useCourseDialect } from '../learn/courseDialect';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { PartyTimer } from '../party/Composer';
import { GameRoom, multiSeatName } from '../play/GameRoom';
import { InviteSheet } from '../play/InviteSheet';
import { useGameView } from '../play/useGameView';
import { useDirection } from '../reports/direction';
import { ClayButton, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { Loading } from '../theme/Loading';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { groupDialects, useMpAvailability } from '../games/mpAvailability';
import { DIFFICULTY_KEY } from '../games/partyChoices';
import { useServerNow } from '../impostor/ImpostorBoard';
import { Card, Cloth, GoldButton, listed } from '../impostor/parts';
import { TABLE } from '../impostor/table';
import { WhoAmICouch, useCouchOffer } from './WhoAmICouch';
import {
  AnswerButtons,
  ForeheadCard,
  Foreheads,
  GuessTiles,
  QuestionCard,
  QuestionDeck,
  ScoringNote,
  VerdictCard,
  answerWord,
  kindOf,
  type TableSeat,
} from './WhoAmIStage';
import { dialectNameKey } from '../i18n/dialectName';

type TableView = MultiView<WhoAmITableBoard | null>;
type Move = (body: unknown) => Promise<ApiResult<MultiMoveAnswer<WhoAmITableBoard | null, WhoAmITableOutcome>>>;

/** How long each of a turn's three waits runs, for the share of it that is left. */
const WAIT_SECONDS: Record<WhoAmITableBoard['phase'], number> = { ask: WHO_AM_I_ASK_SECONDS, answer: WHO_AM_I_ANSWER_SECONDS, decide: WHO_AM_I_DECIDE_SECONDS };

/**
 * How each way the game can end reads, under who everyone was. A game called off with everyone gone reads as too few
 * left.
 */
const END_KEY: Record<NonNullable<WhoAmITableBoard['endedBy']>, TranslationKey> = {
  'all-done': 'games.whoAmI.end.allDone',
  time: 'games.whoAmI.end.time',
  'too-few': 'games.whoAmI.end.tooFew',
  abandoned: 'games.whoAmI.end.tooFew',
};

/**
 * Who Am I? on the phone: everyone wears a Kurdish word on their forehead that only the others can read, and finds out
 * who they are by asking yes/no questions. The friends answer yes, could be, no or not sure, judged by the card's own
 * answer. Never played alone.
 *
 * Without an id, the start: the night stage and the game's two ways, each offered only where approved content allows.
 * On this phone (WhoAmICouch.tsx) comes first with the gold button; with friends online, through the invite sheet, is
 * the quieter card under it. With an id, the room (play/GameRoom.tsx), for an account only. `way` is the way a Games
 * card asked for. The website's whoami/WhoAmI.tsx plays the same game.
 */
export function WhoAmIScreen({ id: initialId, way, onExit }: { id?: string; way?: 'phone' | 'friends'; onExit: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const dialect = useCourseDialect();
  const [id, setId] = useState<string | null>(initialId ?? null);
  const [onPhone, setOnPhone] = useState(way === 'phone' && !initialId);
  // Kept above the start, so the sheet a card asked for opens once, not each time the start comes back.
  const [inviting, setInviting] = useState(way === 'friends' && !initialId);
  useEffect(() => {
    if (!initialId) return;
    setId(initialId);
    setInviting(false);
  }, [initialId]);
  useEffect(() => () => leftResults(), [id]);
  // Where the game can be played on one phone in the learner's Kurdish; a room has no use for the answer.
  const offer = useCouchOffer(dialect, !id);

  if (id) {
    return (
      <GuestWall reason="play" onBack={() => setId(null)}>
        <GradientBackground>
          <ScreenHeader title={t('games.whoAmI.name')} onBack={onExit} />
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <TableRoom key={id} id={id} onNew={() => setId(null)} onOpen={setId} />
          </ScrollView>
        </GradientBackground>
      </GuestWall>
    );
  }
  if (onPhone && offer && offer.difficulties.length > 0) {
    return (
      <GradientBackground>
        {/* The game on one phone keeps its own header, whose way back asks before a game is lost. */}
        <WhoAmICouch offer={offer} onLeave={() => setOnPhone(false)} />
      </GradientBackground>
    );
  }
  return (
    <GradientBackground>
      <ScreenHeader title={t('games.whoAmI.name')} onBack={onExit} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Start offer={offer} inviting={inviting} onInviting={setInviting} onPhone={() => setOnPhone(true)} />
      </ScrollView>
    </GradientBackground>
  );
}

// The start.

function Start({
  offer,
  inviting,
  onInviting,
  onPhone,
}: {
  offer: WhoAmICouchOffer | null | undefined;
  /** The invite sheet is open, or was asked for on the way in. */
  inviting: boolean;
  onInviting: (open: boolean) => void;
  onPhone: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const gate = useAccountGate();
  const dialect = useCourseDialect();
  // A guest is not told where the game is played online, and is offered an account at its door instead.
  const online = useMpAvailability('who-am-i', !gate.isGuest);
  if (offer === undefined || (!gate.isGuest && online === null)) return <Loading size="large" style={styles.loading} />;
  const phone = (offer?.difficulties.length ?? 0) > 0;
  // The same approved identities fill both ways, so what one phone is offered a guest's account would be too.
  const together = gate.isGuest ? phone : groupDialects(online).length > 0;
  if (!phone && !together) {
    return (
      <Card style={styles.way}>
        <Icon name="question" size={40} tone="primary" />
        <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t('games.whoAmI.notOffered')}</Text>
      </Card>
    );
  }
  const askFriends = (): void => {
    if (gate.require('play')) onInviting(true);
  };
  return (
    <>
      {/* The night every game opens on: the one who wears the card, and what the game is. */}
      <Cloth style={styles.stage}>
        <ForeheadCard dialect={dialect} category={null} identity={null} size={180} night />
        <Text style={styles.stageLine}>{t('games.whoAmI.intro')}</Text>
      </Cloth>
      {phone ? (
        <Card style={styles.way}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>
            {t('games.whoAmI.onePhone')}
          </Text>
          <Text style={[styles.blurb, { color: colors.textSecondary }]}>
            {t('games.whoAmI.onePhoneBlurb', { min: WHO_AM_I_COUCH_MIN_PLAYERS, max: WHO_AM_I_COUCH_MAX_PLAYERS })}
          </Text>
          <GoldButton label={t('games.couch.open')} icon="device-phone" onPress={onPhone} style={styles.stretch} />
        </Card>
      ) : null}
      {together ? (
        // Beneath the one-phone way this is the second way in, so it is quieter: smaller words and an outline button.
        // It wears gold only where it is the only way.
        <Card style={phone ? styles.quiet : styles.way}>
          <Text accessibilityRole="header" style={[phone ? styles.quietTitle : styles.title, { color: colors.textPrimary }]}>
            {t('games.whoAmI.online')}
          </Text>
          <Text style={[phone ? styles.note : styles.blurb, { color: colors.textSecondary }]}>
            {t('games.whoAmI.onlineBlurb', { min: WHO_AM_I_TABLE_MIN_PLAYERS, max: WHO_AM_I_TABLE_MAX_PLAYERS })}
          </Text>
          {phone ? (
            <ClayButton label={t('stories.lobby.invite')} icon="people" variant="outline" onPress={askFriends} style={styles.quietButton} />
          ) : (
            <GoldButton label={t('stories.lobby.invite')} icon="people" onPress={askFriends} style={styles.stretch} />
          )}
        </Card>
      ) : null}
      <ScoringNote />
      {inviting && together && !gate.isGuest ? <InviteSheet target={{ kind: 'new', game: 'who-am-i' }} onClose={() => onInviting(false)} /> : null}
    </>
  );
}

// The room.

/** The earlier of the turn's present wait and the game's own end: when the server next settles something by itself. */
function nextDeadline(board: WhoAmITableBoard): string {
  return Date.parse(board.endsAt) < Date.parse(board.phaseEndsAt) ? board.endsAt : board.phaseEndsAt;
}

function TableRoom({ id, onNew, onOpen }: { id: string; onNew: () => void; onOpen: (id: string) => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const room = useGameView<WhoAmITableBoard | null, WhoAmITableOutcome>('who-am-i', id, { deadlineOf: (v) => (v.board ? nextDeadline(v.board) : null) });
  return (
    <GameRoom
      game="who-am-i"
      id={id}
      room={room}
      onNew={onNew}
      onOpen={onOpen}
      newLabel={t('games.whoAmI.name')}
      lobbyNote={(v) => {
        const s = v.settings as { difficulty?: GameDifficulty; minutes?: number };
        return (
          <Text style={[styles.note, { color: colors.textSecondary }]}>
            {t(dialectNameKey(v.dialect))}
            {s.difficulty ? ` · ${t(DIFFICULTY_KEY[s.difficulty])}` : ''}
            {s.minutes ? ` · ${t('games.whoAmI.minutesCount', { count: s.minutes })}` : ''}
          </Text>
        );
      }}
      playing={(v) => <TableBoard view={v} skew={room.skew} move={room.move} />}
      ending={(v) => <TableReveal view={v} />}
      scoreOf={(r) => t('games.whoAmI.points', { count: r.score })}
    />
  );
}

/** Why a move was not taken, in the reader's words: the turn has usually moved on under the thumb. */
function moveError(error: ApiError, t: ReturnType<typeof useI18n>['t']): string {
  if (error.code === 'NOT_YOUR_TURN') return t('games.party.notYourTurn');
  if (error.code === 'MOVE_REFUSED') return t('games.party.notNow');
  return describeError(error, t);
}

/**
 * The table inside the room: whose turn it is against the server's clock, the question on the table, the card's
 * verdict, the reader's own questions (suggested first), and everyone as a row of foreheads. Nothing lists the words
 * the reader might be while questions are asked: "I know who I am!" opens the guess tiles, and a turn that must be a
 * guess opens them by itself. Every card is drawn from the board the server sent this reader, where their own is absent
 * until it is off their forehead.
 */
function TableBoard({ view, skew, move }: { view: TableView; skew: number; move: Move }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const now = useServerNow(skew, view.status === 'active');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The tile of a wrong guess just made, said once under the tiles until the next move.
  const [missed, setMissed] = useState<string | null>(null);
  // The moment at which the reader last said they know who they are: the tiles are open for that moment only.
  const [knowsAt, setKnowsAt] = useState<string | null>(null);
  // The questions this reader reported on a card, by seat and question: the verdict is drawn twice (loud while decided,
  // quiet after), and the thank-you stays in both.
  const [reported, setReported] = useState<readonly string[]>([]);
  const board = view.board;
  if (!board || board.turn === null) return null;
  const me = view.me?.seat ?? null;
  const mine = board.mine;
  const turn = board.turn;
  const { phase, pending, told, dialect } = board;
  const name = (seat: number): string => {
    const p = view.players.find((x) => x.seat === seat);
    return p ? multiSeatName(p, t) : t('stories.player', { seat });
  };
  const asker = name(turn);
  const myTurn = turn === me;
  const guessing = !!mine && !mine.solved && !mine.out;
  // The reader's own turn, at a moment something of theirs can be pressed.
  const acting = myTurn && guessing && phase !== 'answer';
  // This wait of this turn, by name: saying "I know" opens the tiles for it, and the next wait starts with them closed.
  const moment = `${board.turns}:${phase}`;
  // A turn that must be a guess has nothing else on it, so the tiles are there unasked.
  const choosing = acting && (mine?.mustGuess === true || knowsAt === moment);
  const toAnswer = phase === 'answer' && pending !== null && me !== null && pending.waiting.includes(me);
  const answered = phase === 'answer' && pending !== null && me !== null && pending.answered.includes(me);
  const left = Math.max(0, Math.ceil((Date.parse(board.phaseEndsAt) - now) / 1000));
  // The game's own clock, the longest it may run: said quietly, so its end is no surprise.
  const gameLeft = Math.max(0, Math.ceil((Date.parse(board.endsAt) - now) / 1000));

  const act = async (body: WhoAmITableMove): Promise<void> => {
    setBusy(true);
    setError(null);
    setMissed(null);
    const res = await move(body);
    setBusy(false);
    if (!res.ok) return setError(moveError(res.error, t));
    if (body.kind !== 'guess') return;
    const correct = res.data.outcome.correct === true;
    haptic(correct ? 'celebrate' : 'wrong');
    if (!correct) setMissed(body.tile);
  };

  const waitingFor =
    phase === 'ask'
      ? myTurn
        ? t(mine?.mustGuess ? 'games.whoAmI.wait.mustGuess' : 'games.whoAmI.wait.ask.you')
        : t('games.whoAmI.wait.ask.them', { name: asker })
      : phase === 'answer'
        ? myTurn
          ? t('games.whoAmI.wait.answer.asker')
          : toAnswer
            ? t('games.whoAmI.wait.answer.you', { name: asker })
            : answered
              ? t('games.whoAmI.wait.answer.done')
              : t('games.whoAmI.wait.answer.them', { name: asker })
        : myTurn
          ? t(mine?.mustGuess ? 'games.whoAmI.wait.mustGuess' : 'games.whoAmI.wait.decide.you')
          : t('games.whoAmI.wait.decide.them', { name: asker });

  const seats: TableSeat[] = board.seats.map((s) => ({
    seat: s.seat,
    name: name(s.seat),
    mine: s.seat === me,
    // The reader's own seat has no card on the board until it is off their forehead: the hidden mark is drawn for it.
    card: s.card,
    kind: s.seat === me && !s.card ? kindOf(mine?.category ?? null, t) : null,
    points: s.points,
    asked: s.asked,
    solved: s.solved,
    out: s.out,
    left: s.left,
    onTurn: s.seat === turn,
    answer: phase === 'answer' && pending ? (pending.answered.includes(s.seat) ? 'answered' : pending.waiting.includes(s.seat) ? 'waiting' : null) : null,
  }));
  // The card the question is about, for those answering it; never the reader's own.
  const askerCard = pending && pending.seat !== me ? (board.seats.find((s) => s.seat === pending.seat)?.card ?? null) : null;
  const askerCardSpoken = askerCard
    ? `${t('games.couch.cardOf', { name: asker })}: ${askerCard.word}, ${meaningIn(askerCard.meanings, locale) ?? askerCard.meanings.en}`
    : '';
  const crossed = mine?.guesses.filter((g) => !g.correct).map((g) => g.tile) ?? [];
  const missedWord = missed ? (mine?.tiles.find((x) => x.id === missed)?.word ?? null) : null;

  const status =
    mine && guessing ? (
      <View style={styles.status}>
        <Text style={[styles.line, { color: colors.textPrimary }]}>
          {t('games.whoAmI.worth', { count: whoAmIPoints(mine.asked.length, crossed.length, true) })} · {t('games.whoAmI.guessesLeft', { count: mine.guessesLeft })}
        </Text>
        {missedWord ? (
          <Text accessibilityLiveRegion="polite" style={[styles.line, { color: colors.danger }]}>
            {t('games.whoAmI.wrongGuess', { word: missedWord })}
          </Text>
        ) : null}
      </View>
    ) : null;
  const deck =
    mine && guessing ? (
      <QuestionDeck
        dialect={dialect}
        title={t(acting && phase === 'ask' ? 'games.whoAmI.questions' : 'games.whoAmI.yourQuestions')}
        questions={mine.questions}
        asked={mine.asked}
        suggested={mine.suggested}
        meanings={board.difficulty === 'beginner'}
        busy={busy}
        onAsk={acting && phase === 'ask' ? (question) => void act({ kind: 'ask', question }) : null}
      />
    ) : null;
  const tiles =
    mine && choosing ? (
      <>
        <GuessTiles dialect={dialect} tiles={mine.tiles} crossed={crossed} busy={busy} onGuess={(tile) => void act({ kind: 'guess', tile })} />
        {mine.mustGuess ? null : <ClayButton label={t('games.whoAmI.notYet')} variant="outline" disabled={busy} onPress={() => setKnowsAt(null)} />}
      </>
    ) : acting ? (
      <ClayButton label={t('games.whoAmI.iKnow')} tone="primary" size="large" disabled={busy} onPress={() => setKnowsAt(moment)} />
    ) : null;
  // Only someone who could read the asker's card may report its answer, so the asker is asked only once their card is
  // off their forehead.
  const readsCard = !!told && me !== null && (told.seat !== me || mine?.identity != null);
  const reportKey = told ? `${told.seat}:${told.question.id}` : '';
  /** What the card said to the last question, and how each friend's answer went by it: loud while it is decided on, quiet after. */
  const verdict = (quiet: boolean): React.JSX.Element | null =>
    told ? (
      <VerdictCard
        dialect={dialect}
        heading={told.seat === me ? t('games.whoAmI.yourQuestion') : t('games.whoAmI.asks', { name: name(told.seat) })}
        question={told.question}
        verdict={told.verdict}
        answers={told.answers.map((a) => ({ seat: a.seat, name: name(a.seat), says: a.says, mark: a.mark }))}
        quiet={quiet}
        report={
          readsCard
            ? {
                body: { game: view.id, seat: told.seat, question: told.question.id },
                done: reported.includes(reportKey),
                onDone: () => setReported((r) => [...r, reportKey]),
              }
            : null
        }
      />
    ) : null;
  // With every question asked there is nothing to wait for: the turn is a guess, and the banner says so.
  const pass =
    acting && !mine?.mustGuess ? <ClayButton label={t('games.whoAmI.pass')} variant="outline" disabled={busy} onPress={() => void act({ kind: 'pass' })} /> : null;

  return (
    <View style={styles.board}>
      <Cloth style={styles.banner}>
        <View accessibilityLiveRegion="polite" style={styles.bannerText}>
          <Text accessibilityRole="header" style={[styles.bannerTitle, { color: myTurn ? TABLE.gold : TABLE.ink }]}>
            {myTurn ? t('games.whoAmI.turn.yours') : t('games.whoAmI.turn.theirs', { name: asker })}
          </Text>
          <Text style={styles.bannerLine}>{waitingFor}</Text>
        </View>
        <View style={[styles.clock, { flexDirection: dir.row }]}>
          <Text style={[styles.clockLeft, { color: left <= 5 ? TABLE.low : TABLE.ink }]} accessibilityElementsHidden importantForAccessibility="no">
            {t('games.party.seconds', { count: left })}
          </Text>
          <View style={styles.clockBar}>
            <PartyTimer
              share={Math.max(0, Date.parse(board.phaseEndsAt) - now) / (WAIT_SECONDS[phase] * 1000)}
              low={left <= 5 && (acting || toAnswer)}
              color={TABLE.gold}
              label={t('games.whoAmI.timeLeft', { count: left })}
            />
          </View>
        </View>
        <Text style={styles.gameLeft}>{t('games.whoAmI.gameLeft', { time: `${Math.floor(gameLeft / 60)}:${String(gameLeft % 60).padStart(2, '0')}` })}</Text>
      </Cloth>
      {error ? (
        <Text accessibilityRole="alert" style={[styles.line, { color: colors.danger }]}>
          {error}
        </Text>
      ) : null}

      {phase === 'answer' && pending ? (
        myTurn ? (
          <View style={[styles.panel, { backgroundColor: colors.glassFill }]}>
            <Text style={[styles.panelHeading, { color: colors.textSecondary }]}>{t('games.whoAmI.yourQuestion')}</Text>
            <QuestionCard key={pending.question.id} dialect={dialect} question={pending.question} ink={colors.textPrimary} soft={colors.textSecondary} />
            <Text accessibilityLiveRegion="polite" style={[styles.line, { color: colors.textPrimary }]}>
              {pending.answered.length > 0 ? t('games.whoAmI.answeredSoFar', { names: listed(pending.answered.map(name), locale) }) : t('games.whoAmI.nobodyYet')}
            </Text>
          </View>
        ) : (
          <View style={[styles.panel, { backgroundColor: colors.glassFill }]}>
            <Text style={[styles.panelHeading, { color: colors.textSecondary }]}>{t('games.whoAmI.asks', { name: asker })}</Text>
            <QuestionCard key={pending.question.id} dialect={dialect} question={pending.question} ink={colors.textPrimary} soft={colors.textSecondary} />
            {askerCard ? (
              <View accessible accessibilityLabel={askerCardSpoken}>
                <ForeheadCard dialect={dialect} category={null} identity={askerCard} size={150} />
              </View>
            ) : null}
            {toAnswer ? (
              <AnswerButtons dialect={dialect} answers={board.answers} disabled={busy} onAnswer={(says) => void act({ kind: 'answer', says })} />
            ) : answered ? (
              <Text accessibilityLiveRegion="polite" style={[styles.line, { color: colors.textPrimary }]}>
                {pending.says === null ? t('games.whoAmI.wait.answer.done') : t('games.whoAmI.youSaid', { answer: answerWord(dialect, pending.says, t) })}
              </Text>
            ) : null}
          </View>
        )
      ) : null}
      {phase === 'decide' ? verdict(false) : null}

      {acting ? (
        <>
          {status}
          {phase === 'ask' ? deck : null}
          {tiles}
          {pass}
        </>
      ) : null}

      <Foreheads dialect={dialect} seats={seats} label={t('games.whoAmI.table')} />

      {/* The reader's own card, only once the server has sent it: they have it, or are out of guesses. */}
      {mine?.identity ? (
        <View style={styles.mine}>
          <ForeheadCard dialect={dialect} category={mine.category} identity={mine.identity} size={180} />
          <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={[styles.title, { color: colors.textPrimary }]}>
            {mine.solved ? t('games.whoAmI.youAre', { word: mine.identity.word }) : t('games.whoAmI.youWere', { word: mine.identity.word })}
          </Text>
          <Text style={[styles.line, { color: colors.textPrimary }]}>{t('games.whoAmI.score', { count: mine.points })}</Text>
          <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t('games.whoAmI.keepAnswering')}</Text>
        </View>
      ) : null}
      {guessing && !acting ? (
        <>
          {status}
          {deck}
        </>
      ) : null}
      {acting && phase === 'decide' ? deck : null}

      {/* The last question stays on the table while the next turn is chosen, for whoever missed what the card said. */}
      {phase === 'ask' ? verdict(true) : null}
      <ScoringNote answers={board.answers} />
    </View>
  );
}

/** The game is over: who everyone was, each card on its forehead, and why it ended. The room adds the places and Play again. */
function TableReveal({ view }: { view: TableView }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  const board = view.board;
  if (!board?.reveal) return null;
  const reveal = board.reveal;
  const seats: TableSeat[] = board.seats.map((s) => {
    const p = view.players.find((x) => x.seat === s.seat);
    return {
      seat: s.seat,
      name: p ? multiSeatName(p, t) : t('stories.player', { seat: s.seat }),
      mine: s.seat === view.me?.seat,
      card: reveal.find((r) => r.seat === s.seat) ?? s.card,
      kind: null,
      points: s.points,
      asked: s.asked,
      solved: s.solved,
      out: s.out,
      left: s.left,
      onTurn: false,
      answer: null,
    };
  });
  return (
    <View style={styles.reveal}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>
        {t('games.whoAmI.reveal')}
      </Text>
      <Foreheads dialect={board.dialect} seats={seats} label={t('games.whoAmI.table')} />
      {board.endedBy ? <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t(END_KEY[board.endedBy])}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  loading: { marginTop: spacing.xl },
  stage: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  stageLine: { color: TABLE.inkSoft, fontSize: typography.sizes.md, lineHeight: 23, textAlign: 'center' },
  way: { alignItems: 'center', gap: spacing.sm },
  quiet: { alignItems: 'center', gap: spacing.xs },
  quietTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, textAlign: 'center' },
  quietButton: { alignSelf: 'stretch', marginTop: spacing.xs },
  stretch: { alignSelf: 'stretch', marginTop: spacing.sm },
  title: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, textAlign: 'center' },
  blurb: { fontSize: typography.sizes.md, textAlign: 'center', lineHeight: 22 },
  note: { fontSize: typography.sizes.sm, textAlign: 'center' },
  board: { gap: spacing.md },
  banner: { gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  bannerText: { gap: 2 },
  bannerTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, textAlign: 'center' },
  bannerLine: { fontSize: typography.sizes.sm, lineHeight: 20, textAlign: 'center', color: TABLE.inkSoft },
  clock: { alignItems: 'center', gap: spacing.sm },
  clockLeft: { minWidth: 44, fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, textAlign: 'center', fontVariant: ['tabular-nums'] },
  clockBar: { flex: 1 },
  gameLeft: { fontSize: typography.sizes.xs, textAlign: 'center', color: TABLE.inkSoft, fontVariant: ['tabular-nums'] },
  panel: { alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radii.xl },
  panelHeading: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, textAlign: 'center' },
  status: { gap: 2 },
  line: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, textAlign: 'center' },
  mine: { alignItems: 'center', gap: spacing.xs },
  reveal: { alignSelf: 'stretch', gap: spacing.sm },
});
