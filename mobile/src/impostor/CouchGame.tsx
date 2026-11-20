import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import {
  COUCH_CLUE_SECONDS,
  COUCH_DECK_EXCLUDE_MAX,
  COUCH_DEFAULTS,
  COUCH_MAX_PLAYERS,
  COUCH_MIN_PLAYERS,
  COUCH_NAME_MAX,
  COUCH_ROUNDS,
  COUCH_SECOND_VOTE_SECONDS,
  COUCH_TALK_SECONDS,
  COUCH_TWO_IMPOSTORS_FROM,
  COUCH_VOTES,
  COUCH_WAYS,
  readEveryDialect,
  IMPOSTOR_POINTS,
  couchCastVote,
  couchGuess,
  couchHand,
  couchKept,
  couchNames,
  couchNextClue,
  couchPoint,
  couchReader,
  couchReveal,
  couchScores,
  couchSecondTimeUp,
  couchSeen,
  couchSpeaker,
  couchStart,
  couchSuspects,
  couchToVote,
  couchTotals,
  couchVoter,
  impostorCategoriesInOrder,
  impostorCategoryTone,
  impostorWayTone,
  meaningIn,
  type CouchCard,
  type CouchDeck,
  type CouchKept,
  type CouchOffer,
  type CouchSettings,
  type CouchState,
  type GameDialect,
  type GameDifficulty,
} from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useAuth } from '../auth/AuthContext';
import type { ApiError } from '../api/types';
import { newDeviceId } from '../auth/deviceId';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useCourseDialect } from '../learn/courseDialect';
import { PartyTimer } from '../party/Composer';
import { PARTY_LEVEL_KEY } from '../party/PartyStart';
import { useDirection } from '../reports/direction';
import { ChoiceChips, Note, SectionLabel } from '../stories/ui';
import { ClayButton, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { Loading } from '../theme/Loading';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { CategoryArt, EmblemArt, WayArt } from './art';
import { kurdishStyle } from './ImpostorBoard';
import type { CouchAsk } from './ImpostorStart';
import { Card, Cloth, GoldButton, PictureCards, PictureTiles, StepTitle, listed } from './parts';
import { TABLE } from './table';
import { WAY_KEY, WAY_NOTE } from './ways';
import { pressedDim } from '../theme/motion';
import { heldDim } from '../theme/MotionParts';
import { turnCard } from '../theme/animate';
import { dialectNameKey } from '../i18n/dialectName';

/**
 * Impostor on one phone, passed round a room: the phone's part in the shared rules
 * (shared/src/games/impostor/couch.ts), as the website's web/src/impostor/Couch.tsx is, played at the game's own table
 * (table.ts). Because one screen is shared by people who must not see each other's cards, a card shows only while its
 * holder presses it, a blank screen with the next name stands between players, cards are never stored, names stay on
 * this phone, and every draw uses the phone's random generator. A round earns nothing, since the phone holds every
 * card.
 *
 * An easily mistaken tap (going to the vote, each vote) can be taken back for UNDO_MS, and a tap that would reveal
 * something waits out that moment first, so an undo never shows what it took back. With two impostors, catching one
 * leads to a short second vote. A card with no second word plays one round the plain way; fresh batches skip tonight's
 * words.
 */

const KEPT = 'hevalo_couch_v1';
const VOTE_KEY: Record<CouchSettings['vote'], TranslationKey> = { secret: 'games.couch.vote.secret', open: 'games.couch.vote.open' };
const ANY = '';
/** How long a tap can be taken back: long enough to see the slip, short enough not to hold the room up. */
const UNDO_MS = 3000;

/** What this phone remembers from the last evening: the names and how the game was set; anything else is ignored. */
async function readKept(): Promise<CouchKept | null> {
  try {
    const raw = Platform.OS === 'web' ? (globalThis.localStorage?.getItem(KEPT) ?? null) : await SecureStore.getItemAsync(KEPT);
    return raw ? couchKept(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

async function writeKept(kept: CouchKept): Promise<void> {
  try {
    const value = JSON.stringify(kept);
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEPT, value);
    else await SecureStore.setItemAsync(KEPT, value);
  } catch {
    // A phone that will not keep them only asks for the names again next time.
  }
}

/** A seed for one round's draws, from the phone's own random generator (the one a new device id comes from). */
const freshSeed = (): string => newDeviceId();

/** Whether a screen reader is on: its user cannot press and hold, so the card turns on a tap instead. */
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

interface Evening {
  dialect: GameDialect;
  difficulty: GameDifficulty;
  category: string | null;
  /**
   * How the room set the game. Every round is dealt from this rather than the round before, so after a card with no
   * second word the next is played the way the room chose.
   */
  wanted: CouchSettings;
  deck: CouchCard[];
  /** The card being played, by its place in the deck. */
  at: number;
  /** How many rounds have been started this evening. */
  played: number;
  game: CouchState;
  /** The points before this round, by seat. */
  totals: number[];
}

/** A tap the room may take back for a moment: the round before it and after it. */
interface Take {
  before: CouchState;
  after: CouchState;
  /** The tap shows something new, so it waits out the moment before it is played. */
  held: boolean;
  /** What was chosen, said while a held tap waits. */
  said: string;
  /** When it was made, so a second tap starts its own moment. */
  at: number;
}

/** Whether a step shows the room something an undo could not take back: a vote counted, someone caught, the cards turned over. */
function showsOutcome(before: CouchState, after: CouchState): boolean {
  return after.phase !== before.phase && after.phase !== 'vote';
}

export function CouchGame({ onLeave, ask }: { onLeave: () => void; ask?: CouchAsk }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { client } = useAuth();
  const [offers, setOffers] = useState<CouchOffer[] | null>(null);
  const [evening, setEvening] = useState<Evening | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [take, setTake] = useState<Take | null>(null);
  // A vote taken back reopens on the voter's own screen, not on the one that asks for the phone.
  const [resumed, setResumed] = useState(false);
  // The words played on this screen tonight, however often the game was changed: the next batch is dealt without them.
  const tonight = useRef<string[]>([]);

  // The moment to take a tap back: once it is over, a held tap is played and any other simply stands.
  useEffect(() => {
    if (!take) return;
    const timer = setTimeout(() => {
      setTake(null);
      if (take.held) setEvening((e) => (e && e.game === take.before ? { ...e, game: take.after } : e));
    }, UNDO_MS);
    return () => clearTimeout(timer);
  }, [take]);

  useEffect(() => {
    let alive = true;
    // both varieties in one read
    void readEveryDialect<CouchOffer, ApiError>(client, '/games/impostor/couch').then((res) => {
      if (alive) setOffers(res.ok ? res.data.filter((o) => Array.isArray(o?.difficulties) && o.difficulties.length > 0) : []);
    });
    return () => {
      alive = false;
    };
  }, [client]);

  /** An evening's cards, fetched without the words played tonight; null when they could not be. */
  const fetchDeck = useCallback(
    async (dialect: GameDialect, difficulty: GameDifficulty, category: string | null): Promise<CouchCard[] | null> => {
      setBusy(true);
      setFailed(false);
      const exclude = tonight.current.slice(-COUCH_DECK_EXCLUDE_MAX);
      const res = await client.post<CouchDeck>('/games/impostor/couch/deck', { dialect, difficulty, category, ...(exclude.length > 0 ? { exclude } : {}) });
      setBusy(false);
      if (res.ok && Array.isArray(res.data?.cards) && res.data.cards.length > 0) return res.data.cards;
      setFailed(true);
      return null;
    },
    [client],
  );

  /** A round dealt from a card, the way the room set the game; its word is played tonight from now on. */
  function deal(dialect: GameDialect, names: readonly string[], wanted: CouchSettings, card: CouchCard): CouchState {
    tonight.current = [...tonight.current.filter((w) => w !== card.word), card.word].slice(-COUCH_DECK_EXCLUDE_MAX);
    return couchStart(dialect, names, wanted, card, freshSeed());
  }

  async function begin(names: string[], settings: CouchSettings, dialect: GameDialect, difficulty: GameDifficulty, category: string | null): Promise<void> {
    const deck = await fetchDeck(dialect, difficulty, category);
    if (!deck) return;
    void writeKept({ names, settings });
    haptic('tap');
    setTake(null);
    setEvening({ dialect, difficulty, category, wanted: settings, deck, at: 0, played: 1, game: deal(dialect, names, settings, deck[0]!), totals: names.map(() => 0) });
  }

  /** The round is over and the room wants another: the next card, or a fresh batch once these are played. */
  async function another(): Promise<void> {
    if (!evening) return;
    const totals = couchTotals(evening.totals, evening.game);
    let { deck, at } = evening;
    at += 1;
    if (at >= deck.length) {
      const more = await fetchDeck(evening.dialect, evening.difficulty, evening.category);
      if (!more) return;
      deck = more;
      at = 0;
    }
    setTake(null);
    setEvening({ ...evening, deck, at, played: evening.played + 1, totals, game: deal(evening.dialect, evening.game.players, evening.wanted, deck[at]!) });
  }

  if (offers === null) return <Loading size="large" style={styles.loading} />;
  if (offers.length === 0) {
    return (
      <View style={styles.content}>
        <Card style={styles.centered}>
          <Icon name="people" size={40} tone="primary" />
          <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t('games.impostor.notOffered')}</Text>
        </Card>
      </View>
    );
  }
  if (!evening) return <Setup offers={offers} busy={busy} failed={failed} ask={ask} onStart={(...args) => void begin(...args)} />;
  /** A step of the round; with `undo`, one the room may take back for a moment (UNDO_MS), saying what was chosen. */
  const play = (game: CouchState, undo?: { said: string }): void => {
    setResumed(false);
    if (!undo || game === evening.game) {
      setTake(null);
      setEvening({ ...evening, game });
      return;
    }
    const held = showsOutcome(evening.game, game);
    setTake({ before: evening.game, after: game, held, said: undo.said, at: Date.now() });
    if (!held) setEvening({ ...evening, game });
  };
  const undo = (): void => {
    if (!take) return;
    haptic('tap');
    setTake(null);
    setResumed(true);
    setEvening({ ...evening, game: take.before });
  };
  // The second vote's clock ran out: a vote already chosen and waiting out its moment still counts.
  const secondTimeUp = (): void => {
    const base = take?.held ? take.after : evening.game;
    setTake(null);
    setEvening({ ...evening, game: couchSecondTimeUp(base) });
  };
  const game = evening.game;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={[styles.countPill, { backgroundColor: colors.controlTrack }]}>
        <Text style={[styles.count, { color: colors.textSecondary }]}>{t('games.couch.game', { n: evening.played })}</Text>
      </View>
      {/* Said before any card is read: the room asked for an odd word, and this card has none. */}
      {game.oddFallback && game.phase === 'deal' ? (
        <View accessibilityLiveRegion="polite">
          <Note icon="lightbulb">{t('games.couch.oddFallback')}</Note>
        </View>
      ) : null}
      <Round
        game={game}
        totals={evening.totals}
        busy={busy}
        failed={failed}
        held={take?.held ? take : null}
        resumed={resumed}
        play={play}
        onUndo={undo}
        onSecondTimeUp={secondTimeUp}
        onAnother={() => void another()}
        onChange={() => {
          setTake(null);
          setEvening(null);
        }}
        onLeave={onLeave}
      />
      {take && !take.held ? <UndoBar key={take.at} onUndo={undo} /> : null}
    </ScrollView>
  );
}

// Who is playing, and how.

function Setup({
  offers,
  busy,
  failed,
  ask,
  onStart,
}: {
  offers: readonly CouchOffer[];
  busy: boolean;
  failed: boolean;
  /** A way to play or category chosen on the start; it wins over what this phone remembers. */
  ask?: CouchAsk;
  onStart: (names: string[], settings: CouchSettings, dialect: GameDialect, difficulty: GameDifficulty, category: string | null) => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const insets = useSafeAreaInsets();
  const [names, setNames] = useState<string[]>(() => Array.from({ length: COUCH_MIN_PLAYERS + 1 }, () => ''));
  const [settings, setSettings] = useState<CouchSettings>(() => ({ ...COUCH_DEFAULTS, ...(ask?.way ? { way: ask.way } : {}) }));
  // The learner's own Kurdish first, where the game is offered in it, until the room chooses another.
  const preferred = useCourseDialect();
  const [chosenDialect, setDialect] = useState<GameDialect | null>(null);
  const dialect = chosenDialect ?? (offers.some((o) => o.dialect === preferred) ? preferred : offers[0]!.dialect);
  const [difficulty, setDifficulty] = useState<GameDifficulty | null>(null);
  const [category, setCategory] = useState(ask?.category ?? ANY);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [slip, setSlip] = useState<TranslationKey | null>(null);
  // What the phone kept arrives a moment after the screen: it fills the form only if nobody has started typing.
  const touched = useRef(false);
  useEffect(() => {
    let alive = true;
    void readKept().then((kept) => {
      if (!alive || !kept || touched.current) return;
      if (kept.names.length >= COUCH_MIN_PLAYERS) setNames(kept.names);
      setSettings({ ...kept.settings, ...(ask?.way ? { way: ask.way } : {}) });
    });
    return () => {
      alive = false;
    };
    // What was asked for on the way in is read once, as the phone's memory is.
  }, []);

  const offer = offers.find((o) => o.dialect === dialect) ?? offers[0]!;
  const level = offer.difficulties.find((d) => d.difficulty === difficulty) ?? offer.difficulties[0]!;
  const chosenCategory = level.categories.some((c) => c.slug === category) ? category : ANY;
  const set = <K extends keyof CouchSettings>(key: K, value: CouchSettings[K]): void => {
    touched.current = true;
    setSettings((s) => ({ ...s, [key]: value }));
  };
  const rename = (next: string[]): void => {
    touched.current = true;
    setNames(next);
  };
  const canRemove = names.length > COUCH_MIN_PLAYERS;
  const canAdd = names.length < COUCH_MAX_PLAYERS;
  const roomForTwo = names.length >= COUCH_TWO_IMPOSTORS_FROM;
  // An empty box takes the name on its placeholder: "Player 3".
  const named = names.map((n, i) => (n.trim() === '' ? t('games.couch.playerName', { n: i + 1 }) : n));
  const script = kurdishStyle(offer.dialect);
  const clueNow = settings.clueSeconds === 0 ? t('games.couch.noClock') : t('games.party.seconds', { count: settings.clueSeconds });
  const talkNow = settings.talkSeconds === 0 ? t('games.couch.noClock') : t('games.couch.minutes', { count: settings.talkSeconds / 60 });

  function start(): void {
    const checked = couchNames(named);
    if (!checked.ok) return setSlip(checked.reason === 'same' ? 'games.couch.names.same' : 'games.couch.names.empty');
    setSlip(null);
    const impostors = checked.names.length >= COUCH_TWO_IMPOSTORS_FROM ? settings.impostors : 1;
    onStart(checked.names, { ...settings, impostors }, offer.dialect, level.difficulty, chosenCategory || null);
  }

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t('games.couch.blurb')}</Text>

        <Card style={styles.form}>
          <StepTitle n={1}>{t('games.couch.players')}</StepTitle>
          <View style={styles.names}>
            {names.map((name, i) => (
              <View key={i} style={[styles.nameRow, { flexDirection: dir.row }]}>
                {/* The player's initial on a quiet disc, for contrast off the table. */}
                <View style={[styles.nameN, { backgroundColor: colors.controlTrack }]}>
                  <Text style={[styles.nameNText, { color: colors.textPrimary }]}>{name.trim() === '' ? i + 1 : name.trim().slice(0, 1).toUpperCase()}</Text>
                </View>
                <TextInput
                  value={name}
                  onChangeText={(v) => rename(names.map((n, j) => (j === i ? v : n)))}
                  maxLength={COUCH_NAME_MAX}
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
                    onPress={() => rename(names.filter((_, j) => j !== i))}
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
          {canAdd ? <ClayButton label={t('games.couch.addPlayer')} icon="plus" variant="outline" onPress={() => rename([...names, ''])} /> : null}
          {slip ? (
            <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={[styles.note, { color: colors.danger }]}>
              {t(slip)}
            </Text>
          ) : null}
        </Card>

        <Card style={styles.form}>
          <StepTitle n={2}>{t('games.couch.way')}</StepTitle>
          <PictureCards<CouchSettings['way']>
            label={t('games.couch.way')}
            value={settings.way}
            onChange={(v) => set('way', v)}
            options={COUCH_WAYS.map((w) => ({ value: w, label: t(WAY_KEY[w]), hint: t(WAY_NOTE[w]), art: <WayArt way={w} size={56} />, tone: impostorWayTone(w) }))}
          />
          {roomForTwo ? (
            <View style={styles.field}>
              <SectionLabel>{t('games.couch.impostors')}</SectionLabel>
              <Segmented<string>
                groupLabel={t('games.couch.impostors')}
                options={['1', '2']}
                value={String(settings.impostors)}
                onChange={(v) => set('impostors', v === '2' ? 2 : 1)}
                labelOf={(n) => n}
              />
            </View>
          ) : null}
        </Card>

        <Card style={styles.form}>
          <StepTitle n={3}>{t('games.impostor.category')}</StepTitle>
          {offers.length > 1 ? (
            <View style={styles.field}>
              <SectionLabel>{t('stories.variety')}</SectionLabel>
              <Segmented<GameDialect>
                groupLabel={t('stories.variety')}
                options={offers.map((o) => o.dialect)}
                value={offer.dialect}
                onChange={setDialect}
                labelOf={(d) => t(dialectNameKey(d))}
              />
            </View>
          ) : null}
          {offer.difficulties.length > 1 ? (
            <View style={styles.field}>
              <SectionLabel>{t('games.party.level')}</SectionLabel>
              <Segmented<GameDifficulty>
                groupLabel={t('games.party.level')}
                options={offer.difficulties.map((d) => d.difficulty)}
                value={level.difficulty}
                onChange={setDifficulty}
                labelOf={(d) => t(PARTY_LEVEL_KEY[d])}
              />
            </View>
          ) : null}
          {level.categories.length > 0 ? (
            <View style={{ direction: script.writingDirection }}>
              <PictureTiles<string>
                label={t('games.impostor.category')}
                value={chosenCategory}
                onChange={setCategory}
                first={12}
                moreLabel={(count) => t('common.showMoreCount', { count })}
                options={[
                  { value: ANY, label: t('games.couch.anyCategory'), art: <CategoryArt category={null} size={48} />, tone: impostorCategoryTone(null) },
                  ...impostorCategoriesInOrder(level.categories).map((c) => ({
                    value: c.slug,
                    label: c.ku,
                    hint: meaningIn(c.meanings, locale) ?? undefined,
                    art: <CategoryArt category={c.slug} size={48} />,
                    tone: impostorCategoryTone(c.slug),
                  })),
                ]}
              />
            </View>
          ) : null}
        </Card>

        {/* The rules have sensible answers already, so they wait folded, saying what they are set to. */}
        <Card style={styles.form}>
          <Pressable
            onPress={() => setRulesOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel={t('games.couch.rules')}
            accessibilityState={{ expanded: rulesOpen }}
            aria-expanded={rulesOpen}
            style={({ pressed }) => [styles.rulesHead, { flexDirection: dir.row }, pressed && heldDim]}
          >
            <Icon name="filter" size={18} color={colors.textPrimary} />
            <Text style={[styles.rulesTitle, { color: colors.textPrimary }]}>{t('games.couch.rules')}</Text>
            <View style={styles.rulesNow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {[`× ${settings.rounds}`, clueNow, talkNow].map((now, i) => (
                <View key={i} style={[styles.rulesChip, { backgroundColor: colors.controlTrack }]}>
                  <Text style={[styles.rulesChipText, { color: colors.textSecondary }]} numberOfLines={1}>
                    {now}
                  </Text>
                </View>
              ))}
            </View>
            <View style={rulesOpen ? styles.turned : null}>
              <Icon name="chevron-down" size={18} color={colors.textSecondary} />
            </View>
          </Pressable>
          {rulesOpen ? (
            <>
              <View style={styles.field}>
                <SectionLabel>{t('games.couch.rounds')}</SectionLabel>
                <Segmented<string>
                  groupLabel={t('games.couch.rounds')}
                  options={COUCH_ROUNDS.map(String)}
                  value={String(settings.rounds)}
                  onChange={(v) => set('rounds', Number(v) as CouchSettings['rounds'])}
                  labelOf={(n) => n}
                />
              </View>
              <View style={styles.field}>
                <SectionLabel>{t('games.impostor.clueTime')}</SectionLabel>
                <ChoiceChips<string>
                  label={t('games.impostor.clueTime')}
                  options={COUCH_CLUE_SECONDS.map(String)}
                  value={String(settings.clueSeconds)}
                  onChange={(v) => set('clueSeconds', Number(v) as CouchSettings['clueSeconds'])}
                  labelOf={(sec) => (sec === '0' ? t('games.couch.noClock') : t('games.party.seconds', { count: Number(sec) }))}
                />
              </View>
              <View style={styles.field}>
                <SectionLabel>{t('games.couch.talkTime')}</SectionLabel>
                <ChoiceChips<string>
                  label={t('games.couch.talkTime')}
                  options={COUCH_TALK_SECONDS.map(String)}
                  value={String(settings.talkSeconds)}
                  onChange={(v) => set('talkSeconds', Number(v) as CouchSettings['talkSeconds'])}
                  labelOf={(sec) => (sec === '0' ? t('games.couch.noClock') : t('games.couch.minutes', { count: Number(sec) / 60 }))}
                />
              </View>
              <View style={styles.field}>
                <SectionLabel>{t('games.impostor.vote.phase')}</SectionLabel>
                <Segmented<CouchSettings['vote']>
                  groupLabel={t('games.impostor.vote.phase')}
                  options={COUCH_VOTES}
                  value={settings.vote}
                  onChange={(v) => set('vote', v)}
                  labelOf={(v) => t(VOTE_KEY[v])}
                  wrap
                />
              </View>
            </>
          ) : null}
        </Card>
      </ScrollView>

      {/* Deal the cards stays under the list, where a thumb is, however the list is scrolled. */}
      <View style={[styles.go, { paddingBottom: insets.bottom + spacing.sm, borderTopColor: colors.separator, backgroundColor: colors.background }]}>
        {failed ? <Note tone="danger">{t('games.couch.failed')}</Note> : null}
        <GoldButton label={t('games.couch.start')} busy={busy} onPress={start} />
        <Text style={[styles.goNote, { color: colors.textSecondary }]}>{t('games.couch.noPay')}</Text>
      </View>
    </View>
  );
}

// One round.

function Round({
  game,
  totals,
  busy,
  failed,
  held,
  resumed,
  play,
  onUndo,
  onSecondTimeUp,
  onAnother,
  onChange,
  onLeave,
}: {
  game: CouchState;
  totals: readonly number[];
  busy: boolean;
  failed: boolean;
  /** A tap waiting out its moment before it is played: said in place of the choice it was made on. */
  held: Take | null;
  /** A vote was just taken back: the voter's own screen opens again at once. */
  resumed: boolean;
  play: (next: CouchState, undo?: { said: string }) => void;
  onUndo: () => void;
  onSecondTimeUp: () => void;
  onAnother: () => void;
  onChange: () => void;
  onLeave: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const reader = couchReader(game);
  const toVote = { said: t('games.couch.toVote') };
  if (game.phase === 'deal' && reader !== null) return <Deal key={reader} game={game} seat={reader} onSeen={() => play(couchSeen(game))} />;
  if (game.phase === 'clues') return <Clues game={game} onNext={() => play(couchNextClue(game))} onVote={() => play(couchToVote(game), toVote)} />;
  if (game.phase === 'talk') return <Talk game={game} onVote={() => play(couchToVote(game), toVote)} onTimeUp={() => play(couchToVote(game))} />;
  if (game.phase === 'vote' || game.phase === 'second') {
    const voter = couchVoter(game);
    const suspects = couchSuspects(game);
    const second = game.phase === 'second' ? game.second : null;
    const vote = held ? (
      <Held key={held.at} said={held.said} onUndo={onUndo} />
    ) : voter === null ? (
      <OpenVote
        names={game.players}
        suspects={suspects}
        onPoint={(seat) => play(couchPoint(game, seat), { said: seat === null ? t('games.couch.point.none') : game.players[seat]! })}
      />
    ) : (
      <SecretVote
        key={voter}
        names={game.players}
        voter={voter}
        suspects={suspects}
        done={second ? second.votes.length : game.votes.length}
        of={second ? second.voters.length : game.players.length}
        startOpen={resumed}
        onVote={(seat) =>
          play(couchCastVote(game, seat), { said: seat === null ? t('games.couch.noChoice') : t('games.impostor.vote.cast', { name: game.players[seat]! }) })
        }
      />
    );
    return second ? <SecondVote onTimeUp={onSecondTimeUp}>{vote}</SecondVote> : vote;
  }
  if (game.phase === 'guess') return <Guess game={game} onGuess={(option) => play(couchGuess(game, option))} />;
  return <Reveal game={game} totals={totals} busy={busy} failed={failed} onAnother={onAnother} onChange={onChange} onLeave={onLeave} />;
}

/**
 * The way back from a tap: the button, and a line under it that runs out with the moment (under Reduce Motion the
 * button simply goes when the moment is over).
 */
function UndoBar({ onUndo, onCloth = false }: { onUndo: () => void; onCloth?: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const left = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduce) return;
    const run = Animated.timing(left, { toValue: 0, duration: UNDO_MS, easing: (x) => x, useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [left, reduce]);
  const ink = onCloth ? TABLE.ink : colors.textPrimary;
  return (
    <View style={styles.undo}>
      <Pressable
        onPress={onUndo}
        accessibilityRole="button"
        accessibilityLabel={t('common.undo')}
        style={({ pressed }) => [styles.undoButton, { flexDirection: dir.row, borderColor: onCloth ? TABLE.veil : colors.clayBorder, opacity: pressed ? pressedDim : 1 }]}
      >
        {/* Back, the way the reader's language reads. */}
        <View style={dir.flip}>
          <Icon name="chevron-left" size={18} color={ink} />
        </View>
        <Text style={[styles.undoText, { color: ink }]}>{t('common.undo')}</Text>
      </Pressable>
      <View style={[styles.undoTrack, { backgroundColor: onCloth ? TABLE.veil : colors.controlTrack }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {/* It runs out towards where the reader started reading. */}
        <Animated.View
          style={[styles.undoTime, { backgroundColor: onCloth ? TABLE.gold : colors.textSecondary, transformOrigin: dir.rtl ? 'right' : 'left', transform: [{ scaleX: left }] }]}
        />
      </View>
    </View>
  );
}

/** A tap that would show something new, waiting out its moment: what was chosen, and the way back. */
function Held({ said, onUndo }: { said: string; onUndo: () => void }): React.JSX.Element {
  return (
    <Cloth style={styles.held}>
      <Text accessibilityLiveRegion="polite" accessibilityRole="header" style={[styles.speaker, { color: TABLE.ink }]}>
        {said}
      </Text>
      <UndoBar onUndo={onUndo} onCloth />
    </Cloth>
  );
}

/** The screen between two players: nothing on it but whose turn it is to hold the phone. */
function PassTo({ name, title, onMine }: { name: string; title?: string; onMine: () => void }): React.JSX.Element {
  const { t } = useI18n();
  return (
    <Cloth style={styles.pass}>
      <View style={styles.passHalo}>
        <View style={styles.passDisc}>
          <Text style={styles.passDiscText}>{name.slice(0, 1).toUpperCase()}</Text>
        </View>
      </View>
      <Text accessibilityRole="header" style={styles.passTitle}>
        {title ?? t('games.couch.passTo', { name })}
      </Text>
      <GoldButton label={t('games.couch.iAm', { name })} onPress={onMine} style={styles.stretch} />
    </Cloth>
  );
}

function Deal({ game, seat, onSeen }: { game: CouchState; seat: number; onSeen: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const reader = useScreenReader();
  const name = game.players[seat]!;
  const [mine, setMine] = useState(false);
  const [shown, setShown] = useState(false);
  const [seen, setSeen] = useState(false);
  const script = kurdishStyle(game.dialect);
  const hand = couchHand(game, seat);

  // The card goes face down the moment the app is not in front: another app, the lock screen, the app switcher.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') setShown(false);
    });
    return () => sub.remove();
  }, []);

  if (!mine) {
    return (
      <>
        <Progress done={game.dealt} of={game.players.length} />
        <PassTo name={name} onMine={() => setMine(true)} />
      </>
    );
  }
  const show = (): void => {
    if (!shown) haptic('tap');
    setShown(true);
    setSeen(true);
  };
  const hide = (): void => setShown(false);
  const impostor = shown && hand.role === 'impostor';
  return (
    <>
      <Progress done={game.dealt} of={game.players.length} />
      <View style={styles.cardShadow}>
        <View
          accessible
          accessibilityLabel={t('games.couch.cardOf', { name })}
          style={[styles.card, { backgroundColor: !shown ? TABLE.night : impostor ? TABLE.night : TABLE.paper }]}
        >
          {!shown ? (
            <View style={styles.cardBack}>
              <EmblemArt emblem="mask" size={132} />
            </View>
          ) : (
            <>
              {hand.hint ? (
                <View style={styles.cardTop}>
                  <CategoryArt category={hand.hint.category ?? 'category'} size={40} />
                  <View style={styles.cardTopText}>
                    <Text style={[styles.cardLabel, { color: impostor ? TABLE.inkSoft : TABLE.paperSoft }]}>{t('games.impostor.category')}</Text>
                    <Text style={[styles.cardHint, { color: impostor ? TABLE.ink : TABLE.paperInk }]}>
                      <Text style={{ writingDirection: script.writingDirection }}>{hand.hint.ku}</Text>
                      <Text style={{ color: impostor ? TABLE.inkSoft : TABLE.paperSoft }}> · {meaningIn(hand.hint.meanings, locale)}</Text>
                    </Text>
                  </View>
                </View>
              ) : null}
              <View style={styles.cardMain}>
                {hand.role === 'player' ? (
                  <>
                    <Text style={[styles.cardWord, { color: TABLE.paperInk, writingDirection: script.writingDirection }]} adjustsFontSizeToFit numberOfLines={2}>
                      {hand.word}
                    </Text>
                    <Text style={[styles.cardMeaning, { color: TABLE.paperSoft }]}>{meaningIn(hand.meanings, locale)}</Text>
                  </>
                ) : (
                  <>
                    <EmblemArt emblem="mask" size={72} />
                    <Text style={styles.impostorText}>{t('games.impostor.youAreImpostor')}</Text>
                    <Text style={[styles.cardMeaning, { color: TABLE.inkSoft }]}>{t('games.impostor.blendIn')}</Text>
                  </>
                )}
              </View>
            </>
          )}
        </View>
      </View>
      <Pressable
        // The card turns the moment it is touched, with nothing scrolling under it.
        pressDelay={0}
        onPressIn={reader ? undefined : show}
        onPressOut={reader ? undefined : hide}
        // A screen reader user cannot press and hold, so a tap turns the card and another turns it back.
        onPress={reader ? () => (shown ? hide() : show()) : undefined}
        accessibilityRole="button"
        accessibilityLabel={t('games.couch.hold')}
        accessibilityState={{ selected: shown }}
        style={[styles.hold, { backgroundColor: shown ? TABLE.gold : `${TABLE.gold}29`, borderColor: TABLE.gold }]}
      >
        <Icon name="eye" size={22} color={shown ? TABLE.goldInk : colors.goldText} />
        <Text style={[styles.holdText, { color: shown ? TABLE.goldInk : colors.goldText }]}>{t('games.couch.hold')}</Text>
      </Pressable>
      <Text style={[styles.note, styles.center, { color: colors.textSecondary }]}>{t('games.couch.holdNote')}</Text>
      <ClayButton label={t('games.couch.seen')} variant="outline" size="large" disabled={!seen || shown} onPress={onSeen} />
    </>
  );
}

/** How far the phone has got round the room, as dots. */
function Progress({ done, of }: { done: number; of: number }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: of }, (_, i) => (
        // Filled in the progress violet; gold is kept for what is earned.
        <View key={i} style={[styles.dot, { backgroundColor: i < done ? colors.primary : i === done ? colors.textPrimary : colors.controlTrack }]} />
      ))}
    </View>
  );
}

/**
 * A clock for one moment of the round: it starts with the moment and says once that its time is up. `small` for one
 * above other things to press.
 */
function Countdown({ seconds, onEnd, small = false }: { seconds: number; onEnd: () => void; small?: boolean }): React.JSX.Element {
  const { t } = useI18n();
  const [from] = useState(() => Date.now());
  const [now, setNow] = useState(from);
  const ended = useRef(false);
  const endsAt = from + seconds * 1000;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (now < endsAt || ended.current) return;
    ended.current = true;
    haptic('wrong');
    onEnd();
  }, [now, endsAt, onEnd]);
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const low = left <= 5;
  return (
    <View style={styles.clock}>
      <Text style={[styles.clockLeft, small ? styles.clockSmall : null, { color: low ? TABLE.low : TABLE.ink }]} accessibilityElementsHidden importantForAccessibility="no">
        {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
      </Text>
      <PartyTimer share={Math.max(0, endsAt - now) / (seconds * 1000)} low={low} color={TABLE.gold} label={t('games.party.timeLeft', { count: left })} />
    </View>
  );
}

function Clues({ game, onNext, onVote }: { game: CouchState; onNext: () => void; onVote: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const speaker = couchSpeaker(game)!;
  const at = game.turn % game.order.length;
  return (
    <>
      <Cloth style={styles.stage}>
        <Text style={[styles.phase, { color: TABLE.inkSoft }]}>{t('games.impostor.round', { round: speaker.round, rounds: game.settings.rounds })}</Text>
        <Text accessibilityLiveRegion="polite" accessibilityRole="header" style={[styles.speaker, { color: TABLE.ink }]}>
          {t('games.couch.speaker', { name: game.players[speaker.seat]! })}
        </Text>
        <Text style={[styles.note, styles.center, { color: TABLE.inkSoft }]}>{t('games.couch.sayClue')}</Text>
        {game.settings.clueSeconds > 0 ? <Countdown key={game.turn} seconds={game.settings.clueSeconds} onEnd={onNext} /> : null}
        <View style={styles.order}>
          {game.order.map((seat, i) => (
            <View
              key={seat}
              accessible
              accessibilityLabel={game.players[seat]}
              accessibilityState={{ selected: i === at }}
              style={[styles.orderChip, { backgroundColor: i === at ? TABLE.gold : TABLE.veil, opacity: i < at ? 0.5 : 1 }]}
            >
              <Text style={[styles.orderText, { color: i === at ? TABLE.goldInk : TABLE.ink }]} numberOfLines={1}>
                {game.players[seat]}
              </Text>
            </View>
          ))}
        </View>
      </Cloth>
      <ClayButton label={t('games.couch.next')} tone="primary" size="large" onPress={onNext} />
      <ClayButton label={t('games.couch.toVote')} variant="outline" onPress={onVote} />
    </>
  );
}

/**
 * The room talks it over; the clock running out goes to the vote as the button does, but with no way back, since nobody
 * tapped it.
 */
function Talk({ game, onVote, onTimeUp }: { game: CouchState; onVote: () => void; onTimeUp: () => void }): React.JSX.Element {
  const { t } = useI18n();
  return (
    <>
      <Cloth style={styles.stage}>
        <Text accessibilityRole="header" style={[styles.speaker, { color: TABLE.ink }]}>
          {t('games.couch.talk.title')}
        </Text>
        <Text style={[styles.note, styles.center, { color: TABLE.inkSoft }]}>{t('games.couch.talk.note')}</Text>
        <Countdown seconds={game.settings.talkSeconds} onEnd={onTimeUp} />
      </Cloth>
      <ClayButton label={t('games.couch.toVote')} tone="primary" size="large" onPress={onVote} />
    </>
  );
}

/** One of the room to choose among: a full-width row a thumb cannot miss. */
function Choice({ label, onPress, kurdish, accent = false }: { label: string; onPress: () => void; kurdish?: GameDialect; accent?: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic('select');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      // The guess's words are edged in the violet of what can be pressed; gold is kept for what is earned.
      style={({ pressed }) => [styles.choice, { backgroundColor: colors.glassFill, borderColor: accent ? colors.primary : 'transparent', opacity: pressed ? pressedDim : 1 }]}
    >
      {kurdish ? (
        <Text style={[styles.choiceWord, { writingDirection: kurdishStyle(kurdish).writingDirection, color: colors.textPrimary }]}>{label}</Text>
      ) : (
        <Text style={[styles.choiceText, { color: colors.textPrimary }]}>{label}</Text>
      )}
    </Pressable>
  );
}

/**
 * One private vote, the phone passed to the voter first: a choice for each seat they may name (never their own, nor the
 * impostor already caught), and one for nobody.
 */
function SecretVote({
  names,
  voter,
  suspects,
  done,
  of,
  startOpen,
  onVote,
}: {
  names: readonly string[];
  voter: number;
  suspects: readonly number[];
  /** How many of this vote's voters have voted, and how many it has. */
  done: number;
  of: number;
  /** The voter has the phone already (their vote was just taken back). */
  startOpen: boolean;
  onVote: (seat: number | null) => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [mine, setMine] = useState(startOpen);
  const name = names[voter]!;
  if (!mine) {
    return (
      <>
        <Progress done={done} of={of} />
        <PassTo name={name} onMine={() => setMine(true)} />
      </>
    );
  }
  return (
    <>
      <Progress done={done} of={of} />
      <Text accessibilityRole="header" style={[styles.speaker, { color: colors.textPrimary }]}>
        {t('games.couch.voteOf', { name })}
      </Text>
      <View style={styles.choices}>
        {suspects
          .filter((seat) => seat !== voter)
          .map((seat) => (
            <Choice key={seat} label={t('games.impostor.vote.pick', { name: names[seat]! })} onPress={() => onVote(seat)} />
          ))}
      </View>
      <ClayButton label={t('games.couch.noChoice')} variant="outline" onPress={() => onVote(null)} />
    </>
  );
}

/** The room's one choice, made by pointing: a choice for each seat it may name, and one for not agreeing. */
function OpenVote({ names, suspects, onPoint }: { names: readonly string[]; suspects: readonly number[]; onPoint: (seat: number | null) => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <>
      <Text accessibilityRole="header" style={[styles.speaker, { color: colors.textPrimary }]}>
        {t('games.couch.point.title')}
      </Text>
      <Text style={[styles.note, styles.center, { color: colors.textSecondary }]}>{t('games.couch.point.pick')}</Text>
      <View style={styles.choices}>
        {suspects.map((seat) => (
          <Choice key={seat} label={names[seat]!} onPress={() => onPoint(seat)} />
        ))}
      </View>
      <ClayButton label={t('games.couch.point.none')} variant="outline" onPress={() => onPoint(null)} />
    </>
  );
}

/**
 * The room's second vote once one of two impostors is caught: what it is for, then the vote against
 * COUCH_SECOND_VOTE_SECONDS. The clock starts when the room is ready, not while the caught impostor holds the phone.
 */
function SecondVote({ onTimeUp, children }: { onTimeUp: () => void; children: React.ReactNode }): React.JSX.Element {
  const { t } = useI18n();
  const [ready, setReady] = useState(false);
  if (!ready) {
    return (
      <>
        <Cloth style={styles.stage}>
          <Text accessibilityRole="header" style={[styles.speaker, { color: TABLE.ink }]}>
            {t('games.couch.secondVote.title')}
          </Text>
          <Text style={[styles.note, styles.center, { color: TABLE.inkSoft }]}>{t('games.couch.secondVote.note', { count: COUCH_SECOND_VOTE_SECONDS })}</Text>
        </Cloth>
        <ClayButton label={t('games.couch.toVote')} tone="primary" size="large" onPress={() => setReady(true)} />
      </>
    );
  }
  return (
    <>
      <Cloth style={styles.secondClock}>
        <Text style={[styles.note, styles.center, { color: TABLE.inkSoft }]}>{t('games.couch.secondVote.title')}</Text>
        <Countdown seconds={COUCH_SECOND_VOTE_SECONDS} onEnd={onTimeUp} small />
      </Cloth>
      {children}
    </>
  );
}

/** The caught impostor's one guess: handed the phone, they choose a word, and say once more that it is their answer. */
function Guess({ game, onGuess }: { game: CouchState; onGuess: (option: number) => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [mine, setMine] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);
  const name = game.players[game.accused ?? 0]!;
  if (!mine) return <PassTo name={name} title={t('games.couch.guessPass', { name })} onMine={() => setMine(true)} />;
  if (chosen !== null) {
    // The word sits inside the sentence in its own script, whichever way the sentence runs.
    const [before, after] = t('games.couch.guessConfirm', { word: '\u0001' }).split('\u0001');
    return (
      <>
        <Text accessibilityRole="header" style={[styles.speaker, { color: colors.textPrimary }]}>
          {before}
          <Text style={[styles.confirmWord, { color: colors.goldText, writingDirection: kurdishStyle(game.dialect).writingDirection }]}>{game.options[chosen]}</Text>
          {after}
        </Text>
        <ClayButton label={t('games.couch.guessConfirm.yes')} tone="primary" size="large" onPress={() => onGuess(chosen)} />
        <ClayButton label={t('games.couch.guessConfirm.no')} variant="outline" onPress={() => setChosen(null)} />
      </>
    );
  }
  return (
    <>
      <Text accessibilityRole="header" style={[styles.speaker, { color: colors.textPrimary }]}>
        {t('games.impostor.guessPrompt')}
      </Text>
      <View style={styles.choices}>
        {game.options.map((option, i) => (
          <Choice key={`${option}:${i}`} label={option} kurdish={game.dialect} accent onPress={() => setChosen(i)} />
        ))}
      </View>
    </>
  );
}

function Reveal({
  game,
  totals,
  busy,
  failed,
  onAnother,
  onChange,
  onLeave,
}: {
  game: CouchState;
  totals: readonly number[];
  busy: boolean;
  failed: boolean;
  onAnother: () => void;
  onChange: () => void;
  onLeave: () => void;
}): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const turn = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const reveal = couchReveal(game);
  const won = reveal ? reveal.endedBy !== 'escaped' : false;
  useEffect(() => {
    haptic(won ? 'celebrate' : 'wrong');
    if (reduce) {
      turn.setValue(1);
      return;
    }
    turnCard(turn).start();
  }, [reduce, turn, won]);
  if (!reveal) return null;
  const script = kurdishStyle(game.dialect);
  const round = couchScores(game);
  const sum = couchTotals(totals, game);
  const board = game.players.map((name, seat) => ({ name, seat, round: round[seat] ?? 0, total: sum[seat] ?? 0 })).sort((a, b) => b.total - a.total || a.seat - b.seat);
  const who = reveal.impostors.map((seat) => game.players[seat]!);
  const end: TranslationKey =
    reveal.endedBy === 'escaped'
      ? 'games.impostor.end.escaped'
      : reveal.endedBy === 'guessed'
        ? 'games.impostor.end.guessed'
        : game.settings.way === 'odd'
          ? 'games.couch.end.oddCaught'
          : 'games.impostor.end.caught';
  // Why the impostors got away, said before that they did.
  const why =
    reveal.escape === 'tie'
      ? t('games.impostor.end.tie')
      : reveal.escape === 'wrong-out' && game.accused !== null
        ? t('games.impostor.end.wrongOut', { name: game.players[game.accused]! })
        : null;
  // The second vote, for the impostor the first did not catch: caught as well, or still hidden and paid for it.
  const other = reveal.second ? (reveal.impostors.find((seat) => seat !== game.accused) ?? null) : null;
  const afterSecond: string[] = [];
  if (reveal.second && other !== null) {
    if (reveal.second.caught) afterSecond.push(t('games.impostor.caught', { name: game.players[other]! }));
    else if (reveal.second.accused !== null) afterSecond.push(t('games.impostor.end.wrongOut', { name: game.players[reveal.second.accused]! }));
  }
  if (reveal.stillHidden !== null) afterSecond.push(t('games.couch.end.stillHidden', { name: game.players[reveal.stillHidden]!, count: IMPOSTOR_POINTS.escaped }));
  // Who chose nobody said so; in a private second vote, whoever had not voted when the clock ran out did not vote.
  const voteLine = (voter: number, suspect: number | null): string =>
    suspect === null
      ? t('games.impostor.votedUnsure', { name: game.players[voter]! })
      : t('games.impostor.votedFor', { name: game.players[voter]!, target: game.players[suspect]! });
  const secondVotes = reveal.second?.votes ?? [];
  const missed = game.second?.done && game.settings.vote === 'secret' ? game.second.voters.slice(secondVotes.length) : [];
  const scaleX = turn.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0, 1] });
  // The turn goes a touch past flat before it settles, so the face is already there by then.
  const face = turn.interpolate({ inputRange: [0, 0.5, 0.51, 1], outputRange: [0, 0, 1, 1], extrapolate: 'clamp' });
  return (
    <>
      <View accessibilityLabel={t('games.impostor.table')} style={styles.flips}>
        {game.players.map((name, seat) => {
          const hidden = reveal.impostors.includes(seat);
          return (
            <View key={seat} style={styles.flipWrap}>
              <Animated.View
                accessible
                accessibilityLabel={`${name}: ${hidden ? t('games.impostor.impostorTag') : reveal.word}`}
                style={[styles.flip, { borderColor: hidden ? colors.danger : 'transparent', backgroundColor: colors.glassFill, transform: [{ scaleX }] }]}
              >
                <Animated.View style={[styles.flipFace, { opacity: face }]}>
                  {hidden ? <Icon name="eye-off" size={18} color={colors.danger} /> : null}
                  <Text style={[hidden ? styles.flipTag : styles.flipText, { color: hidden ? colors.danger : colors.textPrimary }]} numberOfLines={2}>
                    {hidden ? t('games.impostor.impostorTag') : reveal.word}
                  </Text>
                </Animated.View>
              </Animated.View>
              {/* A second line before an ellipsis: "Berfînê Xa…" is nobody's name. */}
              <Text style={[styles.flipName, { color: colors.textSecondary }]} numberOfLines={2}>
                {name}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.cardShadow}>
        <View style={styles.paper}>
          <Text style={[styles.cardLabel, { color: TABLE.paperSoft }]}>{t('games.impostor.reveal.title')}</Text>
          <Text style={[styles.cardWord, { color: TABLE.paperInk, writingDirection: script.writingDirection }]} adjustsFontSizeToFit numberOfLines={2}>
            {reveal.word}
          </Text>
          <Text style={[styles.cardMeaning, { color: TABLE.paperSoft }]}>{meaningIn(reveal.meanings, locale)}</Text>
        </View>
      </View>
      <View style={styles.after}>
        <Text style={[styles.whoWas, { color: colors.textPrimary }]}>
          {who.length === 1 ? t('games.impostor.reveal.impostor', { name: who[0]! }) : t('games.couch.reveal.impostors', { names: listed(who, locale) })}
        </Text>
        {reveal.twin ? (
          <Text style={[styles.note, styles.center, { color: colors.textSecondary }]}>
            {t('games.couch.reveal.odd')} <Text style={{ writingDirection: script.writingDirection }}>{reveal.twin.word}</Text> · {meaningIn(reveal.twin.meanings, locale)}
          </Text>
        ) : null}
        {why ? <Text style={[styles.note, styles.center, { color: colors.textSecondary }]}>{why}</Text> : null}
        <Text style={[styles.note, styles.center, { color: colors.textSecondary }]}>{t(end)}</Text>
        {reveal.guessed ? (
          <Text style={[styles.note, styles.center, { color: colors.textSecondary }]}>
            {t('games.impostor.guessedWith')} <Text style={{ writingDirection: script.writingDirection }}>{reveal.guessed}</Text>
          </Text>
        ) : null}
        {afterSecond.map((line) => (
          <Text key={line} style={[styles.note, styles.center, { color: colors.textSecondary }]}>
            {line}
          </Text>
        ))}
      </View>

      {reveal.votes.length > 0 || secondVotes.length > 0 || missed.length > 0 ? (
        <Card style={styles.form}>
          <SectionLabel>{t('games.impostor.votes')}</SectionLabel>
          {reveal.votes.length > 0 ? (
            <View style={styles.list}>
              {reveal.votes.map((suspect, voter) => (
                <Text key={voter} style={[styles.note, dir.text, { color: colors.textPrimary }]}>
                  {voteLine(voter, suspect)}
                </Text>
              ))}
            </View>
          ) : null}
          {secondVotes.length > 0 || missed.length > 0 ? (
            <View style={styles.list}>
              <Text accessibilityRole="header" style={[styles.secondTitle, dir.text, { color: colors.textSecondary }]}>
                {t('games.couch.secondVote.title')}
              </Text>
              {secondVotes.map((v) => (
                <Text key={v.seat} style={[styles.note, dir.text, { color: colors.textPrimary }]}>
                  {voteLine(v.seat, v.for)}
                </Text>
              ))}
              {missed.map((seat) => (
                <Text key={seat} style={[styles.note, dir.text, { color: colors.textPrimary }]}>
                  {t('games.impostor.noVote', { name: game.players[seat]! })}
                </Text>
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}

      <Card style={styles.score}>
        <View style={[styles.scoreRow, { flexDirection: dir.row }]}>
          <Text style={[styles.scoreHead, styles.scoreName, dir.text, { color: colors.textSecondary }]}>{t('games.couch.players')}</Text>
          <Text style={[styles.scoreHead, styles.scoreN, { color: colors.textSecondary }]}>{t('games.couch.roundPoints')}</Text>
          <Text style={[styles.scoreHead, styles.scoreN, { color: colors.textSecondary }]}>{t('games.couch.total')}</Text>
        </View>
        {board.map((row, place) => (
          <View
            key={row.seat}
            accessible
            accessibilityLabel={`${row.name}: ${t('games.couch.roundPoints')} ${row.round}, ${t('games.couch.total')} ${row.total}`}
            style={[styles.scoreRow, { flexDirection: dir.row, borderTopColor: colors.separator }, place > 0 ? styles.scoreRule : null]}
          >
            {/* The impostor is marked by the card's own sign, as on the cards above; red would read as "wrong" beside
               a green +3. */}
            <View style={[styles.scoreName, styles.scoreWho, { flexDirection: dir.row }]}>
              {reveal.impostors.includes(row.seat) ? <Icon name="eye-off" size={16} color={colors.textSecondary} /> : null}
              <Text style={[styles.scoreText, styles.flexText, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
                {row.name}
              </Text>
            </View>
            <Text style={[styles.scoreN, styles.scoreText, { color: row.round > 0 ? colors.success : colors.textSecondary }]}>{row.round > 0 ? `+${row.round}` : '0'}</Text>
            <Text style={[styles.scoreN, styles.scoreTotal, { color: colors.textPrimary }]}>{row.total}</Text>
          </View>
        ))}
      </Card>

      {failed ? <Note tone="danger">{t('games.couch.failed')}</Note> : null}
      <ClayButton label={t('games.couch.nextRound')} tone="primary" size="large" busy={busy} onPress={onAnother} />
      <ClayButton label={t('games.couch.change')} variant="outline" onPress={onChange} />
      <ClayButton label={t('games.couch.finish')} onPress={onLeave} />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  loading: { marginTop: spacing.xl },
  centered: { alignItems: 'center', gap: spacing.sm },
  blurb: { fontSize: typography.sizes.md, textAlign: 'center', lineHeight: 22 },
  countPill: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 4, borderRadius: radii.pill },
  count: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 0.8, textTransform: 'uppercase', textAlign: 'center' },
  form: { gap: spacing.md },
  names: { gap: spacing.sm },
  field: { gap: spacing.sm },
  note: { fontSize: typography.sizes.sm, lineHeight: 20 },
  center: { textAlign: 'center' },
  stretch: { alignSelf: 'stretch' },
  nameRow: { alignItems: 'center', gap: spacing.sm },
  nameN: { width: 36, height: 36, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  nameNText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  // A text field is as wide as its text unless allowed to shrink; without it the row runs off the card.
  nameInput: { flex: 1, minWidth: 0, minHeight: 48, fontSize: typography.sizes.md, borderRadius: radii.md, paddingHorizontal: 12 },
  nameRemove: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  rulesHead: { minHeight: MIN_TOUCH_TARGET, alignItems: 'center', gap: spacing.sm },
  rulesTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  rulesNow: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 },
  rulesChip: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.pill },
  rulesChipText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  turned: { transform: [{ rotate: '180deg' }] },
  // The screen's one divider: what scrolls ends here, and what is always in reach begins.
  go: { gap: spacing.sm, paddingTop: spacing.sm, paddingHorizontal: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
  goNote: { fontSize: typography.sizes.xs, textAlign: 'center' },
  pass: { alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
  passHalo: { width: 140, height: 140, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: `${TABLE.gold}26` },
  passDisc: { width: 108, height: 108, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: TABLE.gold },
  passDiscText: { fontSize: 50, fontWeight: typography.weights.bold, color: TABLE.goldInk },
  passTitle: { fontSize: typography.sizes.xl, lineHeight: 34, fontWeight: typography.weights.bold, textAlign: 'center', color: TABLE.ink },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 22, height: 6, borderRadius: radii.pill },
  // The card lifts off the screen with a shadow round its own shape.
  cardShadow: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 320,
    borderRadius: radii.xl,
    shadowColor: TABLE.nightDeep,
    shadowOpacity: 0.34,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  card: { minHeight: 360, padding: spacing.md, borderRadius: radii.xl, overflow: 'hidden' },
  cardBack: { flex: 1, margin: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: `${TABLE.gold}8c`, borderRadius: radii.lg },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTopText: { flex: 1, gap: 2 },
  cardMain: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  cardLabel: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 0.8, textTransform: 'uppercase' },
  cardHint: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  cardWord: { fontSize: 44, fontWeight: typography.weights.bold, textAlign: 'center' },
  cardMeaning: { fontSize: typography.sizes.md, textAlign: 'center' },
  impostorText: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, textAlign: 'center', color: TABLE.goldSoft },
  paper: { alignItems: 'center', gap: 4, paddingVertical: spacing.lg, paddingHorizontal: spacing.md, borderRadius: radii.xl, backgroundColor: TABLE.paper },
  after: { alignItems: 'center', gap: spacing.xs },
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
  stage: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg, paddingHorizontal: spacing.lg },
  list: { gap: spacing.xs },
  phase: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 0.8, textTransform: 'uppercase' },
  speaker: { fontSize: typography.sizes.xl, lineHeight: 34, fontWeight: typography.weights.bold, textAlign: 'center' },
  clock: { alignSelf: 'stretch', alignItems: 'stretch', gap: spacing.xs },
  clockLeft: { fontSize: 56, fontWeight: typography.weights.bold, textAlign: 'center', fontVariant: ['tabular-nums'] },
  clockSmall: { fontSize: 40 },
  // The second vote's clock sits above whoever has the phone, smaller than a turn's own stage.
  secondClock: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  secondTitle: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, marginTop: spacing.sm },
  // The way back from a tap: a quiet button, and the line that runs out under it.
  undo: { alignSelf: 'center', alignItems: 'stretch', gap: 6, width: 200, maxWidth: '100%' },
  undoButton: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1.5,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
  },
  undoText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  undoTrack: { height: 3, borderRadius: radii.pill, overflow: 'hidden' },
  undoTime: { flex: 1, borderRadius: radii.pill },
  // A tap waiting out its moment: what was chosen, on the cloth, with the way back.
  held: { alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
  confirmWord: { fontWeight: typography.weights.bold },
  order: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.xs },
  orderChip: { maxWidth: 140, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill },
  orderText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  choices: { gap: spacing.sm },
  choice: { minHeight: 56, borderWidth: 1.5, borderRadius: radii.md, paddingHorizontal: spacing.md, justifyContent: 'center' },
  choiceText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, textAlign: 'center' },
  choiceWord: { fontSize: 22, fontWeight: typography.weights.bold, textAlign: 'center' },
  flips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  flipWrap: { width: 78, alignItems: 'center', gap: 4 },
  flip: { width: 72, height: 92, borderWidth: 1.5, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', padding: 4 },
  flipFace: { alignItems: 'center' },
  flipText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, textAlign: 'center' },
  // The tag is longer than most cards' words in several languages, so a size down keeps it off the card's edge.
  flipTag: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, textAlign: 'center' },
  flipName: { fontSize: typography.sizes.xs },
  whoWas: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, textAlign: 'center' },
  // The score's rows sit against each other with a rule between, so the table reads as one thing.
  score: { gap: 0 },
  scoreRow: { alignItems: 'center', gap: spacing.sm, minHeight: 40 },
  scoreRule: { borderTopWidth: StyleSheet.hairlineWidth },
  scoreHead: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 0.4, textTransform: 'uppercase' },
  scoreName: { flex: 1 },
  scoreWho: { alignItems: 'center', gap: spacing.xs },
  flexText: { flexShrink: 1 },
  scoreN: { width: 72, textAlign: 'center' },
  scoreText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  scoreTotal: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
});
