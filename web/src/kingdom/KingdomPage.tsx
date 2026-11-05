import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  BURST,
  KINGDOM_PLOTS,
  KINGDOM_SCENE,
  kingdomBuildingSvg,
  kingdomLevels,
  kingdomLife,
  kingdomLifeSvg,
  kingdomProgress,
  kingdomSceneSvg,
  type KingdomBuilding,
  type KingdomBuildingView,
  type KingdomPlace,
  type KingdomUpgrade,
  type KingdomView,
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

export const buildingNameKey = (b: KingdomBuilding): MessageKey => `kingdom.name.${b}` as MessageKey;
const growsKey = (b: KingdomBuilding): MessageKey => `kingdom.grows.${b}` as MessageKey;
const countKey = (b: KingdomBuilding): MessageKey => `kingdom.count.${b}` as MessageKey;

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

/**
 * Kurdish Kingdom (/app/games/kingdom): the learner's mountain village, each
 * building at the level their own learning has raised it to.
 *
 * The scene is one drawing (shared art/kingdom.ts) with a button laid over
 * each building; a tap opens its sheet — its level, what built it, what grows
 * it next and a button to that part of Learn. The same six are listed under
 * the scene for anyone who reads the page rather than looks at it. A little
 * life is laid over the drawing — smoke from the chimneys, light on the
 * spring, a leaf stirring in the orchard — and is still for a reader who
 * asked for less motion.
 *
 * Nothing here is counted on the client: the server says each building's
 * level, its count and what the next level needs (GET /kingdom). A level
 * reached since the last visit is celebrated once, one at a time, and marked
 * seen as it is put away; the first visit opens with the one sentence on how
 * the village grows, quietly, with no celebration for what earlier learning
 * had already built.
 */
export function KingdomPage(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [view, setView] = useState<KingdomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<KingdomBuilding | null>(null);
  const [queue, setQueue] = useState<KingdomUpgrade[]>([]);
  const [introShown, setIntroShown] = useState(true);
  const dark = useDarkScheme();

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

  const levels = useMemo(() => (view ? kingdomLevels(view.buildings) : null), [view]);
  const scene = useMemo(
    () => (levels ? { __html: kingdomSceneSvg({ levels, dark, title: t('kingdom.title'), idPrefix: 'kgscene' }) } : null),
    [levels, dark, t],
  );

  const header = (
    <div className="page-header">
      <Link to="/app/games" className="back-link">
        <ChevronIcon size={14} />
        {t('games.title')}
      </Link>
      <h1 className="page-title">{t('kingdom.title')}</h1>
    </div>
  );

  if (error && !view) {
    return (
      <div className="container kingdom-page">
        {header}
        <ErrorState message={error} onRetry={() => void load()} />
      </div>
    );
  }
  if (!view || !levels || !scene) {
    return (
      <div className="container kingdom-page" aria-busy="true">
        {header}
        <div className="kingdom-scene is-loading">
          <Skeleton w="100%" h="100%" />
        </div>
      </div>
    );
  }

  const openBuilding = view.buildings.find((b) => b.id === open) ?? null;
  const current = introShown ? undefined : queue[0];

  const dismissIntro = (): void => {
    setIntroShown(false);
    void client.post('/kingdom/seen', { intro: true });
  };
  const celebrated = (u: KingdomUpgrade): void => {
    void client.post('/kingdom/seen', { levels: [{ building: u.building, level: u.level }] });
    setQueue((q) => q.slice(1));
  };

  return (
    <div className="container kingdom-page">
      {header}

      {introShown && view.intro && <KingdomIntro intro={view.intro} onDone={dismissIntro} />}

      <div className="kingdom-scene" style={{ aspectRatio: `${KINGDOM_SCENE.width} / ${KINGDOM_SCENE.height}` }}>
        <div className="kingdom-scene-art" dangerouslySetInnerHTML={scene} />
        <KingdomLife levels={levels} />
        {view.buildings.map((b) => {
          const box = KINGDOM_PLOTS[b.id].box;
          const style: CSSProperties = {
            left: `${(box.x / KINGDOM_SCENE.width) * 100}%`,
            top: `${(box.y / KINGDOM_SCENE.height) * 100}%`,
            width: `${(box.w / KINGDOM_SCENE.width) * 100}%`,
            height: `${(box.h / KINGDOM_SCENE.height) * 100}%`,
          };
          return (
            <button
              key={b.id}
              type="button"
              className="kingdom-plot"
              style={style}
              aria-label={`${t(buildingNameKey(b.id))}, ${levelText(t, b)}`}
              onClick={() => setOpen(b.id)}
            />
          );
        })}
      </div>

      <ul className="kingdom-list">
        {view.buildings.map((b) => (
          <li key={b.id}>
            <button type="button" className="kingdom-row" onClick={() => setOpen(b.id)}>
              <span className="kingdom-row-art" aria-hidden="true" dangerouslySetInnerHTML={{ __html: kingdomBuildingSvg({ building: b.id, level: b.level, size: 48, dark, idPrefix: `kgrow${b.id}` }) }} />
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

      <Sheet open={openBuilding !== null} onClose={() => setOpen(null)} label={openBuilding ? t(buildingNameKey(openBuilding.id)) : t('kingdom.title')} className="kingdom-sheet">
        {openBuilding && <BuildingSheet building={openBuilding} dark={dark} />}
      </Sheet>

      {current && (
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
function BuildingSheet({ building: b, dark }: { building: KingdomBuildingView; dark: boolean }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const number = (v: number): string => new Intl.NumberFormat(locale).format(v);
  return (
    <div className="kingdom-sheet-body">
      <span className="kingdom-sheet-art" aria-hidden="true" dangerouslySetInnerHTML={{ __html: kingdomBuildingSvg({ building: b.id, level: b.level, size: 132, dark, idPrefix: `kgsheet${b.id}` }) }} />
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
 * What moves: each puff, glint and leaf a sprite laid over the scene where
 * the drawing says it is, moved by the stylesheet. Under reduced motion the
 * stylesheet holds them still, and they are not drawn at all if the reader
 * asked before the page opened.
 */
function KingdomLife({ levels }: { levels: ReturnType<typeof kingdomLevels> }): React.JSX.Element | null {
  const [still] = useState(prefersReducedMotion);
  const spots = useMemo(() => kingdomLife(levels), [levels]);
  const sprites = useMemo(() => ({ smoke: kingdomLifeSvg('smoke'), water: kingdomLifeSvg('water'), leaf: kingdomLifeSvg('leaf') }), []);
  if (still) return null;
  return (
    <div className="kingdom-life" aria-hidden="true">
      {spots.map((s, i) => (
        <span
          key={`${s.building}${i}`}
          className={`kingdom-life-${s.kind}`}
          style={
            {
              left: `${(s.x / KINGDOM_SCENE.width) * 100}%`,
              top: `${(s.y / KINGDOM_SCENE.height) * 100}%`,
              width: `${(s.size / KINGDOM_SCENE.width) * 100}%`,
              animationDelay: `${(i * 0.7) % 3}s`,
            } as CSSProperties
          }
          dangerouslySetInnerHTML={{ __html: sprites[s.kind] }}
        />
      ))}
    </div>
  );
}
