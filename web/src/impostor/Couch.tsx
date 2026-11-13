import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
  dialectDirection,
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
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { CaretDownIcon, ChatsIcon, CloseIcon, ImpostorIcon, PlusIcon, RedoIcon, SlidersIcon, TimerIcon } from '../components/icons';
import { Loading } from '../components/states';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { dialectName } from '../learn/map';
import { haptic } from '../lib/haptics';
import { prefersReducedMotion } from '../lib/motion';
import { ChipRadio } from '../play/ChipRadio';
import { PartyTimer } from '../party/PartyPage';
import { CategoryArt, EmblemArt, WayArt } from './art';
import { PictureRadio } from './PictureRadio';
import { WAY_KEY, WAY_NOTE } from './ways';
import './couch.css';

/**
 * Kurdish Impostor on one phone, passed round a room (/app/games/impostor?couch=1).
 *
 * The rules are shared/src/games/impostor/couch.ts; this is the phone's part
 * in them. It asks who is playing and how, fetches an evening's cards (approved
 * word cards, dealt by the server), and then walks the room through each round:
 * the phone handed to each player to read their card, the clues said out loud
 * in turn, the talk, the vote, the caught impostor's guess, and the cards
 * turned over, with the evening's score.
 *
 * What it is careful about, because one screen is shared by people who must
 * not see each other's cards:
 * - a card is on the screen only while its holder is pressing it; letting go,
 *   switching away from the page or the screen locking hides it;
 * - between two players there is always a screen that shows nothing, with the
 *   next player's name on it;
 * - the cards stay in memory for the evening and are never stored; the
 *   players' names are kept on this phone only, so the next evening starts
 *   with them, and are never sent anywhere;
 * - every draw comes from the browser's own random numbers, not a clock.
 *
 * A round played here earns nothing: the phone holds every card, so nothing it
 * could report about who won would be worth believing.
 */

const KEPT = 'hevalo.couch';
const VOTE_KEY: Record<CouchSettings['vote'], MessageKey> = { secret: 'games.couch.vote.secret', open: 'games.couch.vote.open' };
const LEVEL_KEY: Record<GameDifficulty, MessageKey> = {
  beginner: 'games.solo.difficulty.beginner',
  intermediate: 'games.solo.difficulty.intermediate',
  advanced: 'games.solo.difficulty.advanced',
};

/** What this phone remembers from the last evening: the names and how the game was set. Anything else it finds, it ignores. */
function readKept(): CouchKept | null {
  try {
    return couchKept(JSON.parse(localStorage.getItem(KEPT) ?? 'null'));
  } catch {
    return null;
  }
}

/** A seed for one round's draws, from the browser's own random numbers. */
function freshSeed(): string {
  const words = new Uint32Array(4);
  crypto.getRandomValues(words);
  return [...words].map((w) => w.toString(16).padStart(8, '0')).join('');
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

export function Couch(): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  // a way to play or a category chosen on the start page arrives in the address
  const [params] = useSearchParams();
  const askedWay = COUCH_WAYS.find((w) => w === params.get('way')) ?? null;
  const askedCategory = params.get('category');
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
    try {
      localStorage.setItem(KEPT, JSON.stringify({ names, settings } satisfies CouchKept));
    } catch {
      // a phone that will not keep them only asks for the names again next time
    }
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
    setEvening({ ...evening, deck, at, played: evening.played + 1, totals, game: couchStart(evening.dialect, evening.game.players, evening.game.settings, deck[at]!, freshSeed()) });
  }

  if (offers === null) return <Loading />;
  if (offers.length === 0) {
    return (
      <div className="state party-not-offered">
        <ImpostorIcon size={32} />
        <p>{t('games.impostor.notOffered')}</p>
        <Link to="/app/games/impostor" className="btn btn-secondary">
          {t('games.back')}
        </Link>
      </div>
    );
  }
  if (!evening) {
    return <Setup offers={offers} busy={busy} failed={failed} askedWay={askedWay} askedCategory={askedCategory} onStart={(...args) => void begin(...args)} />;
  }
  const play = (game: CouchState): void => setEvening({ ...evening, game });
  return (
    <div className="couch">
      <p className="couch-count">{t('games.couch.game', { n: evening.played })}</p>
      <Round game={evening.game} totals={evening.totals} busy={busy} failed={failed} play={play} onAnother={() => void another()} onChange={() => setEvening(null)} />
    </div>
  );
}

// ---------- who is playing, and how ----------

function Setup({
  offers,
  busy,
  failed,
  askedWay,
  askedCategory,
  onStart,
}: {
  offers: readonly CouchOffer[];
  busy: boolean;
  failed: boolean;
  /** a way to play chosen before the setup opened: it wins over the one this phone remembers */
  askedWay: CouchSettings['way'] | null;
  /** a category chosen before the setup opened, by its slug */
  askedCategory: string | null;
  onStart: (names: string[], settings: CouchSettings, dialect: GameDialect, difficulty: GameDifficulty, category: string | null) => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const [kept] = useState(readKept);
  const [names, setNames] = useState<string[]>(() => (kept && kept.names.length >= COUCH_MIN_PLAYERS ? kept.names : Array.from({ length: COUCH_MIN_PLAYERS + 1 }, () => '')));
  const [settings, setSettings] = useState<CouchSettings>(() => ({ ...(kept?.settings ?? COUCH_DEFAULTS), ...(askedWay ? { way: askedWay } : {}) }));
  const [dialect, setDialect] = useState<GameDialect>(offers[0]!.dialect);
  const [difficulty, setDifficulty] = useState<GameDifficulty | null>(null);
  const [category, setCategory] = useState(askedCategory ?? '');
  const [slip, setSlip] = useState<MessageKey | null>(null);

  const offer = offers.find((o) => o.dialect === dialect) ?? offers[0]!;
  const level = offer.difficulties.find((d) => d.difficulty === difficulty) ?? offer.difficulties[0]!;
  const chosenCategory = level.categories.some((c) => c.slug === category) ? category : '';
  const script = dialectDirection(offer.dialect);
  const set = <K extends keyof CouchSettings>(key: K, value: CouchSettings[K]): void => setSettings((s) => ({ ...s, [key]: value }));
  const canRemove = names.length > COUCH_MIN_PLAYERS, canAdd = names.length < COUCH_MAX_PLAYERS, roomForTwo = names.length >= COUCH_TWO_IMPOSTORS_FROM;
  // an empty box takes the name on its placeholder: "Player 3"
  const named = names.map((n, i) => (n.trim() === '' ? t('games.couch.playerName', { n: i + 1 }) : n));

  function start(): void {
    const checked = couchNames(named);
    if (!checked.ok) return setSlip(checked.reason === 'same' ? 'games.couch.names.same' : 'games.couch.names.empty');
    setSlip(null);
    onStart(checked.names, { ...settings, impostors: checked.names.length >= COUCH_TWO_IMPOSTORS_FROM ? settings.impostors : 1 }, offer.dialect, level.difficulty, chosenCategory || null);
  }

  const clueNow = settings.clueSeconds === 0 ? t('games.couch.noClock') : t('games.party.seconds', { count: settings.clueSeconds });
  const talkNow = settings.talkSeconds === 0 ? t('games.couch.noClock') : t('games.couch.minutes', { count: settings.talkSeconds / 60 });

  return (
    <form
      className="couch-setup"
      onSubmit={(e) => {
        e.preventDefault();
        start();
      }}
    >
      <p className="page-sub couch-lead">{t('games.couch.blurb')}</p>

      <div className="couch-step">
        <fieldset className="couch-players">
          <legend className="couch-step-title">
            <span className="couch-step-n" aria-hidden="true">
              1
            </span>
            {t('games.couch.players')}
          </legend>
          <ol className="couch-names">
            {names.map((name, i) => (
              <li key={i} className="couch-name">
                <span className="couch-name-n" aria-hidden="true">
                  {name.trim() === '' ? i + 1 : name.trim().slice(0, 1).toUpperCase()}
                </span>
                <input
                  className="input"
                  value={name}
                  maxLength={COUCH_NAME_MAX}
                  placeholder={t('games.couch.playerName', { n: i + 1 })}
                  aria-label={t('games.couch.playerName', { n: i + 1 })}
                  autoComplete="off"
                  enterKeyHint="next"
                  onChange={(e) => setNames(names.map((n, j) => (j === i ? e.target.value : n)))}
                />
                {canRemove && (
                  <button type="button" className="couch-name-remove" aria-label={t('games.couch.removePlayer', { name: named[i]! })} onClick={() => setNames(names.filter((_, j) => j !== i))}>
                    <CloseIcon size={18} />
                  </button>
                )}
              </li>
            ))}
          </ol>
          {canAdd && (
            <Button type="button" variant="secondary" size="sm" className="couch-add" onClick={() => setNames([...names, ''])}>
              <PlusIcon size={16} />
              {t('games.couch.addPlayer')}
            </Button>
          )}
          {slip && (
            <p className="party-hint" role="alert">
              {t(slip)}
            </p>
          )}
        </fieldset>
      </div>

      <div className="couch-step">
        <PictureRadio
          step={2}
          label={t('games.couch.way')}
          layout="cards"
          value={settings.way}
          onChange={(v) => set('way', v)}
          options={COUCH_WAYS.map((w) => ({ value: w, label: t(WAY_KEY[w]), hint: t(WAY_NOTE[w]), art: <WayArt way={w} size={60} />, tone: impostorWayTone(w) }))}
        />
        {roomForTwo && (
          <ChipRadio label={t('games.couch.impostors')} value={settings.impostors} onChange={(v) => set('impostors', v)} options={([1, 2] as const).map((n) => ({ value: n, label: String(n) }))} />
        )}
      </div>

      <div className="couch-step">
        {level.categories.length > 0 && (
          <PictureRadio
            step={3}
            label={t('games.impostor.category')}
            layout="tiles"
            value={chosenCategory}
            onChange={setCategory}
            first={12}
            moreLabel={(count) => t('common.showMoreCount', { count })}
            options={[
              { value: '', label: t('games.couch.anyCategory'), art: <CategoryArt category={null} size={52} />, tone: impostorCategoryTone(null) },
              ...impostorCategoriesInOrder(level.categories).map((c) => ({
                value: c.slug,
                label: c.ku,
                hint: meaningIn(c.meanings, locale) ?? undefined,
                lang: script.lang,
                art: <CategoryArt category={c.slug} size={52} />,
                tone: impostorCategoryTone(c.slug),
              })),
            ]}
          />
        )}
        {offers.length > 1 && (
          <ChipRadio label={t('games.dialect')} value={offer.dialect} onChange={setDialect} options={offers.map((o) => ({ value: o.dialect, label: dialectName(o.dialect) }))} />
        )}
        {offer.difficulties.length > 1 && (
          <ChipRadio
            label={t('games.party.level')}
            value={level.difficulty}
            onChange={setDifficulty}
            options={offer.difficulties.map((d) => ({ value: d.difficulty, label: t(LEVEL_KEY[d.difficulty]) }))}
          />
        )}
      </div>

      {/* the rules have sensible answers already: they wait folded, saying what they are set to */}
      <details className="couch-rules">
        <summary className="couch-rules-head">
          <span className="couch-rules-title">
            <SlidersIcon size={18} />
            {t('games.couch.rules')}
          </span>
          <span className="couch-rules-now" aria-hidden="true">
            <span>
              <RedoIcon size={14} />
              {settings.rounds}
            </span>
            <span>
              <TimerIcon size={14} />
              {clueNow}
            </span>
            <span>
              <ChatsIcon size={14} />
              {talkNow}
            </span>
          </span>
          <span className="couch-rules-caret" aria-hidden="true">
            <CaretDownIcon size={16} />
          </span>
        </summary>
        <div className="couch-rules-body">
          <ChipRadio label={t('games.couch.rounds')} value={settings.rounds} onChange={(v) => set('rounds', v)} options={COUCH_ROUNDS.map((n) => ({ value: n, label: String(n) }))} />
          <ChipRadio
            label={t('games.impostor.clueTime')}
            value={settings.clueSeconds}
            onChange={(v) => set('clueSeconds', v)}
            options={COUCH_CLUE_SECONDS.map((sec) => ({ value: sec, label: sec === 0 ? t('games.couch.noClock') : t('games.party.seconds', { count: sec }) }))}
          />
          <ChipRadio
            label={t('games.couch.talkTime')}
            value={settings.talkSeconds}
            onChange={(v) => set('talkSeconds', v)}
            options={COUCH_TALK_SECONDS.map((sec) => ({ value: sec, label: sec === 0 ? t('games.couch.noClock') : t('games.couch.minutes', { count: sec / 60 }) }))}
          />
          <ChipRadio label={t('games.impostor.vote.phase')} value={settings.vote} onChange={(v) => set('vote', v)} options={COUCH_VOTES.map((v) => ({ value: v, label: t(VOTE_KEY[v]) }))} />
        </div>
      </details>

      <div className="couch-go">
        {failed && (
          <p className="party-hint" role="alert">
            {t('games.couch.failed')}
          </p>
        )}
        <Button type="submit" size="lg" block disabled={busy} className="couch-deal-btn">
          {busy ? t('games.couch.dealing') : t('games.couch.start')}
        </Button>
        <p className="couch-note muted">{t('games.couch.noPay')}</p>
      </div>
    </form>
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
}: {
  game: CouchState;
  totals: readonly number[];
  busy: boolean;
  failed: boolean;
  play: (next: CouchState) => void;
  onAnother: () => void;
  onChange: () => void;
}): React.JSX.Element {
  const reader = couchReader(game);
  if (game.phase === 'deal' && reader !== null) return <Deal key={reader} game={game} seat={reader} onSeen={() => play(couchSeen(game))} />;
  if (game.phase === 'clues') return <Clues game={game} onNext={() => play(couchNextClue(game))} onVote={() => play(couchToVote(game))} />;
  if (game.phase === 'talk') return <Talk game={game} onVote={() => play(couchToVote(game))} />;
  if (game.phase === 'vote') {
    const voter = couchVoter(game);
    return voter === null ? <OpenVote game={game} onPoint={(seat) => play(couchPoint(game, seat))} /> : <SecretVote key={voter} game={game} voter={voter} onVote={(seat) => play(couchCastVote(game, seat))} />;
  }
  if (game.phase === 'guess') return <Guess game={game} onGuess={(option) => play(couchGuess(game, option))} />;
  return <Reveal game={game} totals={totals} busy={busy} failed={failed} onAnother={onAnother} onChange={onChange} />;
}

/** The screen between two players: nothing on it but whose turn it is to hold the phone. */
function PassTo({ name, onMine }: { name: string; onMine: () => void }): React.JSX.Element {
  const t = useT();
  return (
    <div className="couch-pass">
      <span className="couch-pass-disc" aria-hidden="true">
        {name.slice(0, 1).toUpperCase()}
      </span>
      <p className="couch-pass-title">{t('games.couch.passTo', { name })}</p>
      <Button size="lg" block onClick={onMine}>
        {t('games.couch.iAm', { name })}
      </Button>
    </div>
  );
}

function Deal({ game, seat, onSeen }: { game: CouchState; seat: number; onSeen: () => void }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const name = game.players[seat]!;
  const [mine, setMine] = useState(false);
  const [shown, setShown] = useState(false);
  const [seen, setSeen] = useState(false);
  const script = dialectDirection(game.dialect);
  const hand = couchHand(game, seat);

  // the card goes face down the moment the page is not the one in front: another app, the lock screen, another tab
  useEffect(() => {
    const hide = (): void => setShown(false);
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('blur', hide);
    };
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
    setShown(true);
    setSeen(true);
  };
  const hide = (): void => setShown(false);
  return (
    <div className="couch-deal">
      <Progress done={game.dealt} of={game.players.length} />
      <div className={`couch-card${shown ? ' is-face' : ' is-back'}${shown && hand.role === 'impostor' ? ' is-impostor' : ''}`} role="group" aria-label={t('games.couch.cardOf', { name })}>
        {!shown ? (
          <span className="couch-card-back" aria-hidden="true">
            <EmblemArt emblem="mask" size={148} />
          </span>
        ) : (
          <div className="couch-card-face">
            {hand.hint && (
              <div className="couch-card-top">
                <CategoryArt category={hand.hint.category ?? 'category'} size={44} />
                <div>
                  <p className="imp-card-label">{t('games.impostor.category')}</p>
                  <p className="imp-card-hint">
                    <span lang={script.lang} dir={script.dir}>
                      {hand.hint.ku}
                    </span>
                    <span className="imp-card-meaning"> · {meaningIn(hand.hint.meanings, locale)}</span>
                  </p>
                </div>
              </div>
            )}
            {hand.role === 'player' ? (
              <div className="couch-card-main">
                <p className="imp-card-word" lang={script.lang} dir={script.dir}>
                  {hand.word}
                </p>
                <p className="imp-card-meaning">{meaningIn(hand.meanings, locale)}</p>
              </div>
            ) : (
              <div className="couch-card-main">
                <EmblemArt emblem="mask" size={72} />
                <p className="imp-card-word is-impostor">{t('games.impostor.youAreImpostor')}</p>
                <p className="imp-card-meaning">{t('games.impostor.blendIn')}</p>
              </div>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        className={`couch-hold${shown ? ' is-held' : ''}`}
        aria-pressed={shown}
        onPointerDown={(e) => {
          e.preventDefault();
          show();
        }}
        onPointerUp={hide}
        onPointerCancel={hide}
        onPointerLeave={hide}
        onKeyDown={(e) => {
          if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) show();
        }}
        onKeyUp={hide}
        onBlur={hide}
        onContextMenu={(e) => e.preventDefault()}
      >
        {t('games.couch.hold')}
      </button>
      <p className="couch-note couch-centre muted">{t('games.couch.holdNote')}</p>
      <Button size="lg" block variant="secondary" disabled={!seen || shown} onClick={onSeen}>
        {t('games.couch.seen')}
      </Button>
    </div>
  );
}

/** How far the phone has got round the room, as dots. */
function Progress({ done, of }: { done: number; of: number }): React.JSX.Element {
  return (
    <ol className="couch-dots" aria-hidden="true">
      {Array.from({ length: of }, (_, i) => (
        <li key={i} className={i < done ? 'is-done' : i === done ? 'is-now' : ''} />
      ))}
    </ol>
  );
}

/** A clock for one moment of the round: it starts when the moment does, and says once that its time is up. */
function Countdown({ seconds, onEnd }: { seconds: number; onEnd: () => void }): React.JSX.Element {
  const t = useT();
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
  return (
    <div className="couch-clock">
      <p className={`couch-clock-left${left <= 5 ? ' is-low' : ''}`} aria-hidden="true">
        {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
      </p>
      <PartyTimer startedAt={new Date(from).toISOString()} endsAt={new Date(endsAt).toISOString()} now={now} low={left <= 5} label={t('games.party.timeLeft', { count: left })} />
    </div>
  );
}

function Clues({ game, onNext, onVote }: { game: CouchState; onNext: () => void; onVote: () => void }): React.JSX.Element {
  const t = useT();
  const speaker = couchSpeaker(game)!;
  return (
    <div className="couch-clues">
      <div className="couch-stage">
        <p className="imp-phase">{t('games.impostor.round', { round: speaker.round, rounds: game.settings.rounds })}</p>
        <p className="couch-speaker" aria-live="polite">
          {t('games.couch.speaker', { name: game.players[speaker.seat]! })}
        </p>
        <p className="couch-note">{t('games.couch.sayClue')}</p>
        {game.settings.clueSeconds > 0 && <Countdown key={game.turn} seconds={game.settings.clueSeconds} onEnd={onNext} />}
        <ol className="couch-order">
          {game.order.map((seat, i) => {
            const at = game.turn % game.order.length;
            return (
              <li key={seat} className={i === at ? 'is-now' : i < at ? 'is-done' : ''} aria-current={i === at ? 'true' : undefined}>
                {game.players[seat]}
              </li>
            );
          })}
        </ol>
      </div>
      <Button size="lg" block onClick={onNext}>
        {t('games.couch.next')}
      </Button>
      <Button variant="ghost" block onClick={onVote}>
        {t('games.couch.toVote')}
      </Button>
    </div>
  );
}

function Talk({ game, onVote }: { game: CouchState; onVote: () => void }): React.JSX.Element {
  const t = useT();
  return (
    <div className="couch-talk">
      <div className="couch-stage">
        <p className="couch-speaker">{t('games.couch.talk.title')}</p>
        <p className="couch-note">{t('games.couch.talk.note')}</p>
        <Countdown seconds={game.settings.talkSeconds} onEnd={onVote} />
      </div>
      <Button size="lg" block onClick={onVote}>
        {t('games.couch.toVote')}
      </Button>
    </div>
  );
}

function SecretVote({ game, voter, onVote }: { game: CouchState; voter: number; onVote: (seat: number | null) => void }): React.JSX.Element {
  const t = useT();
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
    <section className="couch-vote" aria-labelledby="couch-vote-title">
      <Progress done={game.votes.length} of={game.players.length} />
      <h2 id="couch-vote-title" className="couch-speaker">
        {t('games.couch.voteOf', { name })}
      </h2>
      <div className="imp-vote-options">
        {game.players.map((other, seat) =>
          seat === voter ? null : (
            <Button key={seat} variant="secondary" onClick={() => onVote(seat)}>
              {t('games.impostor.vote.pick', { name: other })}
            </Button>
          ),
        )}
      </div>
      <Button variant="ghost" block onClick={() => onVote(null)}>
        {t('games.couch.noChoice')}
      </Button>
    </section>
  );
}

function OpenVote({ game, onPoint }: { game: CouchState; onPoint: (seat: number | null) => void }): React.JSX.Element {
  const t = useT();
  return (
    <section className="couch-vote" aria-labelledby="couch-point-title">
      <h2 id="couch-point-title" className="couch-speaker">
        {t('games.couch.point.title')}
      </h2>
      <p className="couch-note muted">{t('games.couch.point.pick')}</p>
      <div className="imp-vote-options">
        {game.players.map((name, seat) => (
          <Button key={seat} variant="secondary" onClick={() => onPoint(seat)}>
            {name}
          </Button>
        ))}
      </div>
      <Button variant="ghost" block onClick={() => onPoint(null)}>
        {t('games.couch.point.none')}
      </Button>
    </section>
  );
}

function Guess({ game, onGuess }: { game: CouchState; onGuess: (option: number) => void }): React.JSX.Element {
  const t = useT();
  const [mine, setMine] = useState(false);
  const script = dialectDirection(game.dialect);
  const name = game.players[game.accused ?? 0]!;
  if (!mine) {
    return (
      <div className="couch-pass">
        <p className="imp-caught">{t('games.couch.guessPass', { name })}</p>
        <Button size="lg" block onClick={() => setMine(true)}>
          {t('games.couch.iAm', { name })}
        </Button>
      </div>
    );
  }
  return (
    <section className="imp-guess" aria-labelledby="couch-guess-title">
      <h2 id="couch-guess-title" className="couch-speaker">
        {t('games.impostor.guessPrompt')}
      </h2>
      <div className="imp-guess-options">
        {game.options.map((option, i) => (
          <Button key={`${option}:${i}`} variant="secondary" className="imp-guess-option" onClick={() => onGuess(i)}>
            <span lang={script.lang} dir={script.dir}>
              {option}
            </span>
          </Button>
        ))}
      </div>
    </section>
  );
}

function Reveal({
  game,
  totals,
  busy,
  failed,
  onAnother,
  onChange,
}: {
  game: CouchState;
  totals: readonly number[];
  busy: boolean;
  failed: boolean;
  onAnother: () => void;
  onChange: () => void;
}): React.JSX.Element | null {
  const t = useT();
  const locale = useLocale();
  const [still] = useState(prefersReducedMotion);
  const [turned, setTurned] = useState(still);
  const reveal = couchReveal(game);
  const won = reveal ? reveal.endedBy !== 'escaped' : false;
  useEffect(() => {
    haptic(won ? 'celebrate' : 'wrong');
    if (still) return;
    const frame = requestAnimationFrame(() => setTurned(true));
    return () => cancelAnimationFrame(frame);
  }, [still, won]);
  if (!reveal) return null;
  const script = dialectDirection(game.dialect);
  const round = couchScores(game);
  const sum = couchTotals(totals, game);
  const board = game.players.map((name, seat) => ({ name, seat, round: round[seat] ?? 0, total: sum[seat] ?? 0 })).sort((a, b) => b.total - a.total || a.seat - b.seat);
  const who = reveal.impostors.map((seat) => game.players[seat]!);
  const end: MessageKey =
    reveal.endedBy === 'escaped' ? 'games.impostor.end.escaped' : reveal.endedBy === 'guessed' ? 'games.impostor.end.guessed' : game.settings.way === 'odd' ? 'games.couch.end.oddCaught' : 'games.impostor.end.caught';
  return (
    <div className={`imp-reveal couch-reveal${still ? ' is-still' : ''}`}>
      <ol className="imp-reveal-cards" aria-label={t('games.impostor.table')}>
        {game.players.map((name, seat) => {
          const hidden = reveal.impostors.includes(seat);
          return (
            <li key={seat} className={`imp-flip${turned ? ' is-turned' : ''}${hidden ? ' is-impostor' : ''}`} style={{ ['--i' as string]: seat }}>
              <span className="imp-flip-inner">
                <span className="imp-flip-back" aria-hidden="true" />
                <span className="imp-flip-face">
                  {hidden ? (
                    <>
                      <ImpostorIcon size={20} />
                      <span>{t('games.impostor.impostorTag')}</span>
                    </>
                  ) : (
                    <span lang={script.lang} dir={script.dir}>
                      {reveal.word}
                    </span>
                  )}
                </span>
              </span>
              <span className="imp-flip-name">{name}</span>
            </li>
          );
        })}
      </ol>
      <div className="imp-reveal-word">
        <p className="imp-card-label">{t('games.impostor.reveal.title')}</p>
        <p className="imp-card-word" lang={script.lang} dir={script.dir}>
          {reveal.word}
        </p>
        <p className="imp-card-meaning">{meaningIn(reveal.meanings, locale)}</p>
      </div>
      <p className="imp-reveal-who">
        {who.length === 1 ? t('games.impostor.reveal.impostor', { name: who[0]! }) : t('games.couch.reveal.impostors', { names: new Intl.ListFormat(locale, { type: 'conjunction' }).format(who) })}
      </p>
      {reveal.twin && (
        <p className="muted">
          {t('games.couch.reveal.odd')}{' '}
          <span lang={script.lang} dir={script.dir}>
            {reveal.twin.word}
          </span>{' '}
          · {meaningIn(reveal.twin.meanings, locale)}
        </p>
      )}
      <p className="muted">{t(end)}</p>
      {reveal.guessed && (
        <p className="muted">
          {t('games.impostor.guessedWith')}{' '}
          <span lang={script.lang} dir={script.dir}>
            {reveal.guessed}
          </span>
        </p>
      )}
      {reveal.votes.length > 0 && (
        <section aria-labelledby="couch-votes-title">
          <h3 id="couch-votes-title" className="imp-section-title">
            {t('games.impostor.votes')}
          </h3>
          <ul className="imp-votes">
            {reveal.votes.map((suspect, voter) => (
              <li key={voter}>
                {suspect === null ? t('games.impostor.noVote', { name: game.players[voter]! }) : t('games.impostor.votedFor', { name: game.players[voter]!, target: game.players[suspect]! })}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="couch-score-wrap">
        <table className="couch-score">
          <thead>
            <tr>
              <th scope="col">{t('games.couch.players')}</th>
              <th scope="col">{t('games.couch.roundPoints')}</th>
              <th scope="col">{t('games.couch.total')}</th>
            </tr>
          </thead>
          <tbody>
            {board.map((row) => (
              <tr key={row.seat} className={reveal.impostors.includes(row.seat) ? 'is-impostor' : ''}>
                <th scope="row">{row.name}</th>
                <td>{row.round > 0 ? `+${row.round}` : '0'}</td>
                <td>{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {failed && (
        <p className="party-hint" role="alert">
          {t('games.couch.failed')}
        </p>
      )}
      <Button size="lg" block disabled={busy} onClick={onAnother}>
        {busy ? t('games.couch.dealing') : t('games.couch.nextRound')}
      </Button>
      <Button variant="secondary" block onClick={onChange}>
        {t('games.couch.change')}
      </Button>
      <Link to="/app/games/impostor" className="btn btn-ghost btn-block">
        {t('games.couch.finish')}
      </Link>
    </div>
  );
}
