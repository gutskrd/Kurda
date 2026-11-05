import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  BURST,
  KINGDOM_BUILDINGS,
  KINGDOM_FRAME,
  KINGDOM_LEVEL_TOTAL,
  KINGDOM_PLOTS,
  KINGDOM_SCENE,
  KINGDOM_SPRITES,
  kingdomBuildingSvg,
  kingdomLevelCount,
  kingdomLevels,
  kingdomLife,
  kingdomPlotBox,
  kingdomPlotSvg,
  kingdomProgress,
  kingdomRising,
  kingdomSceneSvg,
  kingdomSpriteSvg,
  type KingdomBuilding,
  type KingdomBuildingView,
  type KingdomLevel,
  type KingdomPlace,
  type KingdomSprite,
  type KingdomUpgrade,
  type KingdomView,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { Button, LinkButton } from '../components/Button';
import { ChevronIcon, CoinIcon, HomeIcon } from '../components/icons';
import { ErrorState } from '../components/states';
import { Sheet } from '../components/Sheet';
import { Skeleton } from '../components/Skeleton';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { Celebration } from '../ranks/Celebration';
import { prefersReducedMotion } from '../lib/motion';
import { useRail } from '../social/RailProvider';
import { lifeMarkup } from './life';
import './kingdom.css';

/** Where each part of Learn a building grows from is, on the website. */
export const KINGDOM_PLACE_PATH: Readonly<Record<KingdomPlace, string>> = {
  review: '/app/learn/review',
  lessons: '/app/learn/next',
  stories: '/app/learn/stories',
};

const GO_KEY: Readonly<Record<KingdomPlace, MessageKey>> = {
  review: 'kingdom.go.review',
  lessons: 'kingdom.go.lessons',
  stories: 'kingdom.go.stories',
};

// written out key by key, so the catalogue check sees each one read and a renamed key fails to compile
const NAME_KEY: Record<KingdomBuilding, MessageKey> = { houses: 'kingdom.name.houses', school: 'kingdom.name.school', teahouse: 'kingdom.name.teahouse', spring: 'kingdom.name.spring', market: 'kingdom.name.market', orchard: 'kingdom.name.orchard' };
const GROWS_KEY: Record<KingdomBuilding, MessageKey> = { houses: 'kingdom.grows.houses', school: 'kingdom.grows.school', teahouse: 'kingdom.grows.teahouse', spring: 'kingdom.grows.spring', market: 'kingdom.grows.market', orchard: 'kingdom.grows.orchard' };
const COUNT_KEY: Record<KingdomBuilding, MessageKey> = { houses: 'kingdom.count.houses', school: 'kingdom.count.school', teahouse: 'kingdom.count.teahouse', spring: 'kingdom.count.spring', market: 'kingdom.count.market', orchard: 'kingdom.count.orchard' };
export const buildingNameKey = (b: KingdomBuilding): MessageKey => NAME_KEY[b];
const growsKey = (b: KingdomBuilding): MessageKey => GROWS_KEY[b];
const countKey = (b: KingdomBuilding): MessageKey => COUNT_KEY[b];

/** How long a building takes to go up in the scene, and when its badge ticks over, in milliseconds (the stylesheet's timings). */
const RAISE_MS = 2100;
const TICK_MS = 1700;

/** Whether the page is drawn dark (theme/theme.ts puts the scheme on the root element), followed as it changes. */
function useDarkScheme(): boolean {
  const read = (): boolean => typeof document !== 'undefined' && document.documentElement.dataset.theme !== 'light';
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

/** Whether the page is out of sight (another tab, a minimised window): the village's life holds still until it is back. */
function usePageHidden(): boolean {
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  useEffect(() => {
    const on = (): void => setHidden(document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return hidden;
}

/**
 * The scale that fits the village's frame inside the stage, and where the
 * canvas then sits so the frame is centred: the rest of the canvas (more lake,
 * more sky, more mountains) fills whatever shape the stage is.
 */
function useFit(el: HTMLElement | null): { scale: number; left: number; top: number } {
  const [size, setSize] = useState<{ w: number; h: number }>({ w: KINGDOM_FRAME.w, h: KINGDOM_FRAME.h });
  useLayoutEffect(() => {
    if (!el) return;
    const measure = (): void => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize({ w: r.width, h: r.height });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  const scale = Math.min(size.w / KINGDOM_FRAME.w, size.h / KINGDOM_FRAME.h);
  return {
    scale,
    left: size.w / 2 - (KINGDOM_FRAME.x + KINGDOM_FRAME.w / 2) * scale,
    top: size.h / 2 - (KINGDOM_FRAME.y + KINGDOM_FRAME.h / 2) * scale,
  };
}

/** A box on the canvas as a style, in percent of the canvas. */
const onCanvas = (box: { x: number; y: number; w: number; h: number }): CSSProperties => ({
  left: `${(box.x / KINGDOM_SCENE.width) * 100}%`,
  top: `${(box.y / KINGDOM_SCENE.height) * 100}%`,
  width: `${(box.w / KINGDOM_SCENE.width) * 100}%`,
  height: `${(box.h / KINGDOM_SCENE.height) * 100}%`,
});

/**
 * Kurdish Kingdom (/app/games/kingdom): the learner's village, Sêvan, each
 * building at the level their own learning has raised it to.
 *
 * The village fills the screen the way a game's home does, drawn as one
 * isometric scene (shared art/kingdom.ts) that keeps the whole village in
 * view whatever the window's shape: a fixed, composed view rather than one to
 * pan, so every building and its badge is always in sight and a phone's page
 * still scrolls like a page. Over the scene: its life (life.ts: the deer on
 * the path, the flock, smoke, water, wind) played by the stylesheet alone; a
 * button on every building, with its level badge and a thin bar to its next
 * level under it; and a chunky top bar with the way back, the learner's Zêr
 * and how many of the village's thirty levels stand. A building past half-way
 * to its next level is drawn going up in scaffolding.
 *
 * A tap on a building opens its sheet — its level, what built it, what grows
 * it next and a button to that part of Learn. The six are listed as well,
 * beside the scene on a wide screen and under it on a phone, for a screen
 * reader and for anyone who would rather read than look.
 *
 * Nothing here is counted on the client: the server says each building's
 * level, its count and what the next level needs (GET /kingdom). A level
 * reached since the last visit is raised in the scene — dust, the scaffolding
 * falling away, the new stage popping up, sparkles, the badge ticking over —
 * then celebrated once and marked seen as it is put away; with less motion
 * asked for, it is simply there. The first visit opens with the one sentence
 * on how the village grows, quietly, with no celebration for what earlier
 * learning had already built.
 */
export function KingdomPage(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [view, setView] = useState<KingdomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<KingdomBuilding | null>(null);
  const [queue, setQueue] = useState<KingdomUpgrade[]>([]);
  const [introShown, setIntroShown] = useState(true);
  const [still] = useState(prefersReducedMotion);
  // the upgrades already raised in the scene (each goes up before its celebration opens), and whether the one going up has ticked its badge over
  const [raised, setRaised] = useState<ReadonlySet<string>>(() => new Set());
  const [ticked, setTicked] = useState(false);
  const dark = useDarkScheme();
  const hidden = usePageHidden();
  const [stage, setStage] = useState<HTMLElement | null>(null);
  const fit = useFit(stage);
  const zer = useRailZer();

  const load = useCallback(async () => {
    setError(null);
    const res = await client.get<KingdomView>('/kingdom');
    if (!res.ok) {
      setError(describeError(res.error, t));
      return;
    }
    setView(res.data);
    setQueue(res.data.celebrate);
    setIntroShown(res.data.intro !== null);
  }, [client, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = introShown ? undefined : queue[0];
  const currentKey = current ? `${current.building}:${current.level}` : null;

  // each new level goes up in the scene first, then its celebration opens; with less motion asked for, it is simply there
  const isRaising = currentKey !== null && !still && !raised.has(currentKey);
  useEffect(() => {
    if (!isRaising || !currentKey) return;
    setTicked(false);
    const tick = window.setTimeout(() => setTicked(true), TICK_MS);
    const done = window.setTimeout(() => setRaised((r) => new Set(r).add(currentKey)), RAISE_MS);
    return () => {
      window.clearTimeout(tick);
      window.clearTimeout(done);
    };
  }, [isRaising, currentKey]);

  // the levels the scene shows: a level not yet celebrated still stands at the one before it, until it is raised
  const levels = useMemo(() => {
    if (!view) return null;
    const out = kingdomLevels(view.buildings);
    for (const u of queue) {
      if (u === current && !isRaising) continue;
      out[u.building] = Math.min(out[u.building], u.level - 1) as KingdomLevel;
    }
    return out;
  }, [view, queue, current, isRaising]);
  const rising = useMemo(() => (view ? kingdomRising(view.buildings) : []), [view]);
  const scene = useMemo(
    () => (levels ? { __html: kingdomSceneSvg({ levels, rising, dark, moving: true, without: isRaising ? current?.building : undefined, title: t('kingdom.title'), idPrefix: 'kgscene' }) } : null),
    [levels, rising, dark, isRaising, current, t],
  );

  const backLink = (
    <Link to="/app/games" className="kingdom-back" aria-label={t('games.title')}>
      <ChevronIcon size={18} />
    </Link>
  );

  if (error && !view) {
    return (
      <div className="container kingdom-page">
        <div className="page-header">
          {backLink}
          <h1 className="page-title">{t('kingdom.title')}</h1>
        </div>
        <ErrorState message={error} onRetry={() => void load()} />
      </div>
    );
  }
  if (!view || !levels || !scene) {
    return (
      <div className="container kingdom-page" aria-busy="true">
        <div className="kingdom-stage is-loading">
          <Skeleton w="100%" h="100%" />
        </div>
      </div>
    );
  }

  const openBuilding = view.buildings.find((b) => b.id === open) ?? null;

  const dismissIntro = (): void => {
    setIntroShown(false);
    void client.post('/kingdom/seen', { intro: true });
  };
  const celebrated = (u: KingdomUpgrade): void => {
    void client.post('/kingdom/seen', { levels: [{ building: u.building, level: u.level }] });
    setQueue((q) => q.slice(1));
  };
  const badgeLevel = (b: KingdomBuildingView): number => (isRaising && current?.building === b.id ? (ticked ? current.level : current.level - 1) : levels[b.id]);
  const total = kingdomLevelCount(KINGDOM_BUILDINGS.map((id) => ({ level: levels[id] })));

  return (
    <div className={`container kingdom-page${hidden ? ' is-paused' : ''}`}>
      <section className="kingdom-stage" ref={setStage} aria-labelledby="kingdom-title">
        <div className="kingdom-canvas" style={{ left: fit.left, top: fit.top, width: KINGDOM_SCENE.width * fit.scale, height: KINGDOM_SCENE.height * fit.scale }}>
          <div className="kingdom-scene-art" dangerouslySetInnerHTML={scene} />
          <KingdomLife levels={levels} dark={dark} />
          {isRaising && current && <Raise upgrade={current} dark={dark} />}
          {view.buildings.map((b) => {
            const plot = KINGDOM_PLOTS[b.id];
            const shown = badgeLevel(b);
            return (
              <button
                key={b.id}
                type="button"
                className="kingdom-plot"
                style={onCanvas(plot.box)}
                aria-label={`${t(buildingNameKey(b.id))}, ${levelText(t, b)}`}
                onClick={() => setOpen(b.id)}
              >
                <span
                  className={`kingdom-badge${isRaising && current?.building === b.id && ticked ? ' is-ticked' : ''}`}
                  style={{ left: `${((plot.badge.x - plot.box.x) / plot.box.w) * 100}%`, top: `${((plot.badge.y - plot.box.y) / plot.box.h) * 100}%` }}
                  aria-hidden="true"
                >
                  <span className="kingdom-badge-level">{t('kingdom.lv', { level: shown })}</span>
                  <span className="kingdom-badge-bar">
                    <span style={{ width: `${Math.round((shown < b.level ? 1 : kingdomProgress(b)) * 100)}%` }} />
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <header className="kingdom-hud">
          {backLink}
          <h1 id="kingdom-title" className="kingdom-hud-title">
            {t('kingdom.title')}
          </h1>
          <span className="kingdom-hud-chips">
            {zer !== null && (
              <span className="kingdom-chip">
                <CoinIcon size={18} />
                <span>{zer.toLocaleString()}</span>
                <span className="sr-only">Zêr</span>
              </span>
            )}
            <span className="kingdom-chip" aria-label={t('kingdom.hud.levels', { count: total, total: KINGDOM_LEVEL_TOTAL })} role="img">
              <HomeIcon size={18} />
              <span aria-hidden="true">
                {total}/{KINGDOM_LEVEL_TOTAL}
              </span>
            </span>
          </span>
        </header>

        {introShown && view.intro && <KingdomIntro intro={view.intro} onDone={dismissIntro} />}
      </section>

      <section className="kingdom-side" aria-labelledby="kingdom-list-title">
        <h2 id="kingdom-list-title" className="kingdom-side-title">
          {t('kingdom.list')}
        </h2>
        <ul className="kingdom-list">
          {view.buildings.map((b) => (
            <li key={b.id}>
              <button type="button" className="kingdom-row" onClick={() => setOpen(b.id)}>
                <span className="kingdom-row-art" aria-hidden="true" dangerouslySetInnerHTML={{ __html: kingdomBuildingSvg({ building: b.id, level: b.level, size: 56, dark, idPrefix: `kgrow${b.id}` }) }} />
                <span className="kingdom-row-text">
                  <span className="kingdom-row-name">{t(buildingNameKey(b.id))}</span>
                  <span className="kingdom-row-level">{levelText(t, b)}</span>
                  <ProgressBar building={b} />
                </span>
                <ChevronIcon size={16} className="kingdom-row-go" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <Sheet open={openBuilding !== null} onClose={() => setOpen(null)} label={openBuilding ? t(buildingNameKey(openBuilding.id)) : t('kingdom.title')} className="kingdom-sheet">
        {openBuilding && <BuildingSheet building={openBuilding} dark={dark} rising={rising.includes(openBuilding.id)} />}
      </Sheet>

      {current && !isRaising && (
        <Celebration
          key={`${current.building}:${current.level}`}
          open
          label={t('kingdom.celebrate.kicker')}
          tone="zer"
          art={<span className="kingdom-celebrate-art" dangerouslySetInnerHTML={{ __html: kingdomBuildingSvg({ building: current.building, level: current.level, size: 168, dark, title: t(buildingNameKey(current.building)) }) }} />}
          kicker={t('kingdom.celebrate.kicker')}
          title={t('kingdom.celebrate.title', { building: t(buildingNameKey(current.building)), level: current.level })}
          body={t(growsKey(current.building))}
          extra={
            current.zer > 0 ? (
              <p className="kingdom-zer">
                <CoinIcon size={20} />
                {t('kingdom.celebrate.zer', { zer: current.zer })}
              </p>
            ) : undefined
          }
          flecks={BURST.badge}
          seed={current.level * 31 + current.building.length}
          action={queue.length > 1 ? t('kingdom.celebrate.next') : t('kingdom.celebrate.done')}
          onClose={() => celebrated(current)}
        />
      )}
    </div>
  );
}

/** The learner's Zêr, from the rail's own poll (no request of its own); null until it has arrived. */
function useRailZer(): number | null {
  return useRail().data.you?.balances.zer ?? null;
}

type Translate = ReturnType<typeof useT>;

function levelText(t: Translate, b: KingdomBuildingView): string {
  return b.level === 0 ? t('kingdom.empty') : t('kingdom.levelOf', { level: b.level });
}

function ProgressBar({ building }: { building: KingdomBuildingView }): React.JSX.Element {
  const share = kingdomProgress(building);
  return (
    <span className="kingdom-bar" aria-hidden="true">
      <span style={{ width: `${Math.round(share * 100)}%` }} />
    </span>
  );
}

/** The first visit: one sentence on how the village grows, and what earlier learning already built. */
function KingdomIntro({ intro, onDone }: { intro: NonNullable<KingdomView['intro']>; onDone: () => void }): React.JSX.Element {
  const t = useT();
  return (
    <section className="kingdom-intro" aria-labelledby="kingdom-intro-text">
      <p id="kingdom-intro-text">{t('kingdom.intro')}</p>
      {intro.levels > 0 && (
        <p className="kingdom-intro-built">
          {t('kingdom.intro.built')}
          {intro.zer > 0 && (
            <span className="kingdom-zer">
              <CoinIcon size={16} />
              {t('kingdom.celebrate.zer', { zer: intro.zer })}
            </span>
          )}
        </p>
      )}
      <Button size="sm" onClick={onDone}>
        {t('kingdom.intro.go')}
      </Button>
    </section>
  );
}

/** One building's sheet: its picture, level, what built it, and what grows it next with the way there. */
function BuildingSheet({ building: b, dark, rising }: { building: KingdomBuildingView; dark: boolean; rising: boolean }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const number = (v: number): string => new Intl.NumberFormat(locale).format(v);
  return (
    <div className="kingdom-sheet-body">
      <span className="kingdom-sheet-art" aria-hidden="true" dangerouslySetInnerHTML={{ __html: kingdomBuildingSvg({ building: b.id, level: b.level, rising, size: 148, dark, idPrefix: `kgsheet${b.id}` }) }} />
      <h2 className="kingdom-sheet-title">{t(buildingNameKey(b.id))}</h2>
      <p className="kingdom-sheet-level">{levelText(t, b)}</p>
      <h3 className="kingdom-sheet-heading">{t('kingdom.builtBy')}</h3>
      <p>{t(countKey(b.id), { count: number(b.count) })}</p>
      <h3 className="kingdom-sheet-heading">{t('kingdom.nextUp')}</h3>
      <p>{t(growsKey(b.id))}</p>
      <ProgressBar building={b} />
      <p className="kingdom-sheet-next">{b.next === null ? t('kingdom.full') : t('kingdom.toNext', { remaining: number(b.remaining), level: b.level + 1 })}</p>
      <LinkButton to={KINGDOM_PLACE_PATH[b.place]} size="lg" className="kingdom-sheet-go">
        {t(GO_KEY[b.place])}
      </LinkButton>
    </div>
  );
}

/**
 * The village's life over the scene: the actors from shared, as one block of
 * markup and one set of keyframes, made again only when the levels change.
 */
function KingdomLife({ levels, dark }: { levels: Record<KingdomBuilding, KingdomLevel>; dark: boolean }): React.JSX.Element {
  const life = useMemo(() => {
    const sprites = new Map<KingdomSprite, string>(KINGDOM_SPRITES.map((s) => [s, kingdomSpriteSvg(s, { dark })]));
    return lifeMarkup(kingdomLife(levels), (s) => sprites.get(s) ?? '');
  }, [levels, dark]);
  return (
    <>
      <style>{life.css}</style>
      <div className="kingdom-life" aria-hidden="true" dangerouslySetInnerHTML={{ __html: life.html }} />
    </>
  );
}

/** Where the sparkles fly out to as a building goes up, in percent of its box. */
const SPARKS: readonly [number, number, number][] = [
  [-38, -46, 0],
  [34, -52, 80],
  [-46, -8, 160],
  [44, -14, 60],
  [-14, -64, 120],
  [18, -34, 200],
];

/**
 * A building going up in the scene: its stage being built shakes, dust rises,
 * the scaffolding falls away, and the new stage pops up with a squash and a
 * stretch while sparkles fly off it. Drawn over a scene that leaves the
 * building off its plot; the stylesheet times it all (RAISE_MS in total).
 */
function Raise({ upgrade, dark }: { upgrade: KingdomUpgrade; dark: boolean }): React.JSX.Element {
  const art = useMemo(() => {
    const before = (upgrade.level - 1) as KingdomLevel;
    return {
      old: kingdomPlotSvg({ building: upgrade.building, level: before, rising: true, scaffold: 'none', dark }),
      scaffold: kingdomPlotSvg({ building: upgrade.building, level: before, rising: true, scaffold: 'only', dark }),
      next: kingdomPlotSvg({ building: upgrade.building, level: upgrade.level, dark }),
      dust: kingdomSpriteSvg('dust', { dark }),
      sparkle: kingdomSpriteSvg('sparkle', { dark }),
    };
  }, [upgrade, dark]);
  return (
    <div className="kingdom-raise" style={onCanvas(kingdomPlotBox(upgrade.building))} aria-hidden="true">
      <span className="kingdom-raise-old" dangerouslySetInnerHTML={{ __html: art.old }} />
      <span className="kingdom-raise-scaffold" dangerouslySetInnerHTML={{ __html: art.scaffold }} />
      <span className="kingdom-raise-next" dangerouslySetInnerHTML={{ __html: art.next }} />
      <span className="kingdom-raise-dust" dangerouslySetInnerHTML={{ __html: art.dust }} />
      {SPARKS.map(([dx, dy, delay], i) => (
        <span key={i} className="kingdom-raise-spark" style={{ '--dx': `${dx}%`, '--dy': `${dy}%`, animationDelay: `${1150 + delay}ms` } as CSSProperties} dangerouslySetInnerHTML={{ __html: art.sparkle }} />
      ))}
    </div>
  );
}
