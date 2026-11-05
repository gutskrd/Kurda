import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  BURST,
  KINGDOM_BUILDINGS,
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
  kingdomSpriteSvg,
  kingdomTiles,
  praiseWords,
  villageCamera,
  villageProgress,
  type KingdomBuilding,
  type KingdomBuildingView,
  type KingdomLevel,
  type KingdomPlace,
  type KingdomSprite,
  type KingdomUpgrade,
  type KingdomView,
  type VillageCamera,
  type VillageStage,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { Button, LinkButton } from '../components/Button';
import { ChevronIcon, CoinIcon } from '../components/icons';
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

// the camera's steps (shared with the phone)
const { between, cameraOn, canvasAt, clampCamera, openingCamera, panBy, transformOf, visibleRect, zoomAt } = villageCamera;
type Camera = VillageCamera;
type Stage = VillageStage;

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

/** How long a building takes to go up in the scene, when its badge ticks over, and when the coins reach the counter, in milliseconds (the stylesheet's timings). */
const RAISE_MS = 2400;
const TICK_MS = 1900;
const COINS_MS = 2100;
/** How long a tapped building squashes and bounces before its card opens, and how long the camera takes to fly to one. */
const BOUNCE_MS = 420;
const FLY_MS = 650;
/** A press that moves less than this, in CSS pixels, is a tap rather than a drag. */
const TAP_SLOP = 8;

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

/** An element's size, followed as it changes (a fallback size where nothing is laid out, as in a test). */
function useSize(el: HTMLElement | null, fallback: { w: number; h: number }): { w: number; h: number } {
  const [size, setSize] = useState(fallback);
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
  return size;
}

/** A box on the canvas as a style, in canvas units (the world is laid out at one CSS pixel per unit and scaled as a whole). */
const onCanvas = (box: { x: number; y: number; w: number; h: number }): CSSProperties => ({ left: box.x, top: box.y, width: box.w, height: box.h });

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** A picture as an image source: a blob where the browser has them (decoded off the page's own document), its text otherwise. */
function pictureUrl(svg: string): string {
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined') return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
const dropUrl = (url: string): void => {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url);
};

/** When the page was opened: the one clock every loop of the village's life runs on. */
const PAGE_START = typeof performance !== 'undefined' ? performance.now() : 0;
const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * The Village (/app/games/village; "kingdom" in code): the learner's village,
 * Sêvan, each building at the level their own learning has raised it to, in
 * a valley that fills in as the village's total level rises.
 *
 * The page is a game's home: a world much larger than the screen, drawn as
 * isometric tiles (shared art/kingdom.ts) that the learner drags to pan and
 * pinches, scrolls or double-clicks to zoom, opening near on the village's
 * heart so its buildings are big. Only the tiles and the life near the view
 * are laid, so a large world stays light; the world is moved as a whole on
 * the compositor while a gesture lasts and drawn sharp at its new scale when
 * it settles. Over the world: its life (the deer, the flock, water, wind),
 * played by the stylesheet alone; a level badge and a thin bar under every
 * building; a chunky top bar with the way back, the village's level and its
 * bar to the next, and the learner's Zêr; round buttons to re-centre and to
 * zoom; and a tray of cards, one for each building, which is also the list a
 * screen reader reads — each card a button that flies the camera to its
 * building and opens what built it and what grows it next.
 *
 * Nothing here is counted on the client: the server says each building's
 * level, its count and what the next level needs (GET /kingdom). A level
 * reached since the last visit is raised in the scene — the camera flies to
 * it, dust, the scaffolding falling away, the new stage dropping in, sparkles,
 * Zêr flying to the counter, the badge ticking over — then celebrated once
 * and marked seen as it is put away; with less motion asked for, it is simply
 * there, and the camera jumps rather than glides. The first visit opens with
 * the one sentence on how the village grows.
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
  const isRaising = currentKey !== null && !still && !raised.has(currentKey);

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

  const backLink = (
    <Link to="/app/games" className="kingdom-back" aria-label={t('games.title')}>
      <ChevronIcon size={20} />
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
  if (!view || !levels) {
    return (
      <div className="container kingdom-page" aria-busy="true">
        <div className="kingdom-stage is-loading">
          <Skeleton w="100%" h="100%" />
        </div>
      </div>
    );
  }

  const dismissIntro = (): void => {
    setIntroShown(false);
    void client.post('/kingdom/seen', { intro: true });
  };
  const celebrated = (u: KingdomUpgrade): void => {
    void client.post('/kingdom/seen', { levels: [{ building: u.building, level: u.level }] });
    setQueue((q) => q.slice(1));
  };

  return (
    <Village
      view={view}
      levels={levels}
      rising={rising}
      dark={dark}
      hidden={hidden}
      still={still}
      zer={zer}
      queue={queue}
      current={current}
      isRaising={isRaising}
      ticked={ticked}
      setTicked={setTicked}
      onRaised={(key) => setRaised((r) => new Set(r).add(key))}
      open={open}
      setOpen={setOpen}
      intro={introShown ? view.intro : null}
      onIntroDone={dismissIntro}
      onCelebrated={celebrated}
      backLink={backLink}
    />
  );
}

interface VillageProps {
  view: KingdomView;
  levels: Record<KingdomBuilding, KingdomLevel>;
  rising: KingdomBuilding[];
  dark: boolean;
  hidden: boolean;
  still: boolean;
  zer: number | null;
  queue: KingdomUpgrade[];
  current: KingdomUpgrade | undefined;
  isRaising: boolean;
  ticked: boolean;
  setTicked: (v: boolean) => void;
  onRaised: (key: string) => void;
  open: KingdomBuilding | null;
  setOpen: (b: KingdomBuilding | null) => void;
  intro: KingdomView['intro'];
  onIntroDone: () => void;
  onCelebrated: (u: KingdomUpgrade) => void;
  backLink: React.ReactNode;
}

/** The game itself, once the village has been read: the stage, its world and camera, the bar, the tray, the sheet and the celebration. */
function Village(props: VillageProps): React.JSX.Element {
  const { view, levels, rising, dark, hidden, still, zer, queue, current, isRaising, ticked, setTicked, onRaised, open, setOpen } = props;
  const t = useT();
  const locale = useLocale();
  const number = (v: number): string => new Intl.NumberFormat(locale).format(v);
  const [stageEl, setStageEl] = useState<HTMLElement | null>(null);
  const [hudEl, setHudEl] = useState<HTMLElement | null>(null);
  const [trayEl, setTrayEl] = useState<HTMLElement | null>(null);
  const size = useSize(stageEl, { w: 390, h: 700 });
  const hud = useSize(hudEl, { w: 390, h: 64 });
  const tray = useSize(trayEl, { w: 390, h: 190 });
  const stage = useMemo<Stage>(() => ({ w: size.w, h: size.h, top: hud.h + 12, bottom: tray.h + 8 }), [size, hud.h, tray.h]);
  const worldRef = useRef<HTMLDivElement | null>(null);
  const zerRef = useRef<HTMLSpanElement | null>(null);
  const camRef = useRef<Camera>(openingCamera(stage));
  const stageRef = useRef(stage);
  stageRef.current = stage;
  // what the page lays: the tiles near the view, noted now and then while the camera moves and again as it settles; the
  // life near the view only as it settles, since laying an actor mid-gesture costs a frame and starts its loops
  const [near, setNear] = useState(() => visibleRect(camRef.current, stage));
  const [lifeNear, setLifeNear] = useState(() => visibleRect(camRef.current, stage, 0.15));
  const [bouncing, setBouncing] = useState<KingdomBuilding | null>(null);
  const [happy, setHappy] = useState<string | null>(null);
  const [said, setSaid] = useState<{ id: string; word: string; x: number; y: number } | null>(null);
  const [coins, setCoins] = useState<{ from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);
  const [bumped, setBumped] = useState(false);
  const flying = useRef<number | null>(null);
  const momentum = useRef<number | null>(null);
  const settle = useRef<number | null>(null);
  const lastNear = useRef(0);
  const invRef = useRef(1);

  /** The camera's transform written straight to the world (no render), and the part of the world in view noted now and then. */
  const apply = useCallback((c: Camera, settled: boolean) => {
    camRef.current = c;
    const el = worldRef.current;
    if (el) {
      const { tx, ty, s } = transformOf(c, stageRef.current);
      el.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${s})`;
      // badges and bubbles keep their size on the screen whatever the zoom, within reason; the variable is set only as the
      // zoom really changes or the camera settles, since setting it restyles everything in the world
      const inv = Math.min(2.2, Math.max(0.7, 1 / s));
      if (settled || Math.abs(inv / invRef.current - 1) > 0.12) {
        invRef.current = inv;
        el.style.setProperty('--kg-inv', String(inv));
      }
      if (el.classList.contains('is-moving') === settled) el.classList.toggle('is-moving', !settled);
    }
    if (settle.current !== null) window.clearTimeout(settle.current);
    const note = (all: boolean): void => {
      lastNear.current = now();
      setNear(visibleRect(camRef.current, stageRef.current, 0.4));
      if (all) setLifeNear(visibleRect(camRef.current, stageRef.current, 0.15));
    };
    if (settled) note(true);
    else {
      if (now() - lastNear.current > 220) note(false);
      settle.current = window.setTimeout(() => {
        worldRef.current?.classList.remove('is-moving');
        note(true);
      }, 140);
    }
  }, []);

  const stopMotion = useCallback(() => {
    if (flying.current !== null) cancelAnimationFrame(flying.current);
    if (momentum.current !== null) cancelAnimationFrame(momentum.current);
    flying.current = null;
    momentum.current = null;
  }, []);

  /** The camera glides to another (or, with less motion asked for, jumps there), then calls `done`. */
  const flyTo = useCallback(
    (to: Camera, done?: () => void, ms = FLY_MS) => {
      stopMotion();
      const target = clampCamera(to, stageRef.current);
      if (still) {
        apply(target, true);
        done?.();
        return;
      }
      const from = camRef.current;
      const t0 = now();
      const step = (): void => {
        const f = Math.min(1, (now() - t0) / ms);
        apply(between(from, target, f), f >= 1);
        if (f < 1) flying.current = requestAnimationFrame(step);
        else {
          flying.current = null;
          done?.();
        }
      };
      flying.current = requestAnimationFrame(step);
    },
    [apply, still, stopMotion],
  );

  // the stage's size known (and whenever it changes): the camera opens on the heart the first time, and stays inside the world after
  const opened = useRef(false);
  useLayoutEffect(() => {
    apply(opened.current ? clampCamera(camRef.current, stage) : openingCamera(stage), true);
    opened.current = true;
  }, [stage, apply]);
  useEffect(() => () => stopMotion(), [stopMotion]);

  // the world's tiles, made again only when what they show changes; each set of image sources belongs to the effect that made it, which lets it go
  const tileArt = useMemo(() => kingdomTiles({ levels, rising, dark, moving: true, without: isRaising ? current?.building : undefined }), [levels, rising, dark, isRaising, current]);
  const [tiles, setTiles] = useState<{ x: number; y: number; w: number; h: number; url: string }[]>([]);
  useEffect(() => {
    const made = tileArt.map((tile) => ({ x: tile.x, y: tile.y, w: tile.w, h: tile.h, url: pictureUrl(tile.svg) }));
    setTiles(made);
    return () => made.forEach((tile) => dropUrl(tile.url));
  }, [tileArt]);

  // the life, made again only when the levels change; laid only where it is near the view
  const life = useMemo(() => {
    const sprites = new Map<KingdomSprite, string>(KINGDOM_SPRITES.map((s) => [s, kingdomSpriteSvg(s, { dark })]));
    return lifeMarkup(kingdomLife(levels), (s) => sprites.get(s) ?? '');
  }, [levels, dark]);
  const ages = useRef(new Map<string, number>());
  const laid = life.actors.filter((a) => overlaps(a.reach, lifeNear));
  for (const a of laid) if (!ages.current.has(a.id)) ages.current.set(a.id, Math.round(now() - PAGE_START));
  for (const id of [...ages.current.keys()]) if (!laid.some((a) => a.id === id)) ages.current.delete(id);

  // each new level goes up in the scene first, the camera flown to it, then its celebration opens
  const currentKey = current ? `${current.building}:${current.level}` : null;
  useEffect(() => {
    if (!isRaising || !currentKey || !current) return;
    setTicked(false);
    flyTo(cameraOn(KINGDOM_PLOTS[current.building].box, stageRef.current, camRef.current.s));
    const timers: number[] = [];
    if (current.zer > 0 && zerRef.current && stageEl) {
      // the coins fly from the building to the counter in the top bar
      const box = KINGDOM_PLOTS[current.building].box;
      const goal = cameraOn(box, stageRef.current, camRef.current.s);
      const tf = transformOf(goal, stageRef.current);
      const chip = zerRef.current.getBoundingClientRect();
      const st = stageEl.getBoundingClientRect();
      setCoins({ from: { x: tf.tx + (box.x + box.w / 2) * tf.s, y: tf.ty + (box.y + box.h * 0.4) * tf.s }, to: { x: chip.left - st.left + chip.width / 2, y: chip.top - st.top + chip.height / 2 } });
      timers.push(window.setTimeout(() => setBumped(true), COINS_MS));
    }
    timers.push(window.setTimeout(() => setTicked(true), TICK_MS));
    timers.push(
      window.setTimeout(() => {
        setCoins(null);
        setBumped(false);
        onRaised(currentKey);
      }, RAISE_MS),
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
    // the camera and the counter are read once, as the raise starts, so only a new raise starts this again
  }, [isRaising, currentKey]);

  /** A building tapped, in the world or on its card: it squashes and bounces, then its card opens. */
  const openBuilding = useCallback(
    (b: KingdomBuilding) => {
      if (still) {
        setOpen(b);
        return;
      }
      setBouncing(b);
      window.setTimeout(() => {
        setBouncing(null);
        setOpen(b);
      }, BOUNCE_MS);
    },
    [still, setOpen],
  );
  const goTo = useCallback((b: KingdomBuilding) => flyTo(cameraOn(KINGDOM_PLOTS[b].box, stageRef.current, camRef.current.s), () => openBuilding(b)), [flyTo, openBuilding]);

  /** Something in the world tapped: a building, the deer, or one of the people. */
  const tapAt = useCallback(
    (target: EventTarget | null, px: number, py: number) => {
      const el = target instanceof Element ? target : null;
      const actor = el?.closest<HTMLElement>('[data-actor]');
      if (actor?.dataset.tap === 'deer') {
        setHappy(actor.dataset.actor ?? null);
        window.setTimeout(() => setHappy(null), 1400);
        return;
      }
      if (actor?.dataset.tap === 'person') {
        const words = praiseWords(null);
        const at = canvasAt(camRef.current, stageRef.current, px, py);
        setSaid({ id: actor.dataset.actor!, word: words[Math.floor(now() / 1000) % words.length]!, x: at.x, y: at.y - 34 });
        window.setTimeout(() => setSaid(null), 2200);
        return;
      }
      const building = el?.closest<HTMLElement>('[data-building]')?.dataset.building as KingdomBuilding | undefined;
      if (building) openBuilding(building);
    },
    [openBuilding],
  );

  // the gestures: a drag pans (with a glide after a flick), two fingers pinch, a wheel or a trackpad zooms or pans, a double tap zooms in
  const viewportRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let start: { x: number; y: number; target: EventTarget | null; at: number } | null = null;
    let moved = false;
    let pinch: { d: number; c: Camera; mid: { x: number; y: number } } | null = null;
    let velocity = { x: 0, y: 0 };
    let lastMove = { x: 0, y: 0, at: 0 };
    let lastTap = { at: 0, x: 0, y: 0 };
    const local = (e: PointerEvent | WheelEvent | MouseEvent): { x: number; y: number } => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent): void => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      stopMotion();
      const p = local(e);
      pointers.set(e.pointerId, p);
      el.setPointerCapture?.(e.pointerId);
      if (pointers.size === 1) {
        start = { ...p, target: e.target, at: now() };
        moved = false;
        velocity = { x: 0, y: 0 };
        lastMove = { ...p, at: now() };
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), c: camRef.current, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
        moved = true;
      }
    };
    const move = (e: PointerEvent): void => {
      if (!pointers.has(e.pointerId)) return;
      const p = local(e);
      const prev = pointers.get(e.pointerId)!;
      pointers.set(e.pointerId, p);
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const zoomed = zoomAt(pinch.c, stageRef.current, pinch.mid.x, pinch.mid.y, d / Math.max(1, pinch.d));
        apply(panBy(zoomed, stageRef.current, mid.x - pinch.mid.x, mid.y - pinch.mid.y), false);
        return;
      }
      if (!start) return;
      if (!moved && Math.hypot(p.x - start.x, p.y - start.y) < TAP_SLOP) return;
      moved = true;
      const t1 = now();
      const dt = Math.max(1, t1 - lastMove.at);
      velocity = { x: 0.7 * velocity.x + (0.3 * (p.x - lastMove.x)) / dt, y: 0.7 * velocity.y + (0.3 * (p.y - lastMove.y)) / dt };
      lastMove = { ...p, at: t1 };
      apply(panBy(camRef.current, stageRef.current, p.x - prev.x, p.y - prev.y), false);
    };
    const up = (e: PointerEvent): void => {
      if (!pointers.has(e.pointerId)) return;
      const p = local(e);
      pointers.delete(e.pointerId);
      if (pinch) {
        if (pointers.size < 2) pinch = null;
        if (pointers.size === 1) {
          const [rest] = [...pointers.values()] as [{ x: number; y: number }];
          start = { ...rest, target: null, at: now() };
        }
        apply(camRef.current, pointers.size === 0);
        return;
      }
      if (!start) return;
      if (!moved) {
        // a double tap zooms in about where it landed; a single one taps what is there
        const t1 = now();
        if (t1 - lastTap.at < 320 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 24) {
          flyTo(zoomAt(camRef.current, stageRef.current, p.x, p.y, 1.7), undefined, 320);
          lastTap = { at: 0, x: 0, y: 0 };
        } else {
          lastTap = { at: t1, ...p };
          tapAt(start.target, p.x, p.y);
        }
        start = null;
        return;
      }
      start = null;
      // a flick glides on and slows, unless less motion was asked for
      const speed = Math.hypot(velocity.x, velocity.y);
      if (still || speed < 0.05 || now() - lastMove.at > 80) {
        apply(camRef.current, true);
        return;
      }
      let v = { ...velocity };
      let t0 = now();
      const glide = (): void => {
        const t1 = now();
        const dt = t1 - t0;
        t0 = t1;
        const before = camRef.current;
        const next = panBy(before, stageRef.current, v.x * dt, v.y * dt);
        const decay = Math.pow(0.94, dt / 16);
        v = { x: v.x * decay, y: v.y * decay };
        const stuck = next.x === before.x && next.y === before.y;
        if (Math.hypot(v.x, v.y) < 0.02 || stuck) {
          apply(next, true);
          momentum.current = null;
          return;
        }
        apply(next, false);
        momentum.current = requestAnimationFrame(glide);
      };
      momentum.current = requestAnimationFrame(glide);
    };
    const wheel = (e: WheelEvent): void => {
      e.preventDefault();
      stopMotion();
      const p = local(e);
      // a pinch on a trackpad comes as a wheel with ctrl held; a mouse wheel's notch is a zoom; a trackpad's two-finger slide pans
      const notch = e.deltaMode === 1 || (Math.abs(e.deltaY) >= 40 && e.deltaX === 0 && Number.isInteger(e.deltaY));
      if (e.ctrlKey || notch) apply(zoomAt(camRef.current, stageRef.current, p.x, p.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0018))), false);
      else apply(panBy(camRef.current, stageRef.current, -e.deltaX, -e.deltaY), false);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }, [apply, flyTo, stopMotion, still, tapAt]);

  /** The camera's buttons and keys: in, out, back to the heart, and the arrows to pan. */
  const zoomBy = (factor: number): void => flyTo(zoomAt(camRef.current, stageRef.current, stage.w / 2, stage.top + (stage.h - stage.top - stage.bottom) / 2, factor), undefined, 280);
  const recentre = (): void => flyTo(openingCamera(stageRef.current));
  const onKey = (e: React.KeyboardEvent): void => {
    const step = 90;
    const pan = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (pan) flyTo(panBy(camRef.current, stageRef.current, pan[0]!, pan[1]!), undefined, 200);
    else if (e.key === '+' || e.key === '=') zoomBy(1.35);
    else if (e.key === '-' || e.key === '_') zoomBy(1 / 1.35);
    else if (e.key === '0' || e.key === 'Home') recentre();
    else return;
    e.preventDefault();
  };

  const total = kingdomLevelCount(KINGDOM_BUILDINGS.map((id) => ({ level: levels[id] })));
  const badgeLevel = (b: KingdomBuildingView): number => (isRaising && current?.building === b.id ? (ticked ? current.level : current.level - 1) : levels[b.id]);
  const pending = new Set(queue.map((u) => u.building));
  const openView = view.buildings.find((b) => b.id === open) ?? null;
  const shownZer = zer !== null && current && isRaising && !bumped ? Math.max(0, zer - current.zer) : zer;

  return (
    <div className={`container kingdom-page${hidden ? ' is-paused' : ''}${still ? ' is-still' : ''}`}>
      <section className="kingdom-stage" ref={setStageEl} aria-labelledby="kingdom-title">
        <div ref={viewportRef} className="kingdom-viewport" role="img" aria-label={t('kingdom.title')} tabIndex={0} onKeyDown={onKey}>
          <div className="kingdom-world" ref={worldRef} style={{ width: KINGDOM_SCENE.width, height: KINGDOM_SCENE.height }}>
            {tiles.map((tile) =>
              overlaps(tile, near) ? <img key={`${tile.x},${tile.y}`} className="kingdom-tile" src={tile.url} alt="" draggable={false} style={onCanvas(tile)} /> : null,
            )}
            <style dangerouslySetInnerHTML={{ __html: life.css }} />
            <div className="kingdom-life" aria-hidden="true">
              {laid.map((a) => (
                <span
                  key={a.id}
                  className={`kg-a${happy === a.id ? ' is-happy' : ''}`}
                  data-actor={a.id}
                  data-tap={a.tap}
                  style={{ '--kg-age': `${ages.current.get(a.id) ?? 0}ms` } as CSSProperties}
                  dangerouslySetInnerHTML={{ __html: a.html }}
                />
              ))}
            </div>
            {isRaising && current && <Raise upgrade={current} dark={dark} />}
            {bouncing && <Bounce building={bouncing} level={levels[bouncing]} rising={rising.includes(bouncing)} dark={dark} />}
            {view.buildings.map((b) => {
              const plot = KINGDOM_PLOTS[b.id];
              const shown = badgeLevel(b);
              return (
                <div key={b.id} className="kingdom-plot" data-building={b.id} style={onCanvas(plot.box)} aria-hidden="true">
                  <span className={`kingdom-badge${isRaising && current?.building === b.id && ticked ? ' is-ticked' : ''}`} style={{ left: plot.badge.x - plot.box.x, top: plot.badge.y - plot.box.y }}>
                    <span className="kingdom-badge-level">{t('kingdom.lv', { level: shown })}</span>
                    <span className="kingdom-badge-bar">
                      <span style={{ width: `${Math.round((shown < b.level ? 1 : kingdomProgress(b)) * 100)}%` }} />
                    </span>
                  </span>
                </div>
              );
            })}
            {said && (
              <span className="kingdom-bubble" style={{ left: said.x, top: said.y }} aria-live="polite">
                {said.word}
              </span>
            )}
          </div>
        </div>

        <header className="kingdom-hud" ref={setHudEl}>
          {props.backLink}
          <span className="kingdom-level" role="img" aria-label={t('kingdom.hud.levels', { count: number(total), total: number(KINGDOM_LEVEL_TOTAL) })} data-testid="kingdom-level">
            <span className={`kingdom-level-badge${ticked && isRaising ? ' is-ticked' : ''}`} aria-hidden="true">
              {number(total)}
            </span>
            <span className="kingdom-level-bar" aria-hidden="true">
              <span style={{ width: `${Math.round((total >= KINGDOM_LEVEL_TOTAL ? 1 : villageProgress(view.buildings)) * 100)}%` }} />
            </span>
          </span>
          <h1 id="kingdom-title" className="kingdom-hud-title">
            {t('kingdom.title')}
          </h1>
          {shownZer !== null && (
            <span className={`kingdom-chip${bumped ? ' is-bumped' : ''}`} ref={zerRef} data-testid="kingdom-zer">
              <CoinIcon size={20} />
              <span>{number(shownZer)}</span>
              <span className="sr-only">Zêr</span>
            </span>
          )}
        </header>

        <div className="kingdom-controls" style={{ bottom: stage.bottom + 8 }}>
          <button type="button" className="kingdom-round" onClick={recentre} aria-label={t('kingdom.recentre')}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
              <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
          <button type="button" className="kingdom-round" onClick={() => zoomBy(1.35)} aria-label={t('kingdom.zoomIn')}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
          </button>
          <button type="button" className="kingdom-round" onClick={() => zoomBy(1 / 1.35)} aria-label={t('kingdom.zoomOut')}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <section className="kingdom-tray" ref={setTrayEl} aria-labelledby="kingdom-list-title">
          <h2 id="kingdom-list-title" className="sr-only">
            {t('kingdom.list')}
          </h2>
          <ul className="kingdom-cards">
            {view.buildings.map((b) => (
              <li key={b.id}>
                <BuildingCard building={b} dark={dark} ready={pending.has(b.id)} onGo={() => goTo(b.id)} />
              </li>
            ))}
          </ul>
        </section>

        {coins && <Coins from={coins.from} to={coins.to} />}
        {props.intro && <KingdomIntro intro={props.intro} onDone={props.onIntroDone} style={{ bottom: stage.bottom + 8 }} />}
      </section>

      <Sheet open={openView !== null} onClose={() => setOpen(null)} label={openView ? t(buildingNameKey(openView.id)) : t('kingdom.title')} className="kingdom-sheet">
        {openView && <BuildingSheet building={openView} dark={dark} rising={rising.includes(openView.id)} />}
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
          onClose={() => props.onCelebrated(current)}
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

/**
 * One building's card in the tray: its picture at its stage, its name, its
 * state (not begun, growing, a new level ready to see, finished), a bar to its
 * next level, what grows it in plain words, and the way to that part of
 * Learn. The card's face is a button that flies the camera to the building and
 * opens what built it.
 */
function BuildingCard({ building: b, dark, ready, onGo }: { building: KingdomBuildingView; dark: boolean; ready: boolean; onGo: () => void }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const number = (v: number): string => new Intl.NumberFormat(locale).format(v);
  const state = ready ? 'ready' : b.next === null ? 'done' : b.level === 0 ? 'new' : 'growing';
  const stateText = state === 'ready' ? t('kingdom.tray.ready') : state === 'done' ? t('kingdom.full') : levelText(t, b);
  const picture = useMemo(() => ({ __html: kingdomBuildingSvg({ building: b.id, level: b.level, size: 64, dark, idPrefix: `kgcard${b.id}` }) }), [b.id, b.level, dark]);
  return (
    <div className={`kingdom-card is-${state}`} data-testid={`kingdom-card-${b.id}`}>
      <button type="button" className="kingdom-card-face" onClick={onGo} aria-label={`${t(buildingNameKey(b.id))}, ${stateText}`}>
        <span className="kingdom-card-art" aria-hidden="true" dangerouslySetInnerHTML={picture} />
        <span className="kingdom-card-head" aria-hidden="true">
          <span className="kingdom-card-name">{t(buildingNameKey(b.id))}</span>
          <span className="kingdom-card-state">{state === 'growing' ? t('kingdom.lv', { level: b.level }) : stateText}</span>
        </span>
      </button>
      {b.next !== null && (
        <>
          <ProgressBar building={b} />
          <p className="kingdom-card-next">{t('kingdom.toNext', { remaining: number(b.remaining), level: b.level + 1 })}</p>
        </>
      )}
      <p className="kingdom-card-grows">{t(growsKey(b.id))}</p>
      <LinkButton to={KINGDOM_PLACE_PATH[b.place]} size="sm" className="kingdom-card-go">
        {t(GO_KEY[b.place])}
      </LinkButton>
    </div>
  );
}

/** The first visit: one sentence on how the village grows, and what earlier learning already built. */
function KingdomIntro({ intro, onDone, style }: { intro: NonNullable<KingdomView['intro']>; onDone: () => void; style?: CSSProperties }): React.JSX.Element {
  const t = useT();
  return (
    <section className="kingdom-intro" aria-labelledby="kingdom-intro-text" style={style}>
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

/** A tapped building's squash and bounce: a copy of it laid over itself that only ever grows, so the one under it never shows round its edge. */
function Bounce({ building, level, rising, dark }: { building: KingdomBuilding; level: KingdomLevel; rising: boolean; dark: boolean }): React.JSX.Element {
  const art = useMemo(() => ({ __html: kingdomPlotSvg({ building, level, rising: rising && level < 5, dark }) }), [building, level, rising, dark]);
  return <span className="kingdom-bounce" style={onCanvas(kingdomPlotBox(building))} aria-hidden="true" dangerouslySetInnerHTML={art} />;
}

/** Where the sparkles fly out to as a building goes up, in percent of its box. */
const SPARKS: readonly [number, number, number][] = [
  [-38, -46, 0],
  [34, -52, 80],
  [-46, -8, 160],
  [44, -14, 60],
  [-14, -64, 120],
  [18, -34, 200],
  [-28, -70, 240],
  [40, -40, 280],
];

/**
 * A building going up in the scene: its stage being built shakes, dust rises,
 * the scaffolding falls away, and the new stage drops in from above and
 * lands with a squash and a stretch while sparkles fly off it. Drawn over a
 * scene that leaves the building off its plot; the stylesheet times it all.
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
    <div className="kingdom-raise" style={onCanvas(kingdomPlotBox(upgrade.building))} aria-hidden="true" data-testid="kingdom-raise">
      <span className="kingdom-raise-old" dangerouslySetInnerHTML={{ __html: art.old }} />
      <span className="kingdom-raise-scaffold" dangerouslySetInnerHTML={{ __html: art.scaffold }} />
      <span className="kingdom-raise-next" dangerouslySetInnerHTML={{ __html: art.next }} />
      <span className="kingdom-raise-dust" dangerouslySetInnerHTML={{ __html: art.dust }} />
      {SPARKS.map(([dx, dy, delay], i) => (
        <span key={i} className="kingdom-raise-spark" style={{ '--dx': `${dx}%`, '--dy': `${dy}%`, animationDelay: `${1350 + delay}ms` } as CSSProperties} dangerouslySetInnerHTML={{ __html: art.sparkle }} />
      ))}
    </div>
  );
}

/** Zêr coins flying from a building that went up to the counter in the top bar, one after another. */
function Coins({ from, to }: { from: { x: number; y: number }; to: { x: number; y: number } }): React.JSX.Element {
  return (
    <div className="kingdom-coins" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className="kingdom-coin"
          style={{ left: from.x + ((i % 3) - 1) * 14, top: from.y + (i % 2) * 10, '--dx': `${to.x - from.x - ((i % 3) - 1) * 14}px`, '--dy': `${to.y - from.y - (i % 2) * 10}px`, animationDelay: `${1450 + i * 90}ms` } as CSSProperties}
        >
          <CoinIcon size={22} />
        </span>
      ))}
    </div>
  );
}
