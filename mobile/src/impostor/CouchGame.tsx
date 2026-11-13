import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import {
  COUCH_CLUE_SECONDS,
  COUCH_DEFAULTS,
  COUCH_MAX_PLAYERS,
  COUCH_MIN_PLAYERS,
  COUCH_NAME_MAX,
  COUCH_ROUNDS,
  COUCH_TALK_SECONDS,
  COUCH_TWO_IMPOSTORS_FROM,
  COUCH_VOTES,
  COUCH_WAYS,
  GAME_DIALECTS,
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
  couchSeen,
  couchSpeaker,
  couchStart,
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
import { newDeviceId } from '../auth/deviceId';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { PartyTimer } from '../party/Composer';
import { PARTY_DIALECT_NAME, PARTY_LEVEL_KEY } from '../party/PartyStart';
import { useDirection } from '../reports/direction';
import { ChoiceChips, Note, SectionLabel } from '../stories/ui';
import { ClayButton, GlassCard, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { Loading } from '../theme/Loading';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { CategoryArt, EmblemArt, WayArt } from './art';
import { kurdishStyle } from './ImpostorBoard';
import type { CouchAsk } from './ImpostorStart';
import { Cloth, GoldButton, PictureCards, PictureTiles, StepTitle } from './parts';
import { TABLE } from './table';
import { WAY_KEY, WAY_NOTE } from './ways';
import { pressedDim } from '../theme/motion';
import { heldDim } from '../theme/MotionParts';
import { turnCard } from '../theme/animate';

/**
 * Kurdish Impostor on one phone, passed round a room.
 *
 * The rules are shared/src/games/impostor/couch.ts; this is the phone's part
 * in them, the website's screens (web/src/impostor/Couch.tsx) in the phone's
 * own parts. It asks who is playing and how, fetches an evening's cards
 * (approved word cards, dealt by the server), and walks the room through each
 * round: the phone handed to each player to read their card, the clues said
 * out loud in turn, the talk, the vote, the caught impostor's guess, and the
 * cards turned over with the evening's score.
 *
 * What it is careful about, because one screen is shared by people who must
 * not see each other's cards:
 * - a card is on the screen only while its holder is pressing it; letting go,
 *   leaving the app or the screen locking hides it;
 * - between two players there is always a screen that shows nothing, with the
 *   next player's name on it;
 * - the cards stay in memory for the evening and are never stored; the
 *   players' names are kept on this phone only, so the next evening starts
 *   with them, and are never sent anywhere;
 * - every draw comes from the phone's own random generator, not a clock.
 *
 * A round played here earns nothing: the phone holds every card, so nothing it
 * could report about who won would be worth believing.
 *
 * The setup is three numbered steps a room can answer without reading
 * anything twice (who is playing, which game, what about), the rules folded
 * under them with the answers they already have, and Deal the cards pinned
 * under the list where a thumb is. The round is played at the game's own
 * table (table.ts): the pass screen, the clue and the talk on its night
 * cloth, a card face down in the mask and face up on paper.
 */

const KEPT = 'hevalo_couch_v1';
const VOTE_KEY: Record<CouchSettings['vote'], TranslationKey> = { secret: 'games.couch.vote.secret', open: 'games.couch.vote.open' };
const ANY = '';

/** What this phone remembers from the last evening: the names and how the game was set. Anything else it finds, it ignores. */
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
    // a phone that will not keep them only asks for the names again next time
  }
}

/** A seed for one round's draws, from the phone's own random generator (the one a new device id comes from). */
const freshSeed = (): string => newDeviceId();

/** Names read as a list the way the reader's language joins them; a comma where the phone cannot say. */
function listed(names: readonly string[], locale: string): string {
  try {
    const formats = Intl as unknown as { ListFormat?: new (locale: string, options: { type: 'conjunction' }) => { format(items: readonly string[]): string } };
    if (formats.ListFormat) return new formats.ListFormat(locale, { type: 'conjunction' }).format(names);
  } catch {
    // an older engine has no list format: the comma below says it well enough
  }
  return names.join(', ');
}

/** Whether a screen reader is reading the phone: its user cannot press and hold, so the card is turned by a tap instead. */
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
 * style is its frame's (where it sits among its neighbours), so a gap or an
 * alignment given there never reaches what is inside it.
 */
function Card({ style, children }: { style: StyleProp<ViewStyle>; children: React.ReactNode }): React.JSX.Element {
  return (
    <GlassCard>
      <View style={style}>{children}</View>
    </GlassCard>
  );
}

interface Evening {
  dialect: GameDialect;
  difficulty: GameDifficulty;
  category: string | null;
  deck: CouchCard[];
  /** the card being played, by its place in the deck */
  at: number;
  /** how many rounds have been started this evening */
  played: number;
  game: CouchState;
  /** the points before this round, by seat */
  totals: number[];
}

export function CouchGame({ onLeave, ask }: { onLeave: () => void; ask?: CouchAsk }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { client } = useAuth();
  const [offers, setOffers] = useState<CouchOffer[] | null>(null);
  const [evening, setEvening] = useState<Evening | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void Promise.all(GAME_DIALECTS.map((d) => client.get<CouchOffer>(`/games/impostor/couch?dialect=${d}`))).then((all) => {
      if (alive) setOffers(all.flatMap((r) => (r.ok && Array.isArray(r.data?.difficulties) && r.data.difficulties.length > 0 ? [r.data] : [])));
    });
    return () => {
      alive = false;
    };
  }, [client]);

  /** An evening's cards, fetched; null when they could not be. */
  const fetchDeck = useCallback(
    async (dialect: GameDialect, difficulty: GameDifficulty, category: string | null): Promise<CouchCard[] | null> => {
      setBusy(true);
      setFailed(false);
      const res = await client.post<CouchDeck>('/games/impostor/couch/deck', { dialect, difficulty, category });
      setBusy(false);
      if (res.ok && Array.isArray(res.data?.cards) && res.data.cards.length > 0) return res.data.cards;
      setFailed(true);
      return null;
    },
    [client],
  );

  async function begin(names: string[], settings: CouchSettings, dialect: GameDialect, difficulty: GameDifficulty, category: string | null): Promise<void> {
    const deck = await fetchDeck(dialect, difficulty, category);
    if (!deck) return;
    void writeKept({ names, settings });
    haptic('tap');
    setEvening({ dialect, difficulty, category, deck, at: 0, played: 1, game: couchStart(dialect, names, settings, deck[0]!, freshSeed()), totals: names.map(() => 0) });
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
    const game = couchStart(evening.dialect, evening.game.players, evening.game.settings, deck[at]!, freshSeed());
    setEvening({ ...evening, deck, at, played: evening.played + 1, totals, game });
  }

  if (offers === null) return <Loading style={styles.loading} />;
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
  const play = (game: CouchState): void => setEvening({ ...evening, game });
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={[styles.countPill, { backgroundColor: colors.controlTrack }]}>
        <Text style={[styles.count, { color: colors.textSecondary }]}>{t('games.couch.game', { n: evening.played })}</Text>
      </View>
      <Round
        game={evening.game}
        totals={evening.totals}
        busy={busy}
        failed={failed}
        play={play}
        onAnother={() => void another()}
        onChange={() => setEvening(null)}
        onLeave={onLeave}
      />
    </ScrollView>
  );
}

// ---------- who is playing, and how ----------

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
  /** a way to play or a category chosen on the start: it wins over what this phone remembers */
  ask?: CouchAsk;
  onStart: (names: string[], settings: CouchSettings, dialect: GameDialect, difficulty: GameDifficulty, category: string | null) => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const insets = useSafeAreaInsets();
  const [names, setNames] = useState<string[]>(() => Array.from({ length: COUCH_MIN_PLAYERS + 1 }, () => ''));
  const [settings, setSettings] = useState<CouchSettings>(() => ({ ...COUCH_DEFAULTS, ...(ask?.way ? { way: ask.way } : {}) }));
  const [dialect, setDialect] = useState<GameDialect>(offers[0]!.dialect);
  const [difficulty, setDifficulty] = useState<GameDifficulty | null>(null);
  const [category, setCategory] = useState(ask?.category ?? ANY);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [slip, setSlip] = useState<TranslationKey | null>(null);
  // what the phone kept arrives a moment after the screen: it fills the form only if nobody has started typing
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
    // what was asked for on the way in is read once, as the phone's memory is
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
  // an empty box takes the name on its placeholder: "Player 3"
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
                <View style={styles.nameN}>
                  <Text style={styles.nameNText}>{name.trim() === '' ? i + 1 : name.trim().slice(0, 1).toUpperCase()}</Text>
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
                labelOf={(d) => PARTY_DIALECT_NAME[d]}
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

        {/* the rules have sensible answers already: they wait folded, saying what they are set to */}
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

      {/* Deal the cards: under the list, where a thumb is, whatever the list is scrolled to */}
      <View style={[styles.go, { paddingBottom: insets.bottom + spacing.sm, borderTopColor: colors.separator, backgroundColor: colors.background }]}>
        {failed ? <Note tone="danger">{t('games.couch.failed')}</Note> : null}
        <GoldButton label={t('games.couch.start')} busy={busy} onPress={start} />
        <Text style={[styles.goNote, { color: colors.textSecondary }]}>{t('games.couch.noPay')}</Text>
      </View>
    </View>
  );
}

// ---------- one round ----------

function Round({
  game,
  totals,
  busy,
  failed,
  play,
  onAnother,
  onChange,
  onLeave,
}: {
  game: CouchState;
  totals: readonly number[];
  busy: boolean;
  failed: boolean;
  play: (next: CouchState) => void;
  onAnother: () => void;
  onChange: () => void;
  onLeave: () => void;
}): React.JSX.Element {
  const reader = couchReader(game);
  if (game.phase === 'deal' && reader !== null) return <Deal key={reader} game={game} seat={reader} onSeen={() => play(couchSeen(game))} />;
  if (game.phase === 'clues') return <Clues game={game} onNext={() => play(couchNextClue(game))} onVote={() => play(couchToVote(game))} />;
  if (game.phase === 'talk') return <Talk game={game} onVote={() => play(couchToVote(game))} />;
  if (game.phase === 'vote') {
    const voter = couchVoter(game);
    if (voter === null) return <OpenVote game={game} onPoint={(seat) => play(couchPoint(game, seat))} />;
    return <SecretVote key={voter} game={game} voter={voter} onVote={(seat) => play(couchCastVote(game, seat))} />;
  }
  if (game.phase === 'guess') return <Guess game={game} onGuess={(option) => play(couchGuess(game, option))} />;
  return <Reveal game={game} totals={totals} busy={busy} failed={failed} onAnother={onAnother} onChange={onChange} onLeave={onLeave} />;
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

  // the card goes face down the moment the app is not the one in front: another app, the lock screen, the app switcher
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
        onPressIn={reader ? undefined : show}
        onPressOut={reader ? undefined : hide}
        // someone listening to the phone cannot press and hold: for them a tap turns the card, and another turns it back
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
        <View key={i} style={[styles.dot, { backgroundColor: i < done ? TABLE.gold : i === done ? colors.textPrimary : colors.controlTrack }]} />
      ))}
    </View>
  );
}

/** A clock for one moment of the round: it starts when the moment does, and says once that its time is up. */
function Countdown({ seconds, onEnd }: { seconds: number; onEnd: () => void }): React.JSX.Element {
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
      <Text style={[styles.clockLeft, { color: low ? TABLE.low : TABLE.ink }]} accessibilityElementsHidden importantForAccessibility="no">
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

function Talk({ game, onVote }: { game: CouchState; onVote: () => void }): React.JSX.Element {
  const { t } = useI18n();
  return (
    <>
      <Cloth style={styles.stage}>
        <Text accessibilityRole="header" style={[styles.speaker, { color: TABLE.ink }]}>
          {t('games.couch.talk.title')}
        </Text>
        <Text style={[styles.note, styles.center, { color: TABLE.inkSoft }]}>{t('games.couch.talk.note')}</Text>
        <Countdown seconds={game.settings.talkSeconds} onEnd={onVote} />
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
      style={({ pressed }) => [styles.choice, { backgroundColor: colors.glassFill, borderColor: accent ? colors.gold : 'transparent', opacity: pressed ? pressedDim : 1 }]}
    >
      {kurdish ? (
        <Text style={[styles.choiceWord, { writingDirection: kurdishStyle(kurdish).writingDirection, color: colors.textPrimary }]}>{label}</Text>
      ) : (
        <Text style={[styles.choiceText, { color: colors.textPrimary }]}>{label}</Text>
      )}
    </Pressable>
  );
}

function SecretVote({ game, voter, onVote }: { game: CouchState; voter: number; onVote: (seat: number | null) => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [mine, setMine] = useState(false);
  const name = game.players[voter]!;
  if (!mine) {
    return (
      <>
        <Progress done={game.votes.length} of={game.players.length} />
        <PassTo name={name} onMine={() => setMine(true)} />
      </>
    );
  }
  return (
    <>
      <Progress done={game.votes.length} of={game.players.length} />
      <Text accessibilityRole="header" style={[styles.speaker, { color: colors.textPrimary }]}>
        {t('games.couch.voteOf', { name })}
      </Text>
      <View style={styles.choices}>
        {game.players.map((other, seat) => (seat === voter ? null : <Choice key={seat} label={t('games.impostor.vote.pick', { name: other })} onPress={() => onVote(seat)} />))}
      </View>
      <ClayButton label={t('games.couch.noChoice')} variant="outline" onPress={() => onVote(null)} />
    </>
  );
}

function OpenVote({ game, onPoint }: { game: CouchState; onPoint: (seat: number | null) => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <>
      <Text accessibilityRole="header" style={[styles.speaker, { color: colors.textPrimary }]}>
        {t('games.couch.point.title')}
      </Text>
      <Text style={[styles.note, styles.center, { color: colors.textSecondary }]}>{t('games.couch.point.pick')}</Text>
      <View style={styles.choices}>
        {game.players.map((name, seat) => (
          <Choice key={seat} label={name} onPress={() => onPoint(seat)} />
        ))}
      </View>
      <ClayButton label={t('games.couch.point.none')} variant="outline" onPress={() => onPoint(null)} />
    </>
  );
}

function Guess({ game, onGuess }: { game: CouchState; onGuess: (option: number) => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [mine, setMine] = useState(false);
  const name = game.players[game.accused ?? 0]!;
  if (!mine) return <PassTo name={name} title={t('games.couch.guessPass', { name })} onMine={() => setMine(true)} />;
  return (
    <>
      <Text accessibilityRole="header" style={[styles.speaker, { color: colors.textPrimary }]}>
        {t('games.impostor.guessPrompt')}
      </Text>
      <View style={styles.choices}>
        {game.options.map((option, i) => (
          <Choice key={`${option}:${i}`} label={option} kurdish={game.dialect} accent onPress={() => onGuess(i)} />
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
  const scaleX = turn.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0, 1] });
  // the turn comes a touch past flat before it settles: the face is simply there by then
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
              <Text style={[styles.flipName, { color: colors.textSecondary }]} numberOfLines={1}>
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
        <Text style={[styles.note, styles.center, { color: colors.textSecondary }]}>{t(end)}</Text>
        {reveal.guessed ? (
          <Text style={[styles.note, styles.center, { color: colors.textSecondary }]}>
            {t('games.impostor.guessedWith')} <Text style={{ writingDirection: script.writingDirection }}>{reveal.guessed}</Text>
          </Text>
        ) : null}
      </View>

      {reveal.votes.length > 0 ? (
        <Card style={styles.form}>
          <SectionLabel>{t('games.impostor.votes')}</SectionLabel>
          <View style={styles.list}>
            {reveal.votes.map((suspect, voter) => (
              <Text key={voter} style={[styles.note, dir.text, { color: colors.textPrimary }]}>
                {suspect === null
                  ? t('games.impostor.noVote', { name: game.players[voter]! })
                  : t('games.impostor.votedFor', { name: game.players[voter]!, target: game.players[suspect]! })}
              </Text>
            ))}
          </View>
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
            <Text style={[styles.scoreName, styles.scoreText, dir.text, { color: reveal.impostors.includes(row.seat) ? colors.danger : colors.textPrimary }]} numberOfLines={1}>
              {row.name}
            </Text>
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
  nameN: { width: 36, height: 36, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: `${TABLE.gold}29` },
  nameNText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, color: TABLE.gold },
  // a text field is as wide as its text wants unless told it may be narrower: without that the row runs off the card
  nameInput: { flex: 1, minWidth: 0, minHeight: 48, fontSize: typography.sizes.md, borderRadius: radii.md, paddingHorizontal: 12 },
  nameRemove: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  rulesHead: { minHeight: MIN_TOUCH_TARGET, alignItems: 'center', gap: spacing.sm },
  rulesTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  rulesNow: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 },
  rulesChip: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.pill },
  rulesChipText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  turned: { transform: [{ rotate: '180deg' }] },
  // the one divider on the screen: what scrolls ends here, and what is always in reach begins
  go: { gap: spacing.sm, paddingTop: spacing.sm, paddingHorizontal: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
  goNote: { fontSize: typography.sizes.xs, textAlign: 'center' },
  pass: { alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
  passHalo: { width: 140, height: 140, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: `${TABLE.gold}26` },
  passDisc: { width: 108, height: 108, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: TABLE.gold },
  passDiscText: { fontSize: 50, fontWeight: typography.weights.bold, color: TABLE.goldInk },
  passTitle: { fontSize: typography.sizes.xl, lineHeight: 34, fontWeight: typography.weights.bold, textAlign: 'center', color: TABLE.ink },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 22, height: 6, borderRadius: radii.pill },
  // the card lifts off the screen: its shadow is its own, round the shape it has
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
  // the tag is a longer word than most cards' own in several languages: a size down keeps it off the card's edge
  flipTag: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, textAlign: 'center' },
  flipName: { fontSize: typography.sizes.xs },
  whoWas: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, textAlign: 'center' },
  // the rows of the score sit against each other, a rule between them: the table reads as one thing
  score: { gap: 0 },
  scoreRow: { alignItems: 'center', gap: spacing.sm, minHeight: 40 },
  scoreRule: { borderTopWidth: StyleSheet.hairlineWidth },
  scoreHead: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 0.4, textTransform: 'uppercase' },
  scoreName: { flex: 1 },
  scoreN: { width: 72, textAlign: 'center' },
  scoreText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  scoreTotal: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
});
