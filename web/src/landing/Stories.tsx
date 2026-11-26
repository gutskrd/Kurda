import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  DEFAULT_PAPER,
  LETTER_BIRD_FEET,
  LETTER_FLIGHT,
  LETTER_SILL,
  fireLevel,
  letterBirdSvg,
  letterEnvelopeSvg,
  letterWindowSvg,
  paperColors,
  stampOutline,
  stampShapeFor,
  type PigeonPose,
} from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { CheckIcon, LockIcon, PauseIcon, PlayIcon } from '../components/icons';
import { Fire } from '../components/Fire';
import { SpeakingCharacter } from '../characters/SpeakingCharacter';
import { InviteCardBody } from '../ui/InviteCardBody';
import { ticketClass } from '../ui/Ticket';
import { useAvatarSrc } from '../art/overrides';
import { useDarkPage } from '../theme/useDarkPage';
import { prefersReducedMotion } from '../lib/motion';
import { BATTLE_GUESSES, HEVAL, LETTER, PEOPLE, ROAD_UNIT, WELL_DONE } from './samples';
import { Ku } from './parts';

/**
 * Three short scenes that play themselves, one after another, under tabs that fill as each plays: a friend's game, a
 * pen pal's letter arriving by pigeon, and the road stamped lesson by lesson. Each scene is timed in the stylesheet
 * (`--at` on each beat), so pausing stops everything at once; the scenes run only while on screen in a tab in front,
 * and a tab or the pause button takes over. Under Reduce Motion nothing plays: each scene shows how it ends, and the
 * tabs choose between them. Each scene is one picture to a screen reader, described in a sentence.
 */

type Beat = CSSProperties;
/** A beat's moment in its scene, in seconds. */
const at = (s: number, extra?: Record<string, string | number>): Beat => ({ '--at': `${s}s`, ...extra }) as Beat;

const STORIES: ReadonlyArray<{ id: string; tab: MessageKey; label: MessageKey; ms: number; Scene: () => React.JSX.Element }> = [
  { id: 'game', tab: 'landing.stories.game', label: 'landing.story.game.label', ms: 9500, Scene: GameScene },
  { id: 'letter', tab: 'landing.stories.letter', label: 'landing.story.letter.label', ms: 9500, Scene: LetterScene },
  { id: 'road', tab: 'landing.stories.road', label: 'landing.story.road.label', ms: 8500, Scene: RoadScene },
];

export function StoryPlayer(): React.JSX.Element {
  const t = useT();
  const id = useId().replace(/[^A-Za-z0-9]/g, '');
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const [still] = useState(prefersReducedMotion);
  const [seen, setSeen] = useState(false);
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const root = useRef<HTMLDivElement>(null);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => setSeen(entries[entries.length - 1]?.isIntersecting ?? false), { threshold: 0.35 });
    io.observe(el);
    const onVisible = (): void => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const playing = !still && !held && seen && !hidden;
  const story = STORIES[index]!;
  const go = (i: number, focus = false): void => {
    const next = (i + STORIES.length) % STORIES.length;
    setIndex(next);
    if (focus) tabs.current[next]?.focus();
  };
  const onKey = (e: React.KeyboardEvent): void => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    const dir = document.documentElement.dir === 'rtl' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') ? -1 : 1;
    if (step) {
      e.preventDefault();
      go(index + step * dir, true);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      go(e.key === 'Home' ? 0 : STORIES.length - 1, true);
    }
  };

  return (
    <div ref={root} className={`fp-player${playing ? '' : ' is-paused'}${still ? ' is-still' : ''}`} style={{ '--story-ms': `${story.ms}ms` } as CSSProperties}>
      <div className="fp-player-bar">
        <div className="fp-segs" role="tablist" aria-label={t('landing.stories.label')} onKeyDown={onKey}>
          {STORIES.map((s, i) => (
            <button
              key={s.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${s.id}`}
              aria-selected={i === index}
              aria-controls={`${id}-panel`}
              tabIndex={i === index ? 0 : -1}
              className={`fp-seg${i < index ? ' is-past' : i === index ? ' is-on' : ''}`}
              onClick={() => go(i)}
            >
              <span className="fp-seg-label">{t(s.tab)}</span>
              <span className="fp-seg-bar" aria-hidden="true">
                <span
                  className="fp-seg-fill"
                  key={i === index ? `on-${index}` : 'off'}
                  onAnimationEnd={i === index && !still ? () => go(index + 1) : undefined}
                />
              </span>
            </button>
          ))}
        </div>
        {!still && (
          <button
            type="button"
            className="fp-player-hold"
            aria-label={t(held ? 'landing.stories.play' : 'landing.stories.pause')}
            onClick={() => setHeld((h) => !h)}
          >
            {held ? <PlayIcon size={16} /> : <PauseIcon size={16} />}
          </button>
        )}
      </div>
      <div className="fp-stage" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${story.id}`}>
        <div className="fp-scene" role="img" aria-label={t(story.label)} key={story.id}>
          <story.Scene />
        </div>
      </div>
      <p className="fp-player-note">{t('landing.stories.note')}</p>
    </div>
  );
}

/* ---- A friend's game ------------------------------------------------------ */

function Face({ src, size }: { src: string; size: number }): React.JSX.Element {
  const face = useAvatarSrc(src) ?? src;
  return <img className="fp-face" src={face} alt="" width={size} height={size} loading="lazy" decoding="async" />;
}

/** Rojîn's invite arrives in your chat, you join, both of you race for the word, and you get it in three. */
function GameScene(): React.JSX.Element {
  const t = useT();
  return (
    <div className="fp-sc fp-sc--game">
      <div className="fp-chat-head">
        <Face src={PEOPLE.rojin.avatar} size={32} />
        <span className="fp-chat-name">{PEOPLE.rojin.name}</span>
        <span className="fp-online" />
      </div>
      {/* The messages move up as the last ones arrive, as a chat does. */}
      <div className="fp-sc-col" style={at(6, { '--up': '-168px' })}>
      <div className="fp-chat-slot">
        <span className="fp-typing fp-blip" style={at(0.3, { '--out': '1.3s' })}>
          <i />
          <i />
          <i />
        </span>
        <div className={`fp-b ${ticketClass('wordle-battle', 'row', 'invite-card')} fp-invite`} style={at(1.3)}>
          <InviteCardBody type="wordle-battle" game={t('games.battle.name')} blurb={t('games.invite.blurb.battle')} action={t('games.battle.join')} />
        </div>
      </div>
      <div className="fp-race fp-b" style={at(2.6)}>
        <span className="fp-race-who">
          <Face src={PEOPLE.you.avatar} size={22} />
          <span>{t('games.you')}</span>
          <span className="fp-race-bar">
            <span className="fp-race-fill is-you" style={at(2.8)} />
          </span>
        </span>
        <span className="fp-race-who">
          <Face src={PEOPLE.rojin.avatar} size={22} />
          <span>{PEOPLE.rojin.name}</span>
          <span className="fp-race-bar">
            <span className="fp-race-fill is-friend" style={at(2.8)} />
          </span>
        </span>
      </div>
      <div className="fp-gboard fp-b" style={at(2.6)}>
        {BATTLE_GUESSES.map((g, r) => (
          <span className="fp-grow" key={g.word} style={at(3 + r * 1.1)}>
            {g.marks.map((m, i) => (
              <span className="fp-gtile" key={i}>
                <span className={`fp-gface is-${m}`} style={{ '--i': i } as CSSProperties}>
                  {g.word[i]}
                </span>
              </span>
            ))}
          </span>
        ))}
      </div>
      <div className="fp-gresult fp-b" style={at(6.2)}>
        <span>
          <Ku className="fp-gresult-word">{HEVAL}</Ku>
          <span className="fp-gresult-gloss">{t('landing.gloss.heval')}</span>
        </span>
        <span className="fp-gresult-won">{t('games.battle.solvedIn', { count: 3 })}</span>
      </div>
      <p className="fp-bubble fp-b" style={at(7.3)}>
        <Ku className="fp-bubble-ku">{WELL_DONE.ku}</Ku>
        <span className="fp-bubble-gloss">{t(WELL_DONE.gloss)}</span>
      </p>
      </div>
    </div>
  );
}

/* ---- A letter by pigeon --------------------------------------------------- */

/** Dilan's bird: a blue one from the letters pages' set. */
const DILAN_BIRD = 1;

/**
 * The flight in through the window: the letters pages' own flight off the sill (shared `LETTER_FLIGHT`), backwards, as
 * keyframes on the window's width (`--win`).
 */
function arrivalKeyframes(name: string): string {
  const keys = [...LETTER_FLIGHT.keys].reverse();
  const steps = keys.map((k) => {
    const pct = ((1 - k.at) * 100).toFixed(1);
    return `${pct}%{transform:translate(calc(var(--win) * ${k.x}), calc(var(--win) * ${k.y})) scale(${k.scale});opacity:${k.seen}}`;
  });
  return `@keyframes ${name}{${steps.join('')}}`;
}

/** Dilan's pigeon flies in through your window with a letter, sets it down, and the letter opens and reads itself. */
function LetterScene(): React.JSX.Element {
  const t = useT();
  const dark = useDarkPage();
  const id = useId().replace(/[^A-Za-z0-9]/g, '');
  const art = useMemo(() => {
    const bird = (pose: PigeonPose, letter: boolean): { __html: string } => ({
      __html: letterBirdSvg({ bird: DILAN_BIRD, pose, letter, facingLeft: true, shadow: false, size: 120, idPrefix: `lb${id}${pose}${letter ? 'l' : ''}` }),
    });
    return {
      window: { __html: letterWindowSvg({ sky: dark ? 'dusk' : 'day', size: 240, idPrefix: `lw${id}` }) },
      up: bird('wings-up', true),
      down: bird('wings-down', true),
      holding: bird('perched', true),
      perched: bird('perched', false),
      happy: bird('happy', false),
      envelope: { __html: letterEnvelopeSvg({ size: 60, idPrefix: `le${id}` }) },
      flight: arrivalKeyframes(`fp-arrive-${id}`),
    };
  }, [dark, id]);
  // The bird's square stands on the sill as the letters pages stand it: its feet on the sill's line.
  const sill = { x: LETTER_SILL.x / 120, y: LETTER_SILL.y / 120 };
  const feet = { x: LETTER_BIRD_FEET.x / 120, y: LETTER_BIRD_FEET.y / 120 };
  const paper = paperColors({ ...DEFAULT_PAPER, style: 'plain' });
  const place = {
    '--fp-paper': paper.sheet,
    '--fp-paper-ink': paper.ink,
    '--fp-paper-muted': paper.muted,
    '--bird-x': `calc(var(--win) * ${sill.x} - var(--bird) * ${feet.x})`,
    '--bird-y': `calc(var(--win) * ${sill.y} - var(--bird) * ${feet.y})`,
    '--feet': `${(feet.x * 100).toFixed(1)}% ${(feet.y * 100).toFixed(1)}%`,
    '--arrive': `fp-arrive-${id}`,
    '--arrive-ms': `${LETTER_FLIGHT.ms}ms`,
    '--beat-ms': `${LETTER_FLIGHT.beatMs}ms`,
  } as CSSProperties;
  return (
    <div className="fp-sc fp-sc--letter" style={place}>
      <style>{art.flight}</style>
      <div className="fp-window">
        <span className="fp-window-art" dangerouslySetInnerHTML={art.window} />
        <span className="fp-pigeon">
          <span className="fp-pigeon-flight" style={at(0.4, { '--out': `${0.4 + LETTER_FLIGHT.ms / 1000}s` })}>
            <span className="fp-pigeon-frame is-up" dangerouslySetInnerHTML={art.up} />
            <span className="fp-pigeon-frame is-down" dangerouslySetInnerHTML={art.down} />
          </span>
          <span className="fp-pigeon-frame fp-shown" style={at(3, { '--out': '3.5s' })} dangerouslySetInnerHTML={art.holding} />
          <span className="fp-pigeon-frame fp-shown is-back" style={at(3.5, { '--out': '4.1s', '--back': '4.7s' })} dangerouslySetInnerHTML={art.perched} />
          <span className="fp-pigeon-frame fp-shown" style={at(4.1, { '--out': '4.7s' })} dangerouslySetInnerHTML={art.happy} />
        </span>
        <span className="fp-envelope fp-blip" style={at(3.5, { '--out': '4.1s' })} dangerouslySetInnerHTML={art.envelope} />
      </div>
      <div className="fp-paper fp-unfold" style={at(4)}>
        <p className="fp-paper-from">{t('landing.story.letter.from', { name: PEOPLE.dilan.name })}</p>
        {LETTER.map((line, i) => (
          <p className="fp-paper-line" key={line.ku}>
            <Ku className="fp-paper-ku">
              <span className="fp-b" style={at(4.6 + i * 0.8)}>
                {line.ku}
              </span>
            </Ku>
            <span className="fp-paper-gloss fp-b" style={at(7 + i * 0.15)}>
              {t(line.gloss)}
            </span>
          </p>
        ))}
        <p className="fp-paper-sign fp-b" style={at(6.8)}>
          {PEOPLE.dilan.name}
        </p>
      </div>
    </div>
  );
}

/* ---- The road, stamped ---------------------------------------------------- */

/** The stops on the road's slice, on its 300 by 360 canvas, and the road between them. */
const STOPS = [
  { x: 92, y: 62 },
  { x: 204, y: 140 },
  { x: 100, y: 222 },
  { x: 206, y: 304 },
] as const;
const ROAD = STOPS.slice(1)
  .map((s, i) => {
    const a = STOPS[i]!;
    const mid = (a.y + s.y) / 2;
    return `${i === 0 ? `M${a.x} ${a.y}` : ''}C${a.x} ${mid} ${s.x} ${mid} ${s.x} ${s.y}`;
  })
  .join('');
/** Hevalo stands beside a stop, just to its right. */
const BESIDE = { x: 26, y: -78 } as const;
const STAMP = { w: 50, h: 58 } as const;

/** A lesson finished: the app's own perforated stamp, in the gold of what is earned, pressed onto the stop. */
function Stamp({ at: when }: { at?: number }): React.JSX.Element {
  return (
    <span className={`fp-stamp${when === undefined ? '' : ' fp-press'}`} style={when === undefined ? undefined : at(when)}>
      <svg width={STAMP.w} height={STAMP.h} viewBox={`0 0 ${STAMP.w} ${STAMP.h}`} aria-hidden="true">
        <path className="fp-stamp-paper" d={stampOutline(STAMP.w, STAMP.h, stampShapeFor(STAMP.w))} />
        <rect className="fp-stamp-frame" x="7" y="7" width={STAMP.w - 14} height={STAMP.h - 14} rx="2" />
      </svg>
      <CheckIcon size={22} weight="bold" />
    </span>
  );
}

/** Hevalo walks the first chapter's road: each lesson he finishes is stamped, the next opens, and the streak goes up a day. */
function RoadScene(): React.JSX.Element {
  const t = useT();
  const leg = (from: number, to: number): Record<string, string> => ({
    '--dx': `${STOPS[to]!.x - STOPS[from]!.x}px`,
    '--dy': `${STOPS[to]!.y - STOPS[from]!.y}px`,
  });
  const stop = (i: number): CSSProperties => ({ left: STOPS[i]!.x, top: STOPS[i]!.y }) as CSSProperties;
  return (
    <div className="fp-sc fp-sc--road">
      <div className="fp-road-top">
        <span className="fp-road-band">
          <span>{t('coursemap.unit', { n: 1 })}</span>
          <Ku className="fp-road-unit">{ROAD_UNIT}</Ku>
        </span>
        <span className="fp-streak">
          <Fire size={22} level={fireLevel(4)} still />
          <span className="fp-swap">
            <span className="fp-gone" style={at(1.4)}>
              {t('landing.story.road.streak', { n: 3 })}
            </span>
            <span className="fp-b fp-pop" style={at(1.4)}>
              {t('landing.story.road.streak', { n: 4 })}
            </span>
          </span>
        </span>
      </div>
      <div className="fp-road">
        <svg className="fp-road-path" width="300" height="360" viewBox="0 0 300 360" aria-hidden="true">
          <path className="fp-road-bed" d={ROAD} />
          <path className="fp-road-line" d={ROAD} />
        </svg>
        {/* The first lesson was finished before; the second is the one in hand. */}
        <span className="fp-stop" style={stop(0)}>
          <Stamp />
        </span>
        <span className="fp-stop" style={stop(1)}>
          <span className="fp-node is-current fp-gone" style={at(0.9)}>
            2
          </span>
          <Stamp at={0.9} />
        </span>
        <span className="fp-stop" style={stop(2)}>
          <span className="fp-node is-locked fp-gone" style={at(1.2)}>
            <LockIcon size={18} weight="bold" />
          </span>
          <span className="fp-node is-current fp-b fp-gone-later" style={at(1.2, { '--out': '4s' })}>
            3
          </span>
          <Stamp at={4} />
        </span>
        <span className="fp-stop" style={stop(3)}>
          <span className="fp-node is-locked fp-gone" style={at(4.3)}>
            <LockIcon size={18} weight="bold" />
          </span>
          <span className="fp-node is-current fp-b" style={at(4.3)}>
            4
          </span>
        </span>
        <span className="fp-walker" style={{ left: STOPS[1].x + BESIDE.x, top: STOPS[1].y + BESIDE.y } as CSSProperties}>
          <span className="fp-leg" style={at(2, leg(1, 2))}>
            <span className="fp-leg" style={at(5, leg(2, 3))}>
              <span className="fp-hop" style={at(2)}>
                <span className="fp-hop" style={at(5)}>
                  <SpeakingCharacter speaker="hevalo" audio={null} crop="full" size={74} decorative />
                </span>
              </span>
            </span>
          </span>
        </span>
      </div>
    </div>
  );
}
