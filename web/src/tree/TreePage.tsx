import { useCallback, useEffect, useRef, useState } from 'react';
import {
  TREE_FULL,
  TREE_REVIVE,
  TREE_SHAKE,
  TREE_STAGES,
  TREE_TOP,
  TREE_WATER_LANDS,
  hasTreeArt,
  treeColour,
  treeGrowFrom,
  treeHeft,
  treeSeasonAir,
  type TreeSeason,
  type TreeSpecies,
  type TreeStage,
  type TreeView,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button, LinkButton } from '../components/Button';
import { CoinIcon } from '../components/icons';
import { Sheet } from '../components/Sheet';
import { Skeleton } from '../components/Skeleton';
import { ErrorState } from '../components/states';
import { useLocale, useT } from '../i18n/I18nProvider';
import { describeError } from '../lib/api';
import { prefersReducedMotion } from '../lib/motion';
import { playLessonSound } from '../lib/sounds';
import { Celebration } from '../ranks/Celebration';
import { withMeaning } from '../ranks/names';
import { TreeArt, WaterDrop, WateringCan } from './TreeArt';
import { TREE_PLACE, TreePicture, TreeSeasonAmbient, TreeStudioScene, studioColour } from './TreeScene';
import { useTreeSeason } from './season';
import { healthName, stageName, treeAbout, treeNamed, treeTitle } from './names';
import { useTree, type MyTree, type TreeKindOffer, type Watered } from './useTree';
import './tree.css';

/** How long the can pours before the result shows, and how long the tree grows before the celebration. */
const POUR_MS = 1500;
const GROW_MS = 1150;

/** What the page is doing: nothing, pouring, or growing the tree. */
type Phase = 'idle' | 'pour' | 'grow';

/** The tree before the water, kept briefly over the new one, which grows out of it or revives under it. */
interface Was {
  tree: TreeView;
  kind: 'grow' | 'revive';
}

/** A pour result worth celebrating: the tree grew, or a full-grown tree bore fruit. */
interface Moment {
  kind: 'grew' | 'harvest';
  tree: TreeView;
  zer: number;
}

/**
 * The learner's own tree. Before planting, it offers the free starter seeds with the grown tree each will become.
 * After, it shows the tree in its seasonal scene, the progress to its next stage, the water earned from lessons with
 * the can to pour it, and the nursery, where another kind can be bought and planted instead.
 *
 * Pouring plays in the scene: the can tips, the water lands and the tree drinks; if it grows, the new tree rises from
 * a burst of light before the celebration. A full-grown tree that bears fruit is celebrated at once. A dry tree shows
 * a thought of water and says plainly whether it is thirsty, wilting or withered; the first water revives it. Under
 * Reduce Motion the page goes straight to the result. On a server without trees there is only a line saying so.
 */
export function TreePage(): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { client } = useAuth();
  const season = useTreeSeason();
  const { data, loading, error, unavailable, reload, set } = useTree();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  // Each counts its occurrences, so the same moment can play again.
  const [grown, setGrown] = useState(0);
  const [planted, setPlanted] = useState(0);
  const [cheer, setCheer] = useState(0);
  const [moment, setMoment] = useState<Moment | null>(null);
  const [was, setWas] = useState<Was | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [nursery, setNursery] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const fade = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      window.clearTimeout(fade.current);
    },
    [],
  );
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);

  const plant = useCallback(
    async (species: TreeSpecies): Promise<boolean> => {
      setBusy(true);
      setFailed(null);
      const res = await client.post<MyTree>('/me/tree/plant', { species });
      setBusy(false);
      if (!res.ok) {
        setFailed(describeError(res.error, t));
        return false;
      }
      set(res.data);
      setNote(null);
      setPlanted((n) => n + 1);
      return true;
    },
    [client, t, set],
  );

  const buy = useCallback(
    async (species: TreeSpecies): Promise<boolean> => {
      setBusy(true);
      setFailed(null);
      const res = await client.post<MyTree>(`/me/tree/kinds/${species}/buy`);
      setBusy(false);
      if (!res.ok) {
        setFailed(describeError(res.error, t));
        return false;
      }
      set(res.data);
      return true;
    },
    [client, t, set],
  );

  const pour = useCallback(
    async (count: number): Promise<void> => {
      if (!data?.tree || busy || phase !== 'idle') return;
      setBusy(true);
      setFailed(null);
      setNote(null);
      const res = await client.post<Watered>('/me/tree/water', { count });
      setBusy(false);
      if (!res.ok) {
        setFailed(describeError(res.error, t));
        return;
      }
      const watered = res.data;
      const still = prefersReducedMotion();
      playLessonSound('correct');
      // The can pours over the old tree; the result shows once the water lands.
      const landed = (): void => {
        set({ ...data, tree: watered.tree, zer: data.zer + watered.zer });
        if (watered.grew !== null) {
          const say = (): void => {
            setPhase('idle');
            setWas(null);
            setMoment({ kind: 'grew', tree: watered.tree, zer: watered.zer });
          };
          if (still) return say();
          // It grows in place out of the old tree, and is seen before anything is said.
          setWas({ tree: data.tree!, kind: 'grow' });
          setGrown((n) => n + 1);
          setPhase('grow');
          playLessonSound('complete');
          timer.current = window.setTimeout(say, GROW_MS);
          return;
        }
        setPhase('idle');
        if (!still && data.tree!.health !== watered.tree.health) {
          // Revived: the drooping tree fades off the revived one.
          setWas({ tree: data.tree!, kind: 'revive' });
          window.clearTimeout(fade.current);
          fade.current = window.setTimeout(() => setWas(null), TREE_REVIVE.ms);
        }
        if (!still) setCheer((n) => n + 1);
        if (watered.harvests > 0) setMoment({ kind: 'harvest', tree: watered.tree, zer: watered.zer });
        else if (watered.revived) setNote(t('tree.revived'));
      };
      if (still) return landed();
      setPhase('pour');
      timer.current = window.setTimeout(landed, POUR_MS);
    },
    [client, data, busy, phase, set, t],
  );

  const header = (
    <div className="page-header">
      <span className="eyebrow">{t('tree.eyebrow')}</span>
      <h1 className="page-title">{t('tree.title')}</h1>
      <p className="page-sub">{t('tree.sub')}</p>
    </div>
  );

  if (unavailable)
    return (
      <div className="container tree-page">
        {header}
        <p className="tree-soon">{t('tree.soon')}</p>
      </div>
    );
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data)
    return (
      <div className="container tree-page" aria-busy={loading}>
        {header}
        <div className="tree-stage is-waiting">
          <Skeleton w={280} h={280} radius="var(--r-xl)" />
        </div>
      </div>
    );

  if (!data.tree) return <Chooser data={data} season={season} busy={busy} failed={failed} onPlant={(species) => void plant(species)} />;

  const tree = data.tree;
  const named = treeNamed(t, tree.species);
  const full = tree.stage === TREE_FULL;
  const share = tree.toward.of > 0 ? tree.toward.done / tree.toward.of : 0;
  const wash = { '--tree': treeColour(tree.species) } as React.CSSProperties;
  const next = full ? t('tree.nextHarvest') : t('tree.next', { stage: stageName(t, (tree.stage + 1) as TreeStage) });
  const idle = phase === 'idle';

  return (
    <div className="container tree-page" style={wash}>
      <div className="page-header">
        <span className="eyebrow">{t('tree.eyebrow')}</span>
        <h1 className="page-title">{named.name}</h1>
        <p className="page-sub">
          {[named.meaning, stageName(t, tree.stage), t('tree.day', { count: number(tree.age + 1) })].filter(Boolean).join(' · ')}
        </p>
      </div>

      <Stage tree={tree} was={was} season={season} phase={phase} grown={grown} planted={planted} cheer={cheer} label={treeTitle(t, tree)} />

      {tree.health !== 'fresh' && (
        <p className={`tree-health is-${tree.health}`} role="status">
          <strong>{healthName(t, tree.health)}</strong>
          <span>{t('tree.health.since', { count: number(tree.dryDays) })}</span>
        </p>
      )}
      {note && (
        <p className="tree-note" role="status">
          {note}
        </p>
      )}

      <section className="tree-growth" aria-label={t('tree.growth')}>
        <div className="tree-goal" role="progressbar" aria-valuemin={0} aria-valuemax={tree.toward.of} aria-valuenow={tree.toward.done} aria-label={next}>
          <svg className="tree-goal-ring" viewBox="0 0 84 84" aria-hidden="true">
            <circle className="tree-goal-track" cx="42" cy="42" r="38" />
            <circle className="tree-goal-fill" cx="42" cy="42" r="38" style={{ strokeDasharray: GOAL_ROUND, strokeDashoffset: GOAL_ROUND * (1 - share) }} />
          </svg>
          {/* The goal: the next stage, or what a full-grown tree bears. */}
          <span className="tree-goal-art" aria-hidden="true">
            {full ? <CoinIcon size={30} /> : <TreeArt species={tree.species} stage={(tree.stage + 1) as TreeStage} size={62} />}
          </span>
        </div>
        <div className="tree-growth-text">
          <span className="tree-growth-next">{next}</span>
          <span key={tree.toward.done} className="tree-growth-count" dir="ltr">
            {number(tree.toward.done)} / {number(tree.toward.of)}
          </span>
          <ol className="tree-steps" aria-label={t('tree.stages')}>
            {Array.from({ length: TREE_STAGES }, (_, i) => (
              <li key={i} className={i < tree.stage ? 'is-done' : i === tree.stage ? 'is-now' : ''} aria-current={i === tree.stage ? 'step' : undefined}>
                <span className="sr-only">{stageName(t, i as TreeStage)}</span>
              </li>
            ))}
          </ol>
          {tree.harvests > 0 && <p className="tree-harvests">{t('tree.harvests', { count: number(tree.harvests) })}</p>}
        </div>
      </section>

      {failed && (
        <p className="tree-failed" role="alert">
          {failed}
        </p>
      )}

      <section className="tree-water" aria-label={t('tree.water.held', { count: number(tree.water) })}>
        <p className="tree-water-held">
          <WaterDrop size={22} />
          <span key={tree.water}>{t('tree.water.held', { count: number(tree.water) })}</span>
        </p>
        {tree.water > 0 ? (
          <div className="tree-water-actions">
            <Button block size="lg" className="tree-water-pour" disabled={busy || !idle} onClick={() => void pour(1)}>
              {tree.stage === 0 ? t('tree.water.first') : t('tree.water.pour')}
            </Button>
            {tree.water > 1 && (
              <Button variant="ghost" size="sm" disabled={busy || !idle} onClick={() => void pour(tree.water)}>
                {t('tree.water.pourAll', { count: number(tree.water) })}
              </Button>
            )}
          </div>
        ) : (
          <div className="tree-water-none">
            <p>{t('tree.water.none')}</p>
            <LinkButton to="/app/learn/next" block size="lg">
              {t('tree.water.learn')}
            </LinkButton>
          </div>
        )}
      </section>

      <p className="tree-about">{treeAbout(t, tree.species)}</p>
      <Button variant="secondary" block onClick={() => setNursery(true)}>
        {t('tree.nursery.open')}
      </Button>

      <Nursery
        open={nursery}
        onClose={() => {
          setNursery(false);
          setFailed(null);
        }}
        data={data}
        busy={busy}
        failed={failed}
        onBuy={buy}
        onPlant={plant}
      />

      <Celebration
        open={moment !== null}
        label={moment?.kind === 'harvest' ? t('tree.harvest.title') : t('tree.grew.title')}
        tone="zer"
        art={moment ? <TreeArt species={moment.tree.species} stage={moment.tree.stage} size={220} /> : null}
        kicker={named.name}
        title={moment?.kind === 'harvest' ? t('tree.harvest.title') : moment?.tree.stage === 1 ? t('tree.sprouted.title') : t('tree.grew.title')}
        body={moment ? (moment.kind === 'harvest' ? t('tree.harvest.body') : t('tree.grew.body', { stage: stageName(t, moment.tree.stage) })) : null}
        extra={
          moment && moment.zer > 0 ? (
            <p className="tree-moment-zer">
              <CoinIcon size={18} />
              <span dir="ltr">+{number(moment.zer)}</span> Zêr
            </p>
          ) : undefined
        }
        action={t('rankResult.continue')}
        onClose={() => setMoment(null)}
      />
    </div>
  );
}

/** The circumference of the goal ring, which its share is measured against. */
const GOAL_ROUND = 2 * Math.PI * 38;

/** The drops falling from the can, each a little after and to one side of the last. */
const DROPS = Array.from({ length: 13 }, (_, i) => ({ wait: 330 + i * 54, aside: ((i * 5) % 9) - 4, size: 4 + (i % 3) * 0.9 }));
/** The angles of the rays from a growing tree and the sparks around one that has drunk. */
const RAYS = Array.from({ length: 12 }, (_, i) => i * 30 + (i % 2 === 0 ? 0 : 9));
const SPARKS = [
  [22, 30, 0],
  [78, 26, 90],
  [13, 54, 170],
  [87, 50, 260],
  [36, 12, 60],
  [66, 10, 210],
  [50, 3, 130],
] as const;

/** The tree's stage: the seasonal scene behind it, the season blowing past, and the tree gently bobbing. Tapping shakes it. */
function Stage({
  tree,
  was,
  season,
  phase,
  grown,
  planted,
  cheer,
  label,
}: {
  tree: TreeView;
  was: Was | null;
  season: TreeSeason;
  phase: Phase;
  grown: number;
  planted: number;
  cheer: number;
  label: string;
}): React.JSX.Element {
  const plot = useRef<HTMLSpanElement>(null);
  const shake = (): void => {
    const plantOf = plot.current?.querySelector<HTMLElement>('.tree-stage-art:not(.is-leaving) .tree-art-start');
    if (!plantOf || typeof plantOf.animate !== 'function' || prefersReducedMotion() || phase !== 'idle') return;
    // Laid over the breeze; a great tree only stirs where a sprout bends right over.
    const heft = treeHeft(tree.stage);
    plantOf.animate(
      TREE_SHAKE.turns.map((turn) => ({ transform: `rotate(${Math.round(turn * heft * 100) / 100}deg)` })),
      { duration: TREE_SHAKE.ms, easing: 'ease-out' },
    );
  };
  // How the picture enters: grown into, dropped in as a new seed, or arriving with the page.
  const came = grown > 0 ? 'is-grown' : planted > 0 && tree.stage === 0 ? 'is-planted' : 'is-shown';
  // Where the water lands, and where a thirsty tree's thought floats beside its top at this stage.
  const places = { '--land': `${TREE_WATER_LANDS[tree.stage] * 100}%`, '--thought': `${Math.max(2, TREE_TOP[tree.stage] * 100 - 12)}%`, '--heft': treeHeft(tree.stage) } as React.CSSProperties;
  // When grown, the new tree rises from the old one's size while the old one swells toward the new.
  const from = was?.kind === 'grow' ? treeGrowFrom(was.tree.stage, tree.stage) : 1;
  return (
    <section
      className={`tree-stage is-${season} is-${tree.health}${phase === 'pour' ? ' is-pouring' : ''}${phase === 'grow' ? ' is-growing' : ''}`}
      style={{ background: studioColour(season) }}
      aria-label={label}
    >
      <TreeStudioScene season={season} health={tree.health} />
      <TreeSeasonAmbient air={hasTreeArt(tree.species) ? treeSeasonAir(tree.species, tree.stage, tree.health, season) : null} />
      <span className="tree-stage-plot" ref={plot} style={{ ...TREE_PLACE, ...places }} onPointerDown={shake}>
        <span className="tree-stage-bob">
          <span key={`${grown}:${planted}`} className={`tree-stage-art ${came}`} style={{ '--grow-from': from } as React.CSSProperties}>
            <TreeArt species={tree.species} stage={tree.stage} health={tree.health} season={season} size={420} alive fluid />
          </span>
          {was ? (
            <span key={`was:${grown}:${was.kind}`} className={`tree-stage-art is-leaving is-${was.kind}`} style={{ '--grow-to': Math.round((1 / from) * 1000) / 1000 } as React.CSSProperties} aria-hidden="true">
              <TreeArt species={was.tree.species} stage={was.tree.stage} health={was.tree.health} season={season} size={420} alive fluid />
            </span>
          ) : null}
        </span>
        {tree.health !== 'fresh' && phase === 'idle' && (
          <span className="tree-thought" aria-hidden="true">
            <WaterDrop size={40} fluid />
          </span>
        )}
        {phase === 'pour' && (
          <span className="tree-pour" aria-hidden="true">
            <span className="tree-pour-can">
              <WateringCan size={160} fluid />
            </span>
            {DROPS.map((d, i) => (
              <i key={i} className="tree-pour-drop" style={{ '--wait': `${d.wait}ms`, '--aside': `${d.aside}%` } as React.CSSProperties}>
                <span className="tree-pour-drop-art" style={{ width: `${d.size}%` }}>
                  <WaterDrop size={18} fluid />
                </span>
              </i>
            ))}
            <span className="tree-pour-ring" />
            <span className="tree-pour-ring is-second" />
          </span>
        )}
        {phase === 'grow' && (
          <span key={grown} className="tree-burst" aria-hidden="true">
            <span className="tree-burst-light" />
            {RAYS.map((deg, i) => (
              <i key={i} style={{ '--turn': `${deg}deg`, '--wait': `${(i % 4) * 40}ms` } as React.CSSProperties} />
            ))}
          </span>
        )}
        {cheer > 0 && phase === 'idle' && (
          <span key={cheer} className="tree-cheer" aria-hidden="true">
            {SPARKS.map(([x, y, turn], i) => (
              <i key={i} style={{ left: `${x}%`, top: `${y}%`, '--turn': `${turn}deg`, '--wait': `${i * 55}ms` } as React.CSSProperties} />
            ))}
          </span>
        )}
      </span>
    </section>
  );
}

/** The choice of a first tree: a seed for each free kind, with the grown tree of the picked one above. The button plants it. */
function Chooser({ data, season, busy, failed, onPlant }: { data: MyTree; season: TreeSeason; busy: boolean; failed: string | null; onPlant: (species: TreeSpecies) => void }): React.JSX.Element {
  const t = useT();
  const starters = data.kinds.filter((k) => k.starter);
  const [picked, setPicked] = useState<TreeSpecies>(starters[0]?.species ?? 'beru');
  const named = treeNamed(t, picked);
  return (
    <div className="container tree-page" style={{ '--tree': treeColour(picked) } as React.CSSProperties}>
      <div className="page-header">
        <span className="eyebrow">{t('tree.eyebrow')}</span>
        <h1 className="page-title">{t('tree.choose.title')}</h1>
        <p className="page-sub">{t('tree.choose.sub')}</p>
      </div>
      <section className={`tree-stage is-${season} is-fresh`} style={{ background: studioColour(season) }} aria-label={withMeaning(t, named)}>
        <TreeStudioScene season={season} health="fresh" />
        <TreeSeasonAmbient air={treeSeasonAir(picked, TREE_FULL, 'fresh', season)} />
        <span className="tree-stage-plot" style={TREE_PLACE}>
          <span className="tree-stage-bob">
            <span key={picked} className="tree-stage-art is-shown">
              <TreeArt species={picked} stage={TREE_FULL} season={season} size={420} alive fluid />
            </span>
          </span>
        </span>
      </section>
      <fieldset className="tree-seeds">
        <legend className="sr-only">{t('tree.choose.title')}</legend>
        {starters.map((k) => {
          const kind = treeNamed(t, k.species);
          return (
            <label key={k.species} className={`tree-seed${k.species === picked ? ' is-picked' : ''}`} style={{ '--tree': treeColour(k.species) } as React.CSSProperties}>
              <input type="radio" name="tree-seed" className="sr-only" checked={k.species === picked} onChange={() => setPicked(k.species)} />
              <span className="tree-seed-art" aria-hidden="true">
                <TreeArt species={k.species} stage={0} size={132} />
              </span>
              <span className="tree-seed-name">{kind.name}</span>
              {kind.meaning && <span className="tree-seed-meaning">{kind.meaning}</span>}
            </label>
          );
        })}
      </fieldset>
      <p className="tree-about">{treeAbout(t, picked)}</p>
      {failed && (
        <p className="tree-failed" role="alert">
          {failed}
        </p>
      )}
      <Button block size="lg" disabled={busy} onClick={() => onPlant(picked)} aria-label={`${t('tree.choose.plant')}: ${withMeaning(t, named)}`}>
        {t('tree.choose.plant')}
      </Button>
      <p className="tree-choices-more">{t('tree.choose.more')}</p>
    </div>
  );
}

/** One kind of tree as a card: the grown tree, its name and meaning, a line about it, and its action. */
function KindCard({
  kind,
  busy,
  action,
  onAct,
  note,
}: {
  kind: TreeKindOffer;
  busy: boolean;
  /** The button's label; none for the kind already planted. */
  action: string | null;
  onAct: () => void;
  /** Shown instead of a price, such as "Free", "Yours" or "Growing now". */
  note?: string;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const named = treeNamed(t, kind.species);
  return (
    <article className="tree-kind" style={{ '--tree': treeColour(kind.species) } as React.CSSProperties}>
      <span className="tree-kind-art">
        {/* Each kind in summer leaves, since in spring every flowering kind is pink. */}
        <TreePicture species={kind.species} stage={TREE_FULL} season="summer" size={112} />
      </span>
      <span className="tree-kind-text">
        <span className="tree-kind-name">{named.name}</span>
        {named.meaning && <span className="tree-kind-meaning">{named.meaning}</span>}
        <span className="tree-kind-about">{treeAbout(t, kind.species)}</span>
        {note ? (
          <span className="tree-kind-note">{note}</span>
        ) : (
          !kind.owned && (
            <span className="tree-kind-price">
              <CoinIcon size={16} />
              <span dir="ltr">{new Intl.NumberFormat(locale).format(kind.price)}</span>
            </span>
          )
        )}
      </span>
      {action && (
        <Button size="sm" variant="secondary" disabled={busy} onClick={onAct} aria-label={`${action}: ${withMeaning(t, named)}`}>
          {action}
        </Button>
      )}
    </article>
  );
}

/**
 * The nursery: every kind. A free or bought kind can be planted after a confirmation, since it replaces the current
 * tree; others can be bought with Zêr without planting. The confirmation is the sheet's second step, and an
 * unaffordable kind says how much is missing.
 */
function Nursery({
  open,
  onClose,
  data,
  busy,
  failed,
  onBuy,
  onPlant,
}: {
  open: boolean;
  onClose: () => void;
  data: MyTree;
  busy: boolean;
  failed: string | null;
  onBuy: (species: TreeSpecies) => Promise<boolean>;
  onPlant: (species: TreeSpecies) => Promise<boolean>;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const [asking, setAsking] = useState<{ kind: TreeKindOffer; what: 'buy' | 'plant' } | null>(null);
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);
  const standing = data.tree?.species ?? null;
  const asked = asking ? treeNamed(t, asking.kind.species) : null;
  const short = asking?.what === 'buy' ? Math.max(0, asking.kind.price - data.zer) : 0;

  const confirm = async (): Promise<void> => {
    if (!asking) return;
    const done = asking.what === 'buy' ? await onBuy(asking.kind.species) : await onPlant(asking.kind.species);
    if (!done) return;
    setAsking(null);
    // Planted: back to the tree, now a seed. Bought: back to the kinds, where it can now be planted.
    if (asking.what === 'plant') onClose();
  };

  // One sheet in two steps: the kinds, then the confirmation for the picked one.
  const close = (): void => {
    setAsking(null);
    onClose();
  };
  return (
    <Sheet open={open} onClose={close} label={asking && asked ? (asking.what === 'buy' ? t('tree.buy.title', { name: asked.name }) : t('tree.replace.title', { name: asked.name })) : t('tree.nursery.title')} className="tree-nursery">
      {asking && asked ? (
        <div className="tree-ask">
          <TreeArt species={asking.kind.species} stage={asking.what === 'plant' ? 0 : TREE_FULL} size={150} />
          <h2 className="tree-ask-title">{asking.what === 'buy' ? t('tree.buy.title', { name: asked.name }) : t('tree.replace.title', { name: asked.name })}</h2>
          <p className="tree-ask-body">
            {asking.what === 'buy'
              ? t('tree.buy.body', { price: number(asking.kind.price) })
              : standing
                ? t('tree.replace.body', { current: treeNamed(t, standing).name })
                : t('tree.replace.first')}
          </p>
          {short > 0 && <p className="tree-ask-short">{t('tree.buy.short', { count: number(short) })}</p>}
          {failed && (
            <p className="tree-failed" role="alert">
              {failed}
            </p>
          )}
          <div className="tree-ask-actions">
            <Button block disabled={busy || short > 0} onClick={() => void confirm()}>
              {asking.what === 'buy' ? t('tree.buy.confirm') : t('tree.replace.confirm')}
            </Button>
            <Button block variant="ghost" onClick={() => setAsking(null)}>
              {asking.what === 'buy' ? t('common.cancel') : t('tree.replace.keep')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <h2 className="tree-nursery-title">{t('tree.nursery.title')}</h2>
          <p className="tree-nursery-sub">{t('tree.nursery.sub')}</p>
          <p className="tree-nursery-zer">
            <CoinIcon size={18} />
            <span dir="ltr">{number(data.zer)}</span> Zêr
          </p>
          <ul className="tree-kinds">
            {data.kinds.map((k) => {
              const here = k.species === standing;
              return (
                <li key={k.species}>
                  <KindCard
                    kind={k}
                    busy={busy}
                    note={here ? t('tree.nursery.standing') : k.starter ? t('tree.nursery.free') : k.owned ? t('tree.nursery.yours') : undefined}
                    action={here ? null : k.owned ? t('tree.nursery.plant') : t('tree.nursery.buy')}
                    onAct={() => setAsking({ kind: k, what: k.owned ? 'plant' : 'buy' })}
                  />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Sheet>
  );
}
