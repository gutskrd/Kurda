import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { usePreventRemove } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  GAME_DIFFICULTIES,
  WHO_AM_I_COUCH_MAX_PLAYERS,
  WHO_AM_I_COUCH_MIN_PLAYERS,
  WHO_AM_I_COUCH_NAME_MAX,
  couchName,
  roomAnswers,
  startCouchTable,
  whoAmIPoints,
  whoAmITableRules,
  type GameDialect,
  type GameDifficulty,
  type WhoAmICouchDeals,
  type WhoAmICouchOffer,
  type WhoAmITableMove,
  type WhoAmITableState,
} from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { describeError } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { newDeviceId } from '../auth/deviceId';
import { haptic } from '../feedback/haptics';
import { DIFFICULTY_KEY } from '../games/partyChoices';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { Cloth, GoldButton, StepTitle } from '../impostor/parts';
import { TABLE } from '../impostor/table';
import { useHardwareBack } from '../navigation/hardwareBack';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useDirection } from '../reports/direction';
import { Note } from '../stories/ui';
import { ClayButton, GlassCard, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { ForeheadCard, Foreheads, GuessTiles, QuestionCard, QuestionDeck, ScoringNote, VerdictCard, YesNoButtons, type CardFace, type TableSeat } from './WhoAmIStage';

/**
 * Who Am I? on one phone, passed round a room.
 *
 * The rules are the table's own (shared/src/games/who-am-i/rules.ts), started
 * and answered for a room by couch.ts; this is the phone's part in them. It
 * asks who is playing and how hard, fetches a card for everyone (approved
 * identities, dealt by the server), and walks the room through the game:
 * each player's card shown to the others while that player looks away, then
 * the phone from hand to hand. Whoever holds it picks a question and reads it
 * out, the room answers out loud, the holder taps what the room said, the
 * card says which it is, and the holder guesses or passes the phone on.
 *
 * What it is careful about, because one screen is read by people who must not
 * see their own card:
 * - a card is on the screen only while the others hold the button down for
 *   it, at the start, and once it is off its player's forehead; letting go,
 *   leaving the app or the screen locking hides it;
 * - everything a turn draws comes from the rules' view for the seat holding
 *   the phone, where that seat's own card is not, and the row of seats shows
 *   each card as its own wearer may see it;
 * - between two players there is always a screen that shows nothing but the
 *   next one's name;
 * - the cards stay in memory for the game and are never stored, and the
 *   players' names never leave the phone.
 *
 * No clock runs here: the phone waits for the room. Nothing is paid for a
 * game played this way, since the phone holds every card and cannot be the
 * judge of who won.
 */

/** Where the game can be played on one phone in a Kurdish; undefined until the server answers, null when it could not. */
export function useCouchOffer(dialect: GameDialect, enabled = true): WhoAmICouchOffer | null | undefined {
  const { client } = useAuth();
  const [offer, setOffer] = useState<WhoAmICouchOffer | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setOffer(undefined);
    void client.get<WhoAmICouchOffer>(`/games/who-am-i/couch?dialect=${dialect}`).then((res) => {
      if (!alive) return;
      const offered = res.ok && Array.isArray(res.data?.difficulties) ? res.data.difficulties : null;
      // only the difficulties this version of the app knows, in their own order: the setup offers exactly these
      setOffer(offered ? { dialect, difficulties: GAME_DIFFICULTIES.filter((d) => offered.includes(d)) } : null);
    });
    return () => {
      alive = false;
    };
  }, [client, dialect, enabled]);
  return offer;
}

/** Whether a screen reader is reading the phone: its user cannot press and hold, so a card is turned by a tap instead. */
function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((v) => {
      if (alive) setOn(v);
    });
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return on;
}

/**
 * A glass card with its contents laid out by `style`. The glass card's own
 * style is its frame's, so a gap or an alignment given there never reaches
 * what is inside it.
 */
function Card({ style, children }: { style: StyleProp<ViewStyle>; children: React.ReactNode }): React.JSX.Element {
  return (
    <GlassCard>
      <View style={style}>{children}</View>
    </GlassCard>
  );
}

/** What the room is looking at: each card in turn, the phone between two players, a turn, or what a guess came to. */
type Moment = { at: 'look'; seat: number } | { at: 'pass' } | { at: 'turn' } | { at: 'guessed'; seat: number; tile: string; correct: boolean };

interface Game {
  players: string[];
  difficulty: GameDifficulty;
  table: WhoAmITableState;
  moment: Moment;
}

export function WhoAmICouch({
  offer,
  onLeave,
}: {
  /** where the game is offered on one phone: a Kurdish, and at least one difficulty */
  offer: WhoAmICouchOffer;
  onLeave: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const { client } = useAuth();
  const { colors } = useTheme();
  const [names, setNames] = useState<string[]>(() => Array.from({ length: WHO_AM_I_COUCH_MIN_PLAYERS }, () => ''));
  const [difficulty, setDifficulty] = useState<GameDifficulty | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [busy, setBusy] = useState(false);
  // why the cards could not be dealt, in the reader's words; null while nothing has gone wrong
  const [failed, setFailed] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const over = game !== null && whoAmITableRules.finished(game.table) && game.moment.at !== 'guessed';
  // a game under way is not left by a slip of the thumb: every way back asks first
  const held = game !== null && !over;
  const ask = (): void => setLeaving(true);
  usePreventRemove(held, ask);
  useHardwareBack(held ? ask : null);

  /** A card for everyone, dealt by the server, and the table laid from them. */
  async function deal(players: string[], level: GameDifficulty): Promise<void> {
    setBusy(true);
    setFailed(null);
    const res = await client.post<WhoAmICouchDeals>('/games/who-am-i/couch/deal', { dialect: offer.dialect, difficulty: level, players: players.length });
    setBusy(false);
    if (!res.ok) {
      // too few approved cards for a room this size is the room's to change; asking too often says so itself; anything else is the connection
      if (res.error.code === 'GAME_UNAVAILABLE') return setFailed(t('games.whoAmI.couch.noCards'));
      return setFailed(res.error.kind === 'rate_limited' ? describeError(res.error, t) : t('games.couch.failed'));
    }
    if (!Array.isArray(res.data?.deals) || res.data.deals.length !== players.length) return setFailed(t('games.couch.failed'));
    haptic('tap');
    // the seed is the phone's own, from the generator a new device id comes from
    setGame({ players, difficulty: level, table: startCouchTable(res.data, Date.now(), newDeviceId()), moment: { at: 'look', seat: 0 } });
  }

  /** Back to who is playing, with the names still there. */
  const toSetup = (): void => {
    setFailed(null);
    setGame(null);
  };

  const header = <ScreenHeader title={t('games.whoAmI.name')} onBack={held ? ask : onLeave} />;

  if (leaving) {
    return (
      <>
        {header}
        <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Card style={styles.centered}>
            <Text accessibilityRole="header" style={[styles.heading, { color: colors.textPrimary }]}>
              {t('games.whoAmI.endConfirm.title')}
            </Text>
            <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t('games.whoAmI.endConfirm.body')}</Text>
            <GoldButton label={t('games.leave.stay')} onPress={() => setLeaving(false)} style={styles.stretch} />
            <ClayButton
              label={t('games.whoAmI.endGame')}
              tone="danger"
              variant="outline"
              onPress={() => {
                // not out of the door: the room may only want another start, with a name or the difficulty put right
                setLeaving(false);
                toSetup();
              }}
              style={styles.stretch}
            />
          </Card>
        </ScrollView>
      </>
    );
  }

  if (game === null) {
    return (
      <>
        {header}
        <Setup
          offer={offer}
          names={names}
          onNames={setNames}
          difficulty={difficulty}
          onDifficulty={setDifficulty}
          busy={busy}
          failed={failed}
          onStart={(players, level) => void deal(players, level)}
        />
      </>
    );
  }

  const play = (table: WhoAmITableState, moment: Moment): void => setGame({ ...game, table, moment });
  return (
    <>
      {header}
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {over ? (
          <End
            game={game}
            busy={busy}
            failed={failed}
            onAgain={() => void deal(game.players, game.difficulty)}
            onChange={toSetup}
            onLeave={onLeave}
          />
        ) : (
          <>
            <Round game={game} play={play} />
            <ClayButton label={t('games.whoAmI.endGame')} variant="outline" onPress={ask} />
          </>
        )}
      </ScrollView>
    </>
  );
}

// ---------- who is playing, and how hard ----------

function Setup({
  offer,
  names,
  onNames,
  difficulty,
  onDifficulty,
  busy,
  failed,
  onStart,
}: {
  offer: WhoAmICouchOffer;
  names: readonly string[];
  onNames: (next: string[]) => void;
  difficulty: GameDifficulty | null;
  onDifficulty: (next: GameDifficulty) => void;
  busy: boolean;
  failed: string | null;
  onStart: (players: string[], difficulty: GameDifficulty) => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const insets = useSafeAreaInsets();
  const [slip, setSlip] = useState<TranslationKey | null>(null);
  const levels = offer.difficulties;
  const level = difficulty !== null && levels.includes(difficulty) ? difficulty : levels[0]!;
  const canRemove = names.length > WHO_AM_I_COUCH_MIN_PLAYERS;
  const canAdd = names.length < WHO_AM_I_COUCH_MAX_PLAYERS;
  // an empty box takes the name on its placeholder: "Player 2"
  const named = names.map((n, i) => (n.trim() === '' ? t('games.couch.playerName', { n: i + 1 }) : n));

  function start(): void {
    // a name as the table keeps it: one line, trimmed to what fits under a forehead
    const players = named.map((n) => [...couchName(n)].slice(0, WHO_AM_I_COUCH_NAME_MAX).join('').trim());
    if (players.some((n) => n === '')) return setSlip('games.couch.names.empty');
    if (new Set(players.map((n) => n.toLocaleLowerCase())).size !== players.length) return setSlip('games.couch.names.same');
    setSlip(null);
    onStart(players, level);
  }

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={[styles.blurb, { color: colors.textSecondary }]}>
          {t('games.whoAmI.couch.blurb', { min: WHO_AM_I_COUCH_MIN_PLAYERS, max: WHO_AM_I_COUCH_MAX_PLAYERS })}
        </Text>

        <Card style={styles.form}>
          <StepTitle n={1}>{t('games.couch.players')}</StepTitle>
          <View style={styles.names}>
            {names.map((name, i) => (
              <View key={i} style={[styles.nameRow, { flexDirection: dir.row }]}>
                <View style={styles.nameN}>
                  <Text style={styles.nameNText}>{name.trim() === '' ? i + 1 : name.trim().slice(0, 1).toUpperCase()}</Text>
                </View>
                <TextInput
                  value={name}
                  onChangeText={(v) => onNames(names.map((n, j) => (j === i ? v : n)))}
                  maxLength={WHO_AM_I_COUCH_NAME_MAX}
                  placeholder={t('games.couch.playerName', { n: i + 1 })}
                  placeholderTextColor={colors.textSecondary}
                  accessibilityLabel={t('games.couch.playerName', { n: i + 1 })}
                  autoCorrect={false}
                  autoComplete="off"
                  returnKeyType="next"
                  style={[styles.nameInput, dir.text, { color: colors.textPrimary, backgroundColor: colors.controlTrack }]}
                />
                {canRemove ? (
                  <Pressable
                    onPress={() => onNames(names.filter((_, j) => j !== i))}
                    accessibilityRole="button"
                    accessibilityLabel={t('games.couch.removePlayer', { name: named[i]! })}
                    style={({ pressed }) => [styles.nameRemove, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Icon name="close" size={18} color={colors.textSecondary} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
          {canAdd ? <ClayButton label={t('games.couch.addPlayer')} icon="plus" variant="outline" onPress={() => onNames([...names, ''])} /> : null}
          {slip ? (
            <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={[styles.note, { color: colors.danger }]}>
              {t(slip)}
            </Text>
          ) : null}
        </Card>

        {levels.length > 1 ? (
          <Card style={styles.form}>
            <StepTitle n={2}>{t('games.solo.difficulty')}</StepTitle>
            <Segmented<GameDifficulty>
              groupLabel={t('games.solo.difficulty')}
              options={levels}
              value={level}
              onChange={onDifficulty}
              labelOf={(d) => t(DIFFICULTY_KEY[d])}
              wrap
            />
          </Card>
        ) : null}

        <ScoringNote />
      </ScrollView>

      {/* Deal the cards: under the list, where a thumb is, whatever the list is scrolled to */}
      <View style={[styles.go, { paddingBottom: insets.bottom + spacing.sm, borderTopColor: colors.separator, backgroundColor: colors.background }]}>
        {failed ? <Note tone="danger">{failed}</Note> : null}
        <GoldButton label={t('games.couch.start')} busy={busy} onPress={start} />
        <Text style={[styles.goNote, { color: colors.textSecondary }]}>{t('games.couch.noPay')}</Text>
      </View>
    </View>
  );
}

// ---------- the game ----------

/**
 * Every seat as its own wearer may see it. The phone's screen is read by the
 * whole room, so a card is in this row only once it is off its forehead: the
 * rules' view for a seat holds that seat's own card exactly then.
 */
function roomSeats(game: Game): TableSeat[] {
  return game.players.map((name, seat) => {
    const own = whoAmITableRules.viewFor(game.table, seat);
    const s = own.seats.find((x) => x.seat === seat);
    return {
      seat,
      name,
      mine: false,
      card: s?.card ?? null,
      kind: null,
      points: s?.points ?? 0,
      asked: s?.asked ?? 0,
      solved: s?.solved ?? false,
      out: s?.out ?? false,
      left: s?.left ?? false,
      onTurn: own.turn === seat,
      answer: null,
    };
  });
}

function Round({ game, play }: { game: Game; play: (table: WhoAmITableState, moment: Moment) => void }): React.JSX.Element | null {
  const { table, moment, players } = game;
  if (moment.at === 'look') {
    // the card on a forehead, read from the seat beside it: anyone but its wearer may
    const reader = (moment.seat + 1) % players.length;
    const card = whoAmITableRules.viewFor(table, reader).seats.find((s) => s.seat === moment.seat)?.card ?? null;
    const last = moment.seat === players.length - 1;
    return (
      <Look
        key={moment.seat}
        dialect={table.dialect}
        name={players[moment.seat]!}
        card={card}
        at={moment.seat}
        of={players.length}
        last={last}
        onNext={() => play(table, last ? { at: 'pass' } : { at: 'look', seat: moment.seat + 1 })}
      />
    );
  }
  if (moment.at === 'guessed') {
    return <Guessed game={game} seat={moment.seat} tile={moment.tile} correct={moment.correct} onNext={() => play(table, { at: 'pass' })} />;
  }
  const seat = table.turn;
  if (seat === null) return null;
  if (moment.at === 'pass') return <PassTo name={players[seat]!} onMine={() => play(table, { at: 'turn' })} />;
  return <Turn key={`${seat}:${table.turns}`} game={game} seat={seat} play={play} />;
}

/** How far the phone has got round the room, as dots. */
function Progress({ done, of }: { done: number; of: number }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: of }, (_, i) => (
        <View key={i} style={[styles.dot, { backgroundColor: i < done ? TABLE.gold : i === done ? colors.textPrimary : colors.controlTrack }]} />
      ))}
    </View>
  );
}

/** Before the first turn: one player's card, shown to everyone else while that player looks away. */
function Look({
  dialect,
  name,
  card,
  at,
  of,
  last,
  onNext,
}: {
  dialect: GameDialect;
  name: string;
  card: CardFace | null;
  at: number;
  of: number;
  last: boolean;
  onNext: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const reader = useScreenReader();
  const [shown, setShown] = useState(false);
  const [seen, setSeen] = useState(false);

  // the card goes face down the moment the app is not the one in front: another app, the lock screen, the app switcher
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') setShown(false);
    });
    return () => sub.remove();
  }, []);

  const show = (): void => {
    if (!shown) haptic('tap');
    setShown(true);
    setSeen(true);
  };
  const hide = (): void => setShown(false);
  const hold = t('games.whoAmI.look.hold', { name });
  return (
    <>
      <Progress done={at} of={of} />
      <Cloth style={styles.stage}>
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.stageTitle}>
          {t('games.whoAmI.look.title', { name })}
        </Text>
        <Text style={styles.stageLine}>{t('games.whoAmI.look.body', { name })}</Text>
        <ForeheadCard dialect={dialect} category={null} identity={shown ? card : null} night hiddenLabel={t('games.couch.cardOf', { name })} />
      </Cloth>
      <Pressable
        onPressIn={reader ? undefined : show}
        onPressOut={reader ? undefined : hide}
        // someone listening to the phone cannot press and hold: for them a tap turns the card, and another turns it back
        onPress={reader ? () => (shown ? hide() : show()) : undefined}
        accessibilityRole="button"
        accessibilityLabel={hold}
        accessibilityState={{ selected: shown }}
        style={[styles.hold, { backgroundColor: shown ? TABLE.gold : `${TABLE.gold}29`, borderColor: TABLE.gold }]}
      >
        <Icon name="eye" size={22} color={shown ? TABLE.goldInk : colors.goldText} />
        <Text style={[styles.holdText, { color: shown ? TABLE.goldInk : colors.goldText }]}>{hold}</Text>
      </Pressable>
      <Text style={[styles.note, styles.center, { color: colors.textSecondary }]}>{t('games.whoAmI.look.note')}</Text>
      <ClayButton label={last ? t('play.room.start') : t('games.couch.next')} tone="primary" size="large" disabled={!seen || shown} onPress={onNext} />
    </>
  );
}

/** The screen between two players: nothing on it but whose turn it is to hold the phone. */
function PassTo({ name, onMine }: { name: string; onMine: () => void }): React.JSX.Element {
  const { t } = useI18n();
  return (
    <Cloth style={styles.pass}>
      <View style={styles.passHalo}>
        <View style={styles.passDisc}>
          <Text style={styles.passDiscText}>{name.slice(0, 1).toUpperCase()}</Text>
        </View>
      </View>
      <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.stageTitle}>
        {t('games.whoAmI.handTo', { name })}
      </Text>
      <GoldButton label={t('games.couch.iAm', { name })} onPress={onMine} style={styles.stretch} />
    </Cloth>
  );
}

/**
 * One player's turn, with the phone in their hands: their questions and
 * tiles; then the question they chose, to read out, and what the room said;
 * then the card's own answer, and a guess or the phone passed on.
 */
function Turn({ game, seat, play }: { game: Game; seat: number; play: (table: WhoAmITableState, moment: Moment) => void }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { table, players } = game;
  // the board as the seat holding the phone is sent it: their own card is not on it
  const view = whoAmITableRules.viewFor(table, seat);
  const mine = view.mine;
  if (!mine) return null;
  const name = players[seat]!;
  const dialect = view.dialect;
  const crossed = mine.guesses.filter((g) => !g.correct).map((g) => g.tile);
  const seats = <Foreheads dialect={dialect} seats={roomSeats(game)} label={t('games.whoAmI.table')} />;

  const move = (m: WhoAmITableMove): void => {
    const applied = whoAmITableRules.apply(table, seat, m, Date.now());
    // the rules refuse nothing these buttons offer; a refusal leaves the turn as it is
    if (!applied.ok) return;
    if (m.kind === 'guess') {
      const correct = applied.outcome.correct === true;
      haptic(correct ? 'celebrate' : 'wrong');
      return play(applied.state, { at: 'guessed', seat, tile: m.tile, correct });
    }
    play(applied.state, m.kind === 'pass' ? { at: 'pass' } : { at: 'turn' });
  };
  const pass = mine.mustGuess ? (
    <Text style={[styles.note, styles.center, { color: colors.textSecondary }]}>{t('games.whoAmI.wait.mustGuess')}</Text>
  ) : (
    <ClayButton label={t('games.whoAmI.pass')} variant="outline" onPress={() => move({ kind: 'pass' })} />
  );

  if (view.phase === 'answer' && view.pending) {
    return (
      <>
        <Cloth style={styles.stage}>
          <Text style={styles.stageKicker}>{t('games.whoAmI.readOut')}</Text>
          <QuestionCard key={view.pending.question.id} dialect={dialect} question={view.pending.question} ink={TABLE.ink} soft={TABLE.inkSoft} large />
        </Cloth>
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={[styles.heading, { color: colors.textPrimary }]}>
          {t('games.whoAmI.roomSaid')}
        </Text>
        <YesNoButtons
          dialect={dialect}
          onAnswer={(yes) => {
            const next = roomAnswers(table, yes, Date.now());
            haptic(next.told?.truth === yes ? 'correct' : 'wrong');
            play(next, { at: 'turn' });
          }}
        />
      </>
    );
  }

  if (view.phase === 'decide' && view.told) {
    const said = view.told.answers.filter((a) => a.yes !== null);
    return (
      <>
        <VerdictCard
          dialect={dialect}
          heading={t('games.whoAmI.asks', { name })}
          question={view.told.question}
          truth={view.told.truth}
          note={said.length === 0 ? undefined : t(said.some((a) => a.right) ? 'games.whoAmI.room.right' : 'games.whoAmI.room.wrong')}
        />
        <GuessTiles dialect={dialect} tiles={mine.tiles} crossed={crossed} onGuess={(tile) => move({ kind: 'guess', tile })} />
        {pass}
        <QuestionDeck dialect={dialect} title={t('games.whoAmI.yourQuestions')} questions={mine.questions} asked={mine.asked} onAsk={null} />
        {seats}
      </>
    );
  }

  return (
    <>
      <Cloth style={styles.stage}>
        <ForeheadCard dialect={dialect} category={mine.category} identity={null} size={150} night />
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.stageTitle}>
          {t('games.whoAmI.turn.theirs', { name })}
        </Text>
        <Text style={styles.stageLine}>{t(mine.mustGuess ? 'games.whoAmI.wait.mustGuess' : 'games.whoAmI.wait.ask.you')}</Text>
        <Text style={styles.stageStat}>
          {t('games.whoAmI.worth', { count: whoAmIPoints(mine.asked.length, crossed.length, true) })} · {t('games.whoAmI.guessesLeft', { count: mine.guessesLeft })}
        </Text>
      </Cloth>
      <QuestionDeck
        dialect={dialect}
        title={t(mine.mustGuess ? 'games.whoAmI.yourQuestions' : 'games.whoAmI.questions')}
        questions={mine.questions}
        asked={mine.asked}
        onAsk={mine.mustGuess ? null : (question) => move({ kind: 'ask', question })}
      />
      <GuessTiles dialect={dialect} tiles={mine.tiles} crossed={crossed} onGuess={(tile) => move({ kind: 'guess', tile })} />
      {mine.mustGuess ? null : pass}
      {seats}
    </>
  );
}

/** What a guess came to: the card off its forehead at a right one, and at a wrong one what is left. */
function Guessed({ game, seat, tile, correct, onNext }: { game: Game; seat: number; tile: string; correct: boolean; onNext: () => void }): React.JSX.Element | null {
  const { t } = useI18n();
  const view = whoAmITableRules.viewFor(game.table, seat);
  const mine = view.mine;
  if (!mine) return null;
  const guess = mine.tiles.find((x) => x.id === tile)?.word ?? '';
  // the player's own card, only where the rules have taken it off: at a right guess, or out of guesses
  const identity = mine.identity;
  return (
    <>
      <Cloth style={styles.stage}>
        <ForeheadCard dialect={view.dialect} category={mine.category} identity={identity} size={180} night />
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.stageTitle}>
          {correct && identity ? t('games.whoAmI.youAre', { word: identity.word }) : t('games.whoAmI.wrongGuess', { word: guess })}
        </Text>
        {correct ? (
          <Text style={styles.stageLine}>{t('games.whoAmI.score', { count: mine.points })}</Text>
        ) : identity ? (
          <Text style={styles.stageLine}>{t('games.whoAmI.youWere', { word: identity.word })}</Text>
        ) : (
          <Text style={styles.stageLine}>{t('games.whoAmI.guessesLeft', { count: mine.guessesLeft })}</Text>
        )}
      </Cloth>
      <GoldButton label={t('games.couch.next')} onPress={onNext} />
    </>
  );
}

/** The game is over: who everyone was, the points, and another game with the same room. */
function End({
  game,
  busy,
  failed,
  onAgain,
  onChange,
  onLeave,
}: {
  game: Game;
  busy: boolean;
  failed: string | null;
  onAgain: () => void;
  onChange: () => void;
  onLeave: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  useEffect(() => {
    haptic('celebrate');
  }, []);
  const places = whoAmITableRules.places(game.table);
  return (
    <>
      <Cloth style={styles.stage}>
        <Icon name="trophy" size={36} color={TABLE.gold} />
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.stageTitle}>
          {t('games.whoAmI.reveal')}
        </Text>
      </Cloth>
      <Foreheads dialect={game.table.dialect} seats={roomSeats(game)} label={t('games.whoAmI.table')} />
      <Card style={styles.score}>
        {places.map((p, i) => (
          <View
            key={p.seat}
            accessible
            accessibilityLabel={`${p.place}. ${game.players[p.seat]!}, ${t('games.whoAmI.points', { count: p.score })}`}
            style={[styles.scoreRow, { flexDirection: dir.row, borderTopColor: colors.separator }, i > 0 ? styles.scoreRule : null]}
          >
            <Text style={[styles.scorePlace, { color: colors.textSecondary }]}>{p.place}</Text>
            <Text style={[styles.scoreName, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
              {game.players[p.seat]!}
            </Text>
            <Text style={[styles.scorePoints, { color: colors.textPrimary }]}>{t('games.whoAmI.points', { count: p.score })}</Text>
          </View>
        ))}
      </Card>
      {failed ? <Note tone="danger">{failed}</Note> : null}
      <GoldButton label={t('games.playAgain')} busy={busy} onPress={onAgain} />
      <ClayButton label={t('games.couch.change')} variant="outline" onPress={onChange} />
      <ClayButton label={t('games.couch.finish')} onPress={onLeave} />
      <Text style={[styles.goNote, { color: colors.textSecondary }]}>{t('games.couch.noPay')}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  centered: { alignItems: 'center', gap: spacing.sm },
  stretch: { alignSelf: 'stretch' },
  heading: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, textAlign: 'center' },
  blurb: { fontSize: typography.sizes.md, textAlign: 'center', lineHeight: 22 },
  note: { fontSize: typography.sizes.sm, lineHeight: 20 },
  center: { textAlign: 'center' },
  form: { gap: spacing.md },
  names: { gap: spacing.sm },
  nameRow: { alignItems: 'center', gap: spacing.sm },
  nameN: { width: 36, height: 36, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: `${TABLE.gold}29` },
  nameNText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, color: TABLE.gold },
  // a text field is as wide as its text wants unless told it may be narrower: without that the row runs off the card
  nameInput: { flex: 1, minWidth: 0, minHeight: 48, fontSize: typography.sizes.md, borderRadius: radii.md, paddingHorizontal: 12 },
  nameRemove: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  // the one divider on the screen: what scrolls ends here, and what is always in reach begins
  go: { gap: spacing.sm, paddingTop: spacing.sm, paddingHorizontal: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
  goNote: { fontSize: typography.sizes.xs, textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 22, height: 6, borderRadius: radii.pill },
  stage: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg, paddingHorizontal: spacing.lg },
  stageKicker: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    textAlign: 'center',
    color: TABLE.goldSoft,
  },
  stageTitle: { fontSize: typography.sizes.xl, lineHeight: 34, fontWeight: typography.weights.bold, textAlign: 'center', color: TABLE.ink },
  stageLine: { fontSize: typography.sizes.md, lineHeight: 22, textAlign: 'center', color: TABLE.inkSoft },
  stageStat: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, textAlign: 'center', color: TABLE.goldSoft },
  hold: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 2,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
  },
  holdText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  pass: { alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
  passHalo: { width: 140, height: 140, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: `${TABLE.gold}26` },
  passDisc: { width: 108, height: 108, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: TABLE.gold },
  passDiscText: { fontSize: 50, fontWeight: typography.weights.bold, color: TABLE.goldInk },
  // the rows of the score sit against each other, a rule between them: the table reads as one thing
  score: { gap: 0 },
  scoreRow: { alignItems: 'center', gap: spacing.sm, minHeight: 40 },
  scoreRule: { borderTopWidth: StyleSheet.hairlineWidth },
  scorePlace: { width: 24, fontSize: typography.sizes.md, fontWeight: typography.weights.bold, textAlign: 'center' },
  scoreName: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  scorePoints: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
});
