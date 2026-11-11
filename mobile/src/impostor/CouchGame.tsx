import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Platform, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
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
import { kurdishStyle } from './ImpostorBoard';

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
 */

const KEPT = 'hevalo_couch_v1';
const WAY_KEY: Record<CouchSettings['way'], TranslationKey> = { classic: 'games.couch.way.classic', blind: 'games.couch.way.blind', odd: 'games.couch.way.odd' };
const WAY_NOTE: Record<CouchSettings['way'], TranslationKey> = {
  classic: 'games.couch.way.classic.note',
  blind: 'games.couch.way.blind.note',
  odd: 'games.couch.way.odd.note',
};
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

export function CouchGame({ onLeave }: { onLeave: () => void }): React.JSX.Element {
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
      <Card style={styles.centered}>
        <Icon name="people" size={40} tone="primary" />
        <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t('games.impostor.notOffered')}</Text>
      </Card>
    );
  }
  if (!evening) return <Setup offers={offers} busy={busy} failed={failed} onStart={(...args) => void begin(...args)} />;
  const play = (game: CouchState): void => setEvening({ ...evening, game });
  return (
    <View style={styles.round}>
      <Text style={[styles.count, { color: colors.textSecondary }]}>{t('games.couch.game', { n: evening.played })}</Text>
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
    </View>
  );
}

// ---------- who is playing, and how ----------

function Setup({
  offers,
  busy,
  failed,
  onStart,
}: {
  offers: readonly CouchOffer[];
  busy: boolean;
  failed: boolean;
  onStart: (names: string[], settings: CouchSettings, dialect: GameDialect, difficulty: GameDifficulty, category: string | null) => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const [names, setNames] = useState<string[]>(() => Array.from({ length: COUCH_MIN_PLAYERS + 1 }, () => ''));
  const [settings, setSettings] = useState<CouchSettings>(COUCH_DEFAULTS);
  const [dialect, setDialect] = useState<GameDialect>(offers[0]!.dialect);
  const [difficulty, setDifficulty] = useState<GameDifficulty | null>(null);
  const [category, setCategory] = useState(ANY);
  const [slip, setSlip] = useState<TranslationKey | null>(null);
  // what the phone kept arrives a moment after the screen: it fills the form only if nobody has started typing
  const touched = useRef(false);
  useEffect(() => {
    let alive = true;
    void readKept().then((kept) => {
      if (!alive || !kept || touched.current) return;
      if (kept.names.length >= COUCH_MIN_PLAYERS) setNames(kept.names);
      setSettings(kept.settings);
    });
    return () => {
      alive = false;
    };
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
  const categoryLabel = (slug: string): string => {
    const found = level.categories.find((c) => c.slug === slug);
    if (!found) return t('games.couch.anyCategory');
    const meaning = meaningIn(found.meanings, locale);
    return meaning ? `${found.ku} · ${meaning}` : found.ku;
  };

  function start(): void {
    const checked = couchNames(named);
    if (!checked.ok) return setSlip(checked.reason === 'same' ? 'games.couch.names.same' : 'games.couch.names.empty');
    setSlip(null);
    const impostors = checked.names.length >= COUCH_TWO_IMPOSTORS_FROM ? settings.impostors : 1;
    onStart(checked.names, { ...settings, impostors }, offer.dialect, level.difficulty, chosenCategory || null);
  }

  return (
    <>
      <Card style={styles.centered}>
        <Icon name="device-phone" size={40} tone="primary" />
        <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t('games.couch.blurb')}</Text>
      </Card>

      <Card style={styles.form}>
        <SectionLabel>{t('games.couch.players')}</SectionLabel>
        <View style={styles.names}>
          {names.map((name, i) => (
          <View key={i} style={[styles.nameRow, { flexDirection: dir.row }]}>
            <View style={[styles.nameN, { backgroundColor: colors.controlTrack }]}>
              <Text style={[styles.nameNText, { color: colors.textSecondary }]}>{i + 1}</Text>
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
                style={({ pressed }) => [styles.nameRemove, { opacity: pressed ? 0.6 : 1 }]}
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
        <View style={styles.field}>
          <SectionLabel>{t('games.couch.way')}</SectionLabel>
          <Segmented<CouchSettings['way']>
            groupLabel={t('games.couch.way')}
            options={COUCH_WAYS}
            value={settings.way}
            onChange={(v) => set('way', v)}
            labelOf={(w) => t(WAY_KEY[w])}
            wrap
          />
          <Text style={[styles.note, { color: colors.textSecondary }]}>{t(WAY_NOTE[settings.way])}</Text>
        </View>
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
          <View style={styles.field}>
            <SectionLabel>{t('games.impostor.category')}</SectionLabel>
            <ChoiceChips<string>
              label={t('games.impostor.category')}
              options={[ANY, ...level.categories.map((c) => c.slug)]}
              value={chosenCategory}
              onChange={setCategory}
              labelOf={categoryLabel}
            />
          </View>
        ) : null}
      </Card>

      <Card style={styles.form}>
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
            labelOf={(s) => (s === '0' ? t('games.couch.noClock') : t('games.party.seconds', { count: Number(s) }))}
          />
        </View>
        <View style={styles.field}>
          <SectionLabel>{t('games.couch.talkTime')}</SectionLabel>
          <ChoiceChips<string>
            label={t('games.couch.talkTime')}
            options={COUCH_TALK_SECONDS.map(String)}
            value={String(settings.talkSeconds)}
            onChange={(v) => set('talkSeconds', Number(v) as CouchSettings['talkSeconds'])}
            labelOf={(s) => (s === '0' ? t('games.couch.noClock') : t('games.couch.minutes', { count: Number(s) / 60 }))}
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
      </Card>

      {failed ? <Note tone="danger">{t('games.couch.failed')}</Note> : null}
      <ClayButton label={t('games.couch.start')} tone="primary" size="large" busy={busy} onPress={start} />
      <Text style={[styles.note, styles.center, { color: colors.textSecondary }]}>{t('games.couch.noPay')}</Text>
    </>
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
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <Card style={styles.pass}>
      <Text accessibilityRole="header" style={[styles.passTitle, { color: colors.textPrimary }]}>
        {title ?? t('games.couch.passTo', { name })}
      </Text>
      <View style={[styles.passDisc, { backgroundColor: colors.gold }]}>
        <Text style={[styles.passDiscText, { color: colors.textOnGold }]}>{name.slice(0, 1).toUpperCase()}</Text>
      </View>
      <ClayButton label={t('games.couch.iAm', { name })} tone="primary" size="large" onPress={onMine} style={styles.stretch} />
    </Card>
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
      <View
        accessible
        accessibilityLabel={t('games.couch.cardOf', { name })}
        style={[styles.card, { backgroundColor: shown ? colors.glassFill : colors.controlTrack, borderColor: impostor ? colors.danger : shown ? colors.gold : 'transparent' }]}
      >
        {!shown ? (
          <Icon name="eye-off" size={48} color={colors.textSecondary} />
        ) : (
          <>
            {hand.hint ? (
              <>
                <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>{t('games.impostor.category')}</Text>
                <Text style={[styles.cardHint, { color: colors.textPrimary }]}>
                  <Text style={{ writingDirection: script.writingDirection }}>{hand.hint.ku}</Text> · {meaningIn(hand.hint.meanings, locale)}
                </Text>
              </>
            ) : null}
            {hand.role === 'player' ? (
              <>
                <Text style={[styles.cardWord, { color: colors.textPrimary, writingDirection: script.writingDirection }]}>{hand.word}</Text>
                <Text style={[styles.cardMeaning, { color: colors.textSecondary }]}>{meaningIn(hand.meanings, locale)}</Text>
              </>
            ) : (
              <>
                <View style={styles.impostorLine}>
                  <Icon name="eye-off" size={22} color={colors.danger} />
                  <Text style={[styles.impostorText, { color: colors.danger }]}>{t('games.impostor.youAreImpostor')}</Text>
                </View>
                <Text style={[styles.cardMeaning, { color: colors.textSecondary }]}>{t('games.impostor.blendIn')}</Text>
              </>
            )}
          </>
        )}
      </View>
      <Pressable
        onPressIn={reader ? undefined : show}
        onPressOut={reader ? undefined : hide}
        // someone listening to the phone cannot press and hold: for them a tap turns the card, and another turns it back
        onPress={reader ? () => (shown ? hide() : show()) : undefined}
        accessibilityRole="button"
        accessibilityLabel={t('games.couch.hold')}
        accessibilityState={{ selected: shown }}
        style={[styles.hold, { backgroundColor: shown ? colors.gold : colors.primary }]}
      >
        <Icon name="eye" size={22} color={shown ? colors.textOnGold : colors.textOnPrimary} />
        <Text style={[styles.holdText, { color: shown ? colors.textOnGold : colors.textOnPrimary }]}>{t('games.couch.hold')}</Text>
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
        <View key={i} style={[styles.dot, { backgroundColor: i < done ? colors.primary : i === done ? colors.gold : colors.controlTrack }]} />
      ))}
    </View>
  );
}

/** A clock for one moment of the round: it starts when the moment does, and says once that its time is up. */
function Countdown({ seconds, onEnd }: { seconds: number; onEnd: () => void }): React.JSX.Element {
  const { colors } = useTheme();
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
      <Text style={[styles.clockLeft, { color: low ? colors.danger : colors.textPrimary }]} accessibilityElementsHidden importantForAccessibility="no">
        {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
      </Text>
      <PartyTimer share={Math.max(0, endsAt - now) / (seconds * 1000)} low={low} label={t('games.party.timeLeft', { count: left })} />
    </View>
  );
}

function Clues({ game, onNext, onVote }: { game: CouchState; onNext: () => void; onVote: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const speaker = couchSpeaker(game)!;
  const at = game.turn % game.order.length;
  return (
    <>
      <Card style={styles.stage}>
        <Text style={[styles.phase, { color: colors.textSecondary }]}>{t('games.impostor.round', { round: speaker.round, rounds: game.settings.rounds })}</Text>
        <Text accessibilityLiveRegion="polite" accessibilityRole="header" style={[styles.speaker, { color: colors.textPrimary }]}>
          {t('games.couch.speaker', { name: game.players[speaker.seat]! })}
        </Text>
        <Text style={[styles.note, styles.center, { color: colors.textSecondary }]}>{t('games.couch.sayClue')}</Text>
        {game.settings.clueSeconds > 0 ? <Countdown key={game.turn} seconds={game.settings.clueSeconds} onEnd={onNext} /> : null}
        <View style={styles.order}>
          {game.order.map((seat, i) => (
            <View
              key={seat}
              accessible
              accessibilityLabel={game.players[seat]}
              accessibilityState={{ selected: i === at }}
              style={[styles.orderChip, { backgroundColor: i === at ? colors.gold : colors.controlTrack, opacity: i < at ? 0.5 : 1 }]}
            >
              <Text style={[styles.orderText, { color: i === at ? colors.textOnGold : colors.textPrimary }]} numberOfLines={1}>
                {game.players[seat]}
              </Text>
            </View>
          ))}
        </View>
      </Card>
      <ClayButton label={t('games.couch.next')} tone="primary" size="large" onPress={onNext} />
      <ClayButton label={t('games.couch.toVote')} variant="outline" onPress={onVote} />
    </>
  );
}

function Talk({ game, onVote }: { game: CouchState; onVote: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <>
      <Card style={styles.stage}>
        <Text accessibilityRole="header" style={[styles.speaker, { color: colors.textPrimary }]}>
          {t('games.couch.talk.title')}
        </Text>
        <Text style={[styles.note, styles.center, { color: colors.textSecondary }]}>{t('games.couch.talk.note')}</Text>
        <Countdown seconds={game.settings.talkSeconds} onEnd={onVote} />
      </Card>
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
      style={({ pressed }) => [styles.choice, { backgroundColor: colors.glassFill, borderColor: accent ? colors.gold : 'transparent', opacity: pressed ? 0.7 : 1 }]}
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
    Animated.timing(turn, { toValue: 1, duration: 520, useNativeDriver: true }).start();
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
  const face = turn.interpolate({ inputRange: [0, 0.5, 0.51, 1], outputRange: [0, 0, 1, 1] });
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

      <Card style={styles.stage}>
        <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>{t('games.impostor.reveal.title')}</Text>
        <Text style={[styles.cardWord, { color: colors.textPrimary, writingDirection: script.writingDirection }]}>{reveal.word}</Text>
        <Text style={[styles.cardMeaning, { color: colors.textSecondary }]}>{meaningIn(reveal.meanings, locale)}</Text>
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
      </Card>

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
  loading: { marginTop: spacing.xl },
  centered: { alignItems: 'center', gap: spacing.sm },
  blurb: { fontSize: typography.sizes.md, textAlign: 'center', lineHeight: 22 },
  round: { gap: spacing.md },
  count: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 0.6, textTransform: 'uppercase', textAlign: 'center' },
  form: { gap: spacing.md },
  names: { gap: spacing.sm },
  field: { gap: spacing.sm },
  note: { fontSize: typography.sizes.sm, lineHeight: 20 },
  center: { textAlign: 'center' },
  stretch: { alignSelf: 'stretch' },
  nameRow: { alignItems: 'center', gap: spacing.sm },
  nameN: { width: 28, height: 28, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  nameNText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
  // a text field is as wide as its text wants unless told it may be narrower: without that the row runs off the card
  nameInput: { flex: 1, minWidth: 0, minHeight: 48, fontSize: typography.sizes.md, borderRadius: radii.md, paddingHorizontal: 12 },
  nameRemove: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  pass: { alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.md },
  passTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, textAlign: 'center' },
  passDisc: { width: 96, height: 96, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  passDiscText: { fontSize: 44, fontWeight: typography.weights.bold },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: radii.pill },
  card: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 320,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: spacing.lg,
    borderWidth: 2,
    borderRadius: radii.lg,
  },
  cardLabel: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 0.6, textTransform: 'uppercase', textAlign: 'center' },
  cardHint: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, textAlign: 'center' },
  cardWord: { fontSize: 34, fontWeight: typography.weights.bold, marginTop: spacing.xs, textAlign: 'center' },
  cardMeaning: { fontSize: typography.sizes.sm, textAlign: 'center' },
  impostorLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  impostorText: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  hold: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radii.lg, paddingHorizontal: spacing.md },
  holdText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  stage: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  list: { gap: spacing.xs },
  phase: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 0.6, textTransform: 'uppercase' },
  speaker: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, textAlign: 'center' },
  clock: { alignSelf: 'stretch', alignItems: 'stretch', gap: spacing.xs },
  clockLeft: { fontSize: 44, fontWeight: typography.weights.bold, textAlign: 'center', fontVariant: ['tabular-nums'] },
  order: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.xs },
  orderChip: { maxWidth: 140, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill },
  orderText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  choices: { gap: spacing.sm },
  choice: { minHeight: 52, borderWidth: 1.5, borderRadius: radii.md, paddingHorizontal: spacing.md, justifyContent: 'center' },
  choiceText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, textAlign: 'center' },
  choiceWord: { fontSize: 20, fontWeight: typography.weights.bold, textAlign: 'center' },
  flips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  flipWrap: { width: 78, alignItems: 'center', gap: 4 },
  flip: { width: 72, height: 92, borderWidth: 1.5, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', padding: 4 },
  flipFace: { alignItems: 'center' },
  flipText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, textAlign: 'center' },
  // the tag is a longer word than most cards' own in several languages: a size down keeps it off the card's edge
  flipTag: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, textAlign: 'center' },
  flipName: { fontSize: typography.sizes.xs },
  whoWas: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, textAlign: 'center', marginTop: spacing.xs },
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
