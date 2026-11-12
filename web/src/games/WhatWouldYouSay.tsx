import { useCallback, useEffect, useState } from 'react';
import {
  CHARACTER_NAMES,
  dialectDirection,
  learnGame,
  meaningIn,
  type GameDialect,
  type ScenarioCorrection,
  type ScenarioHint,
  type ScenePlace,
  type WhatWouldYouSayItemView,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import {
  BusIcon,
  CafeIcon,
  DoctorIcon,
  HomeIcon,
  MarketIcon,
  PartyIcon,
  PhoneIcon,
  SchoolIcon,
  ShopIcon,
  StreetIcon,
  VillageIcon,
  WorkIcon,
} from '../components/icons';
import { SpeakingCharacter } from '../characters/SpeakingCharacter';
import { useI18n, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { play, soundPlayer } from '../lib/sound';
import { PlayButton } from '../learn/PlayButton';
import { Tile } from '../learn/Tile';
import { SoloGameShell, type SoloRound } from './SoloGameShell';
import { useAvailability, useGameDialect } from './soloRounds';
import { GameArt } from './GameArt';
import './scene.css';

/**
 * What Would You Say? (/app/games/what-would-you-say).
 *
 * The stage is a scene card: the place it happens in drawn large in the
 * game's colour, the situation in the reader's language, and the one who is
 * speaking — Hevalo, Hamo or Xezo — with their line in a speech bubble, said
 * in the voice it was recorded in, their mouth moving with it. Under it the
 * player answers in a bubble of their own: one of three or four real lines
 * (each a speech bubble on the player's side), or at the advanced level the
 * reply laid from its words as tiles.
 *
 * A wrong first try strikes the option out and says what it means, so the
 * player sees why it does not answer; tiles mark the first word out of place.
 * Once an item is done, every option is laid out with what it means and why
 * it fits or does not, the real reply first among them, with its recording
 * when there is one.
 *
 * Soranî reads right to left, and its bubbles and tiles with it. Nothing here
 * moves but the speaker's mouth and breath, which the character stills under
 * reduced motion except for the words themselves.
 */

type Round = SoloRound<WhatWouldYouSayItemView, ScenarioHint, ScenarioCorrection>;

const TONE = learnGame('what-would-you-say').tone;

type Glyph = (props: { size?: number }) => React.JSX.Element;

/** Where a scene is set, drawn from the icon set (shared SCENE_PLACES). */
export const PLACE_ICON: Record<ScenePlace, Glyph> = {
  home: HomeIcon,
  street: StreetIcon,
  market: MarketIcon,
  shop: ShopIcon,
  school: SchoolIcon,
  cafe: CafeIcon,
  bus: BusIcon,
  doctor: DoctorIcon,
  phone: PhoneIcon,
  village: VillageIcon,
  party: PartyIcon,
  work: WorkIcon,
};

export const PLACE_KEY: Record<ScenePlace, MessageKey> = {
  home: 'games.say.place.home',
  street: 'games.say.place.street',
  market: 'games.say.place.market',
  shop: 'games.say.place.shop',
  school: 'games.say.place.school',
  cafe: 'games.say.place.cafe',
  bus: 'games.say.place.bus',
  doctor: 'games.say.place.doctor',
  phone: 'games.say.place.phone',
  village: 'games.say.place.village',
  party: 'games.say.place.party',
  work: 'games.say.place.work',
};

/** The scene card: where, what is going on, who speaks, and their line in a bubble with its recording. */
function SceneCard({ item, dialect }: { item: WhatWouldYouSayItemView; dialect: GameDialect }): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const script = dialectDirection(dialect);
  const Place = item.place ? PLACE_ICON[item.place] : null;
  const who = item.speaker ? CHARACTER_NAMES[item.speaker] : null;
  const audio = item.line.audio;
  return (
    <figure className="ws-scene">
      <div className="ws-scene-head">
        {Place && (
          <span className="ws-place" aria-hidden>
            <Place size={34} />
          </span>
        )}
        <figcaption className="ws-scene-text">
          {item.place && <span className="ws-place-name">{t(PLACE_KEY[item.place])}</span>}
          <span className="ws-situation" lang={locale} dir="auto">
            {meaningIn(item.situation, locale) ?? item.situation.en}
          </span>
        </figcaption>
      </div>
      <div className="ws-stage">
        {item.speaker && (
          <SpeakingCharacter
            speaker={item.speaker}
            audio={soundPlayer}
            src={audio?.src ?? null}
            voice={audio?.voice ?? null}
            text={item.line.ku}
            crop="bust"
            decorative
            className="ws-speaker"
            onPress={audio ? () => play(audio.src) : undefined}
          />
        )}
        <div className="lesson-bubble ws-bubble" role="group" aria-label={who ? t('games.say.speaker', { name: who }) : t('games.say.someone')}>
          {audio && <PlayButton src={audio.src} label={t('games.say.listen')} round />}
          <p className="ws-line" lang={script.lang} dir={script.dir}>
            {item.line.ku}
          </p>
        </div>
      </div>
    </figure>
  );
}

/** Every option once an item is done: what it means, and why it fits or does not. */
function Explained({ correction, dialect }: { correction: ScenarioCorrection; dialect: GameDialect }): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const script = dialectDirection(dialect);
  const heard = meaningIn(correction.line.meanings, locale);
  return (
    <div className="ws-explained">
      {heard && <p className="ws-heard">{t('games.say.heard', { meaning: heard })}</p>}
      <ol className="ws-options-explained">
        {[...correction.options]
          .map((o, i) => ({ o, i }))
          .sort((a, b) => Number(b.o.fits) - Number(a.o.fits) || a.i - b.i)
          .map(({ o, i }) => (
            <li key={i} className={`ws-explain${o.fits ? ' is-fits' : ' is-not'}`}>
              <span className="ws-explain-badge">{t(o.fits ? 'games.say.fits' : 'games.say.fitsNot')}</span>
              <span className="ws-explain-line">
                {o.fits && correction.reply.audio && <PlayButton src={correction.reply.audio.src} label={t('games.say.playReply')} round />}
                <span className="ws-explain-ku" lang={script.lang} dir={script.dir}>
                  {o.ku}
                </span>
              </span>
              <span className="ws-explain-meaning" lang={locale} dir="auto">
                {meaningIn(o.meanings, locale) ?? o.meanings.en}
              </span>
              <span className="ws-explain-why">{meaningIn(o.why, locale) ?? t(o.fits ? 'games.say.whyFits' : 'games.say.whyNot')}</span>
            </li>
          ))}
      </ol>
    </div>
  );
}

/** Choosing a reply: each real line a bubble on the player's side; one ruled out after a wrong try, with what it means. */
function ChooseReply({ round, dialect }: { round: Round; dialect: GameDialect }): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const { item, result, busy, submit } = round;
  const script = dialectDirection(dialect);
  const [picked, setPicked] = useState<number | null>(null);
  const [ruledOut, setRuledOut] = useState<Array<{ at: number; meaning: string | null }>>([]);
  const done = result?.done === true;
  const locked = done || busy;

  useEffect(() => {
    setPicked(null);
    setRuledOut([]);
  }, [item.index]);

  useEffect(() => {
    const hint = result?.hint;
    if (hint && hint.ruledOut !== null) {
      const at = hint.ruledOut;
      setRuledOut((was) => (was.some((r) => r.at === at) ? was : [...was, { at, meaning: meaningIn(hint.meanings, locale) }]));
      setPicked(null);
    }
  }, [result, locale]);

  const right = done ? result?.correction?.options.findIndex((o) => o.fits) : -1;
  const chosen = done ? (result?.correction?.chosen ?? picked) : picked;

  return (
    <>
      <div className="ws-replies" role="group" aria-label={t('games.say.replies')}>
        {(item.options ?? []).map((option, i) => {
          const out = ruledOut.find((r) => r.at === i);
          const state = done ? (i === right ? 'is-right' : i === chosen ? 'is-wrong' : 'is-dim') : out ? 'is-out' : picked === i ? 'is-picked' : '';
          return (
            <div key={i} className="ws-reply-wrap">
              <button
                type="button"
                className={`ws-reply ${state}`}
                aria-pressed={!done && !out ? picked === i : undefined}
                disabled={locked || !!out}
                onClick={() => setPicked(i)}
              >
                <span lang={script.lang} dir={script.dir}>
                  {option}
                </span>
              </button>
              {out && !done && (
                <p className="ws-ruled-out" role="note">
                  {out.meaning ? t('games.say.ruledOut', { meaning: out.meaning }) : t('games.say.ruledOutPlain')}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {!done && (
        <div className="ws-actions">
          <Button onClick={() => picked !== null && void submit({ choice: picked })} disabled={locked || picked === null}>
            {result && !result.correct ? t('games.solo.tryAgain') : t('games.solo.check')}
          </Button>
        </div>
      )}
    </>
  );
}

/** Building the reply from its words at the advanced level: a line to lay them on and a tray, as Build a Kurdish Sentence has. */
function BuildReply({ round, dialect }: { round: Round; dialect: GameDialect }): React.JSX.Element {
  const t = useT();
  const { item, result, busy, submit } = round;
  const script = dialectDirection(dialect);
  const tiles = item.tiles ?? [];
  const [placed, setPlaced] = useState<number[]>([]);
  const [tried, setTried] = useState<string | null>(null);
  const done = result?.done === true;
  const locked = done || busy;

  useEffect(() => {
    setPlaced([]);
    setTried(null);
  }, [item.index]);

  const marked = result && !result.correct ? (done ? (result.correction?.firstWrong ?? null) : (result.hint?.firstWrong ?? null)) : null;
  const unchanged = tried === placed.join(',');
  const check = useCallback(() => {
    if (locked || placed.length === 0 || unchanged) return;
    setTried(placed.join(','));
    void submit({ order: placed });
  }, [locked, placed, submit, unchanged]);

  return (
    <>
      <div className={`ws-build-line${result?.correct ? ' is-settled' : ''}`} role="group" aria-label={t('games.say.line')} lang={script.lang} dir={script.dir}>
        {placed.map((i, at) => (
          <Tile
            key={i}
            state={result?.correct ? 'right' : marked === at && unchanged ? 'wrong' : 'idle'}
            disabled={locked}
            onClick={() => setPlaced((p) => p.filter((x) => x !== i))}
          >
            {tiles[i]}
          </Tile>
        ))}
      </div>
      {!done && marked !== null && unchanged && <p className="ws-hint">{marked >= placed.length ? t('games.sentence.hintMissing') : t('games.sentence.hint')}</p>}
      {!done && (
        <div className="ws-tray" role="group" aria-label={t('games.say.tray')} lang={script.lang} dir={script.dir}>
          {tiles.map((word, i) =>
            placed.includes(i) ? (
              <span key={i} className="tile-ghost" aria-hidden="true">
                {word}
              </span>
            ) : (
              <Tile key={i} disabled={locked} onClick={() => setPlaced((p) => [...p, i])}>
                {word}
              </Tile>
            ),
          )}
        </div>
      )}
      {!done && (
        <div className="ws-actions">
          <Button onClick={check} disabled={locked || placed.length === 0 || unchanged}>
            {result && !result.correct ? t('games.solo.tryAgain') : t('games.solo.check')}
          </Button>
        </div>
      )}
    </>
  );
}

function SceneBoard({ round, dialect }: { round: Round; dialect: GameDialect }): React.JSX.Element {
  const t = useT();
  const { item, result } = round;
  // the line is said as the scene comes up, once; its button says it again
  useEffect(() => {
    if (item.line.audio) play(item.line.audio.src);
  }, [item.index, item.line.audio]);
  const correction = result?.done ? result.correction : null;
  return (
    <div className={`ws-board lp-tone-${TONE}`}>
      <SceneCard item={item} dialect={dialect} />
      <h2 className="ws-ask">{t('games.say.prompt')}</h2>
      {item.tiles ? <BuildReply round={round} dialect={dialect} /> : <ChooseReply round={round} dialect={dialect} />}
      {correction && <Explained correction={correction} dialect={dialect} />}
    </div>
  );
}

export function WhatWouldYouSay(): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const dialect = useGameDialect();
  const availability = useAvailability(dialect);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void client.get<{ id: string | null }>(`/games/solo/open?game=what-would-you-say&dialect=${dialect}`).then((res) => {
      if (live && res.ok) setOpen(res.data.id);
    });
    return () => {
      live = false;
    };
  }, [client, dialect]);

  const game = availability?.games.find((g) => g.id === 'what-would-you-say');
  const difficulties = availability ? (game?.difficulties ?? []) : null;

  return (
    <div className="container solo-page">
      <SoloGameShell<WhatWouldYouSayItemView, ScenarioHint, ScenarioCorrection>
        game="what-would-you-say"
        dialect={dialect}
        title={t('games.say.name')}
        blurb={t('games.say.intro')}
        intro={<GameArt game="what-would-you-say" size={132} moving />}
        difficulties={difficulties}
        open={open}
        renderRound={(round) => <SceneBoard round={round} dialect={dialect} />}
        explain={(why) => (why === 'reply' ? t('games.say.why') : null)}
      />
    </div>
  );
}
