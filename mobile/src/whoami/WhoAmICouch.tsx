import { useEffect, useState } from 'react';
import { Animated, AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { usePreventRemove } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  GAME_DIFFICULTIES,
  WHO_AM_I_COUCH_MAX_PLAYERS,
  WHO_AM_I_COUCH_MIN_PLAYERS,
  WHO_AM_I_COUCH_NAME_MAX,
  WHO_AM_I_HELP_POINTS,
  WHO_AM_I_QUESTION_COST,
  couchName,
  roomAnswers,
  startCouchTable,
  whoAmIPoints,
  whoAmITableRules,
  type GameDialect,
  type GameDifficulty,
  type WhoAmICouchDeals,
  type WhoAmICouchOffer,
  type WhoAmIQuestion,
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
import { Cloth, GoldButton } from '../impostor/parts';
import { TABLE } from '../impostor/table';
import { useHardwareBack } from '../navigation/hardwareBack';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useDirection } from '../reports/direction';
import { Note } from '../stories/ui';
import { BURST } from '../theme/celebration';
import { ConfettiBurst, GlowRing, useCelebration } from '../theme/CelebrationParts';
import { ClayButton, GlassCard, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import {
  Fold,
  ForeheadCard,
  Foreheads,
  QuestionCard,
  QuestionDeck,
  ScoringNote,
  SuggestedQuestions,
  VerdictCard,
  YesNoButtons,
  kindOf,
  yesNo,
  type CardFace,
  type TableSeat,
} from './WhoAmIStage';
import { pressedDim } from '../theme/motion';

/**
 * Who Am I? on one phone, passed round a room.
 *
 * The rules are the table's own (shared/src/games/who-am-i/rules.ts), started
 * and answered for a room by couch.ts; this is the phone's part in them. It
 * asks who is playing and how hard, fetches a card for everyone (approved
 * identities, dealt by the server), and walks the room through a game in
 * which nobody has to remember anything. The phone goes from hand to hand.
 * Whoever holds it picks a question, one of the few suggested or any on their
 * list, and reads it out, then turns the phone to their friends. There, and
 * only there, the holder's card is on the screen beside the question: the
 * friends read it and tap yes or no themselves. The card is hidden again, the
 * phone says what the card's own answer is and how the friends did, and the
 * holder goes on or passes the phone on. A holder may also ask the room a
 * question of their own: the friends look at the card and answer out loud,
 * and the phone only counts it.
 *
 * Nothing lists the words a player might be: a list of choices would make
 * the game a quiz. A holder who thinks they know says who they are out loud
 * and turns the phone to their friends once more, and the friends, reading
 * the card, tap whether that is it.
 *
 * What it is careful about, because one screen is read by people who must not
 * see their own card:
 * - a hidden card is drawn in one place, the friends' screen, which its
 *   wearer has turned away from; the answer tapped, leaving the app or the
 *   screen locking takes it off again;
 * - the way to that screen takes no tap in its first moment, so a double tap
 *   on the board cannot run on into it and turn the card up in front of its
 *   wearer;
 * - the holder's own board shows nobody's hidden card, not the others'
 *   either: a neighbour glancing at the phone would read their own;
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

/**
 * What the holder is about to put to their friends: a question from their
 * list, one of their own asked out loud, or who they think they are.
 */
type Put = { kind: 'question'; id: string } | { kind: 'own' } | { kind: 'guess' };

/**
 * What the room is looking at: the phone between two players, the holder's
 * board, something chosen and waiting to be said out loud, the friends'
 * screen with the holder's card on it, or what saying who they are came to.
 * Nothing is told to the rules until the friends have tapped, so the way back
 * from something chosen costs nothing.
 */
type Moment =
  | { at: 'pass' }
  | { at: 'turn' }
  | { at: 'say'; put: Put }
  | { at: 'friends'; put: Put }
  | { at: 'guessed'; seat: number; correct: boolean };

/**
 * How long the way to the friends' screen takes no tap after it appears:
 * longer than the gap inside a double tap. A hurried second tap on the board
 * can land where that button has just appeared, and would turn the card up
 * in front of its own wearer.
 */
const TURN_ROUND_MS = 400;

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

  // The friends' screen is the one place a hidden card is drawn. The moment the app is not the one in front (another
  // app, the lock screen, the app switcher) it goes back to what was waiting to be said out loud, so the card is not
  // on the screen when its wearer picks the phone up again.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') return;
      setGame((g) => (g !== null && g.moment.at === 'friends' ? { ...g, moment: { at: 'say', put: g.moment.put } } : g));
    });
    return () => sub.remove();
  }, []);

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
    // Straight to the first hand-over: nobody is shown a card to remember, a card is read at the moment it is answered
    // about. The seed is the phone's own, from the generator a new device id comes from.
    setGame({ players, difficulty: level, table: startCouchTable(res.data, Date.now(), newDeviceId()), moment: { at: 'pass' } });
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
      {/* keyed by what the room is looking at, so each screen of the game opens at its top however far the last one was scrolled */}
      <ScrollView
        key={over ? 'end' : game.moment.at}
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
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

/** The whole game in three steps, said before anyone has typed a name. */
const HOW: readonly TranslationKey[] = ['games.whoAmI.couch.step1', 'games.whoAmI.couch.step2', 'games.whoAmI.couch.step3'];

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
        {/* the numbers on this screen are the game's three steps: the form under them is short enough to need none */}
        <Cloth style={styles.how}>
          {HOW.map((key, i) => (
            <View key={key} accessible accessibilityLabel={`${i + 1}. ${t(key)}`} style={[styles.howRow, { flexDirection: dir.row }]}>
              <View style={styles.howN}>
                <Text style={styles.howNText}>{i + 1}</Text>
              </View>
              <Text style={[styles.howText, dir.text]}>{t(key)}</Text>
            </View>
          ))}
        </Cloth>

        <Card style={styles.form}>
          <Text accessibilityRole="header" style={[styles.formTitle, dir.text, { color: colors.textPrimary }]}>
            {t('games.couch.players')}
          </Text>
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
                    style={({ pressed }) => [styles.nameRemove, { opacity: pressed ? pressedDim : 1 }]}
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
            <Text accessibilityRole="header" style={[styles.formTitle, dir.text, { color: colors.textPrimary }]}>
              {t('games.solo.difficulty')}
            </Text>
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

type Play = (table: WhoAmITableState, moment: Moment) => void;

function Round({ game, play }: { game: Game; play: Play }): React.JSX.Element | null {
  const { table, moment, players } = game;
  if (moment.at === 'guessed') return <Guessed game={game} seat={moment.seat} correct={moment.correct} onNext={() => play(table, { at: 'pass' })} />;
  const seat = table.turn;
  if (seat === null) return null;
  const name = players[seat]!;
  if (moment.at === 'pass') return <PassTo name={name} onMine={() => play(table, { at: 'turn' })} />;
  if (moment.at === 'say' || moment.at === 'friends') {
    const { put } = moment;
    // the holder's own list, from the board as their seat is sent it
    const view = whoAmITableRules.viewFor(table, seat);
    const question = put.kind === 'question' ? (view.mine?.questions.find((q) => q.id === put.id) ?? null) : null;
    // A question is put to the room only while the turn waits for one, and one from the list only while it is on the
    // list. Who they are a holder may say before asking or once an answer is in.
    const open = put.kind === 'guess' ? view.phase !== 'answer' : view.phase === 'ask' && (put.kind === 'own' || question !== null);
    if (open && moment.at === 'say') {
      return (
        <SayIt
          dialect={view.dialect}
          put={put}
          question={question}
          onFriends={() => play(table, { at: 'friends', put })}
          onBack={() => play(table, { at: 'turn' })}
        />
      );
    }
    if (open) return <Friends game={game} seat={seat} put={put} question={question} play={play} />;
  }
  return <Turn key={`${seat}:${table.turns}`} game={game} seat={seat} play={play} />;
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
 * One player's turn, with the phone in their hands. While the turn waits for
 * a question: the way to say who they are, for whoever already knows; the
 * questions worth asking next, each asked by one tap; every question folded
 * under them; a question of their own; and the turn skipped. Once the friends
 * have answered: what the card said and how the friends did, the way to say
 * who they are as the one thing to press, and the phone on to the next
 * player. Nothing lists who they might be, their own card is on neither
 * board, and nobody else's hidden card is, so the phone can be handed back
 * with nothing to cover.
 */
function Turn({ game, seat, play }: { game: Game; seat: number; play: Play }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const { table, players } = game;
  // the board as the seat holding the phone is sent it: their own card is not on it
  const view = whoAmITableRules.viewFor(table, seat);
  const mine = view.mine;
  if (!mine) return null;
  const name = players[seat]!;
  const dialect = view.dialect;
  // a beginner reads what every question means without asking for it
  const beginner = view.difficulty === 'beginner';
  const seats = <Foreheads dialect={dialect} seats={roomSeats(game)} label={t('games.whoAmI.table')} />;

  const pass = (): void => {
    const applied = whoAmITableRules.apply(table, seat, { kind: 'pass' }, Date.now());
    // the rules refuse no pass in one room; a refusal leaves the turn as it is
    if (applied.ok) play(applied.state, { at: 'pass' });
  };
  // something chosen is only a screen to say it from: the rules hear of it when the friends tap
  const choose = (put: Put): void => play(table, { at: 'say', put });
  const ask = (id: string): void => choose({ kind: 'question', id });

  // a question of their own costs what any question costs, so it is counted with the rest
  const missed = mine.guesses.filter((g) => !g.correct).length;
  const points = whoAmIPoints(mine.asked.length + mine.aloud, missed, true);
  const worth = `${t('games.whoAmI.worth', { count: points })} · ${t('games.whoAmI.guessesLeft', { count: mine.guessesLeft })}`;
  const own =
    mine.aloud > 0 ? (
      <Text style={[styles.note, styles.center, { color: colors.textSecondary }]}>
        {t('games.whoAmI.own.count', { count: mine.aloud, cost: WHO_AM_I_QUESTION_COST })}
      </Text>
    ) : null;
  // What they know so far, always in sight. The same answers are stamped on the full list, but that list is folded
  // away while there are suggestions to tap, and who they are is worked out from exactly these.
  const answered = mine.asked.map((a) => mine.questions.find((q) => q.id === a.question)).filter((q): q is WhoAmIQuestion => !!q);
  const known =
    answered.length > 0 ? (
      <QuestionDeck dialect={dialect} title={t('games.whoAmI.known')} questions={answered} asked={mine.asked} meanings={beginner} onAsk={null} />
    ) : null;

  if (view.phase === 'decide') {
    // the card's own answer to the question just asked from the list; a question asked out loud leaves none
    const told = view.told && view.told.seat === seat ? view.told : null;
    // the friends tapped one answer between them, so the first given is what they all said
    const said = told?.answers.find((a) => a.yes !== null)?.yes ?? null;
    return (
      <>
        {told ? (
          <VerdictCard
            dialect={dialect}
            heading={t('games.whoAmI.asks', { name })}
            question={told.question}
            truth={told.truth}
            plain
            note={
              said === null
                ? undefined
                : said === told.truth
                  ? t('games.whoAmI.friends.right', { count: WHO_AM_I_HELP_POINTS })
                  : t('games.whoAmI.friends.wrong', { said: yesNo(dialect, said, t), truth: yesNo(dialect, told.truth, t) })
            }
          />
        ) : (
          <Cloth style={styles.stage}>
            <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.stageSay}>
              {t('games.whoAmI.own.answered')}
            </Text>
          </Cloth>
        )}
        <Text style={[styles.stat, { color: colors.textSecondary }]}>{worth}</Text>
        {own}
        {/* with an answer in hand this is the one thing to press: gold, and the phone passed on is the quiet way beside it */}
        <GoldButton label={t('games.whoAmI.iKnow')} onPress={() => choose({ kind: 'guess' })} />
        <ClayButton label={t('games.whoAmI.nextPlayer')} variant="outline" onPress={pass} />
        {known}
        {seats}
      </>
    );
  }

  const kind = kindOf(mine.category, t);
  const suggested = mine.suggested.map((id) => mine.questions.find((q) => q.id === id)).filter((q): q is WhoAmIQuestion => !!q);
  // nothing on the list is left to ask: a turn is still never forced, since a question of their own can always be asked
  const listDone = mine.asked.length >= mine.questions.length;
  // one line of advice where the banner has room for it, once the suggestions have run out
  const advice = suggested.length > 0 ? null : t(listDone ? 'games.whoAmI.allAsked' : 'games.whoAmI.noSuggestions');
  return (
    <>
      <Cloth style={styles.banner}>
        <View style={[styles.bannerRow, { flexDirection: dir.row }]}>
          {/* the deer is decoration here, drawn small so the questions are on the first screen */}
          <ForeheadCard dialect={dialect} category={null} identity={null} size={76} cut="small" night />
          <View style={styles.bannerText}>
            {kind ? <Text style={[styles.bannerKind, dir.text]}>{kind}</Text> : null}
            <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={[styles.bannerTitle, dir.text]}>
              {t('games.whoAmI.board.title', { name })}
            </Text>
            <Text style={[styles.bannerStat, dir.text]}>{worth}</Text>
          </View>
        </View>
        {advice ? <Text style={styles.bannerAdvice}>{advice}</Text> : null}
      </Cloth>
      {/* for whoever knows already: easy to find, and not gold, since asking a question is still the first thing to do */}
      <ClayButton label={t('games.whoAmI.iKnow')} tone="primary" size="large" onPress={() => choose({ kind: 'guess' })} />
      <View style={styles.asking}>
        <Text accessibilityRole="header" style={[styles.formTitle, dir.text, { color: colors.textPrimary }]}>
          {t('games.whoAmI.questions')}
        </Text>
        {suggested.length > 0 ? <SuggestedQuestions dialect={dialect} questions={suggested} onAsk={ask} /> : null}
        {/* With nothing suggested the full list is the next thing to reach for, so it is open already. With all of it
            asked it would only repeat the answers listed below, so it is left out. */}
        {listDone ? null : (
          <Fold bare title={t('games.whoAmI.allQuestions', { count: mine.questions.length })} startOpen={suggested.length === 0}>
            <QuestionDeck dialect={dialect} questions={mine.questions} asked={mine.asked} meanings={beginner} onAsk={ask} />
          </Fold>
        )}
        {view.open ? (
          <ClayButton label={t('games.whoAmI.own.ask')} icon="chat" tone="primary" variant="outline" onPress={() => choose({ kind: 'own' })} />
        ) : null}
      </View>
      {own}
      <ClayButton label={t('games.whoAmI.skip')} variant="outline" onPress={pass} />
      {known}
      {seats}
    </>
  );
}

/**
 * Something chosen and not yet told to the rules: the holder says it out
 * loud, then turns the phone to their friends. A question from the list is
 * here to read out, large, with what it means; a question of their own, and
 * who they think they are, have no words here, only what to do. Nothing has
 * been spent, so there is a way back.
 */
function SayIt({
  dialect,
  put,
  question,
  onFriends,
  onBack,
}: {
  dialect: GameDialect;
  put: Put;
  /** the question from the list, when that is what was chosen */
  question: WhoAmIQuestion | null;
  onFriends: () => void;
  onBack: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  // when this screen appeared: the way on to the friends is not taken at once (TURN_ROUND_MS)
  const [since] = useState(() => Date.now());
  return (
    <>
      <Cloth style={styles.stage}>
        {question ? (
          <>
            <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.stageKicker}>
              {t('games.whoAmI.readOut')}
            </Text>
            <QuestionCard key={question.id} dialect={dialect} question={question} ink={TABLE.ink} soft={TABLE.inkSoft} size="loud" plain />
            <Text style={styles.stageLine}>{t('games.whoAmI.turnPhone')}</Text>
          </>
        ) : (
          <>
            <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.stageSay}>
              {t(put.kind === 'guess' ? 'games.whoAmI.say.title' : 'games.whoAmI.own.title')}
            </Text>
            <Text style={styles.stageLine}>{t(put.kind === 'guess' ? 'games.whoAmI.turnPhone' : 'games.whoAmI.own.turn')}</Text>
          </>
        )}
      </Cloth>
      <GoldButton
        label={t('games.whoAmI.friendsTap')}
        icon="people"
        onPress={() => {
          if (Date.now() - since >= TURN_ROUND_MS) onFriends();
        }}
      />
      <ClayButton label={t(put.kind === 'guess' ? 'games.whoAmI.say.back' : 'games.whoAmI.backToBoard')} variant="outline" onPress={onBack} />
    </>
  );
}

/**
 * The friends' screen, the holder looking away: the holder's card on the
 * deer's forehead, read by everyone but them, and what to answer. A question
 * from the list the friends answer by tapping yes or no, which asks it of the
 * rules and answers it for the whole room in one step. A question of the
 * holder's own they answer out loud, and one tap counts it. Who the holder
 * said they are the friends judge against the card, and their tap is the
 * guess. Every one of these taps takes the card off the screen at once.
 */
function Friends({ game, seat, put, question, play }: { game: Game; seat: number; put: Put; question: WhoAmIQuestion | null; play: Play }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { table, players } = game;
  const name = players[seat]!;
  const dialect = table.dialect;
  // the card on a forehead, read from the seat beside it: anyone but its wearer may
  const card: CardFace | null = whoAmITableRules.viewFor(table, (seat + 1) % players.length).seats.find((s) => s.seat === seat)?.card ?? null;

  const answer = (yes: boolean): void => {
    const now = Date.now();
    const asked = question ? whoAmITableRules.apply(table, seat, { kind: 'ask', question: question.id }, now) : null;
    // a question the rules will not take was never put to the room: back to the board, with nothing spent
    if (!asked?.ok) return play(table, { at: 'turn' });
    const next = roomAnswers(asked.state, yes, now);
    // felt in the hands that tapped it: whether the card agrees with them
    haptic(next.told?.truth === yes ? 'correct' : 'wrong');
    play(next, { at: 'turn' });
  };
  const heard = (): void => {
    // the friends' answer was theirs to give and nobody's to check: the rules only count the question
    const counted = whoAmITableRules.apply(table, seat, { kind: 'aloud' }, Date.now());
    play(counted.ok ? counted.state : table, { at: 'turn' });
  };
  const judge = (right: boolean): void => {
    // the room reads the card, so the room is the judge: its tap is the guess, right or wrong
    const judged = whoAmITableRules.apply(table, seat, { kind: 'said', right }, Date.now());
    if (!judged.ok) return play(table, { at: 'turn' });
    // a right one is felt as its celebration lands (Solved); a miss here and now
    if (!right) haptic('wrong');
    play(judged.state, { at: 'guessed', seat, correct: right });
  };

  return (
    <>
      <Cloth style={styles.stage}>
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.stageTitle}>
          {t('games.whoAmI.friends.title', { name })}
        </Text>
        <ForeheadCard dialect={dialect} category={null} identity={card} size={200} cut="large" night hiddenLabel={t('games.couch.cardOf', { name })} />
        {question ? (
          <QuestionCard key={question.id} dialect={dialect} question={question} ink={TABLE.ink} soft={TABLE.inkSoft} size="large" plain />
        ) : (
          <Text style={styles.stageSay}>
            {put.kind === 'guess'
              ? t('games.whoAmI.judge.ask', { name })
              : t('games.whoAmI.friends.aloud', { name, yes: yesNo(dialect, true, t), no: yesNo(dialect, false, t) })}
          </Text>
        )}
      </Cloth>
      {put.kind === 'guess' ? (
        <YesNoButtons dialect={dialect} labels={{ yes: t('games.whoAmI.judge.yes'), no: t('games.whoAmI.notYet') }} onAnswer={judge} />
      ) : question ? (
        <>
          <Text style={[styles.heading, { color: colors.textPrimary }]}>{t('games.whoAmI.friends.ask')}</Text>
          <YesNoButtons dialect={dialect} onAnswer={answer} />
        </>
      ) : (
        <GoldButton label={t('games.whoAmI.friends.done')} icon="eye-off" onPress={heard} />
      )}
    </>
  );
}

/**
 * What saying who they are came to. Right: the card comes off, and the
 * celebration plays. Not yet: no word to name, only how many more times they
 * may say it. The last miss: the card comes off all the same, and says who
 * they were.
 */
function Guessed({ game, seat, correct, onNext }: { game: Game; seat: number; correct: boolean; onNext: () => void }): React.JSX.Element | null {
  const { t } = useI18n();
  const view = whoAmITableRules.viewFor(game.table, seat);
  const mine = view.mine;
  if (!mine) return null;
  // the player's own card, only where the rules have taken it off: said rightly, or out of guesses
  const identity = mine.identity;
  if (correct && identity) return <Solved dialect={view.dialect} category={mine.category} identity={identity} points={mine.points} onNext={onNext} />;
  return (
    <>
      <Cloth style={styles.stage}>
        <ForeheadCard dialect={view.dialect} category={mine.category} identity={identity} size={180} night />
        {identity ? (
          <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.stageSay}>
            {t('games.whoAmI.youWere', { word: identity.word })}
          </Text>
        ) : (
          <>
            <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.stageTitle}>
              {t('games.whoAmI.said.wrong')}
            </Text>
            <Text style={styles.stageLine}>{t('games.whoAmI.guessesLeft', { count: mine.guessesLeft })}</Text>
          </>
        )}
      </Cloth>
      <GoldButton label={t('games.couch.next')} onPress={onNext} />
    </>
  );
}

const SOLVED = 200;

/**
 * A card found: the happiest moment of the game, played as the app's one
 * celebration is (theme/CelebrationParts.tsx). The card turns face up on the
 * forehead as a ring of gold widens behind it and the flecks fly, the phone
 * buzzes and chimes as it lands, and then the words come. With Reduce Motion
 * nothing travels: the card and the words are simply there.
 */
function Solved({
  dialect,
  category,
  identity,
  points,
  onNext,
}: {
  dialect: GameDialect;
  category: string | null;
  identity: CardFace;
  points: number;
  onNext: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const moment = useCelebration();
  const rise = moment.plan.travel ? moment.details.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) : 0;
  return (
    <>
      <Cloth style={styles.stage}>
        <View style={styles.solved}>
          {moment.plan.travel ? <GlowRing progress={moment.ring} colour={TABLE.gold} size={SOLVED * 0.8} /> : null}
          {moment.plan.travel ? (
            <ConfettiBurst
              progress={moment.burst}
              count={BURST.badge}
              seed={points * 13 + identity.word.length}
              colours={[TABLE.gold, TABLE.goldSoft, TABLE.ink]}
              reach={150}
              testID="who-am-i-found-burst"
            />
          ) : null}
          <ForeheadCard dialect={dialect} category={category} identity={identity} size={SOLVED} cut="large" night />
        </View>
        <Animated.View style={[styles.solvedWords, { opacity: moment.details, transform: [{ translateY: rise }] }]}>
          <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.stageTitle}>
            {t('games.whoAmI.youAre', { word: identity.word })}
          </Text>
          <Text style={styles.solvedPoints}>{t('games.whoAmI.score', { count: points })}</Text>
        </Animated.View>
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
  // the three steps, on the table's own cloth: small numbers in gold, a line each
  how: { gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  howRow: { alignItems: 'center', gap: spacing.sm },
  howN: { width: 24, height: 24, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: TABLE.gold },
  howNText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, color: TABLE.goldInk },
  howText: { flex: 1, fontSize: typography.sizes.sm, lineHeight: 20, color: TABLE.ink },
  formTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  // the banner of a turn is kept low, the deer beside its words, so the tiles and the questions start on the first screen
  banner: { gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  bannerRow: { alignItems: 'center', gap: spacing.md },
  bannerText: { flex: 1, gap: 2 },
  bannerKind: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 1, textTransform: 'uppercase', color: TABLE.goldSoft },
  bannerTitle: { fontSize: typography.sizes.lg, lineHeight: 28, fontWeight: typography.weights.bold, color: TABLE.ink },
  bannerStat: { fontSize: typography.sizes.sm, lineHeight: 20, fontWeight: typography.weights.semibold, color: TABLE.goldSoft },
  bannerAdvice: { fontSize: typography.sizes.sm, lineHeight: 20, textAlign: 'center', color: TABLE.ink },
  asking: { gap: spacing.sm },
  stat: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, textAlign: 'center' },
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
  // a whole sentence said on the cloth: smaller than a title, so it still fits a phone held out to a room
  stageSay: { fontSize: typography.sizes.lg, lineHeight: 30, fontWeight: typography.weights.bold, textAlign: 'center', color: TABLE.ink },
  stageLine: { fontSize: typography.sizes.md, lineHeight: 22, textAlign: 'center', color: TABLE.inkSoft },
  solved: { alignItems: 'center', justifyContent: 'center' },
  solvedWords: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.xs },
  solvedPoints: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, textAlign: 'center', color: TABLE.goldSoft },
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
