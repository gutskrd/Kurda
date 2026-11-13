import { useCallback, useEffect, useRef, useState } from 'react';
import { TREE_FULL, TREE_STAGES, treeColour, type TreeSpecies, type TreeStage, type TreeView } from '@kurda/shared';
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
import { healthName, stageName, treeAbout, treeNamed, treeTitle } from './names';
import { useTree, type MyTree, type TreeKindOffer, type Watered } from './useTree';
import './tree.css';

/** How long the can pours for, and the tree starts under it, before the page is as it will stay. */
const POUR_MS = 1100;

/** What a pour did that is worth stopping for: it grew, or a full-grown tree bore. */
interface Moment {
  kind: 'grew' | 'harvest';
  tree: TreeView;
  zer: number;
}

/**
 * The learner's own tree.
 *
 * Before one is planted, the page is the choice of a first tree: the kinds
 * that are free to start from, each shown as the tree it will be. After, it
 * is the tree itself, as big as the page allows, with how it fares and how
 * far it is to its next stage; the water held, which a lesson earns, and the
 * can to pour it with; and a way to the nursery, where another kind can be
 * bought and planted in its place.
 *
 * Pouring is the page's one moment: the can tips, drops fall, the tree
 * starts, and its bar moves. When that grows it, or a full-grown tree bears,
 * the app's celebration says so. A tree that has gone dry is said plainly to
 * be thirsty, wilting or withered, with no blame in it, and the first water
 * brings it back.
 *
 * On a server that has no trees yet there is nothing here but a line saying
 * so; nowhere else in the app mentions them then.
 */
export function TreePage(): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { client } = useAuth();
  const { data, loading, error, unavailable, reload, set } = useTree();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [pouring, setPouring] = useState(false);
  const [moment, setMoment] = useState<Moment | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [nursery, setNursery] = useState(false);
  const pourTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(pourTimer.current), []);
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
      if (!data?.tree || busy || pouring) return;
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
      setPouring(!still);
      playLessonSound('correct');
      // the can pours over the tree as it was; what the water did is shown once it has
      pourTimer.current = window.setTimeout(
        () => {
          setPouring(false);
          set({ ...data, tree: watered.tree, zer: data.zer + watered.zer });
          if (watered.grew !== null) setMoment({ kind: 'grew', tree: watered.tree, zer: watered.zer });
          else if (watered.harvests > 0) setMoment({ kind: 'harvest', tree: watered.tree, zer: watered.zer });
          else if (watered.revived) setNote(t('tree.revived'));
        },
        still ? 0 : POUR_MS,
      );
    },
    [client, data, busy, pouring, set, t],
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

  if (!data.tree)
    return (
      <div className="container tree-page">
        <div className="page-header">
          <span className="eyebrow">{t('tree.eyebrow')}</span>
          <h1 className="page-title">{t('tree.choose.title')}</h1>
          <p className="page-sub">{t('tree.choose.sub')}</p>
        </div>
        {failed && (
          <p className="tree-failed" role="alert">
            {failed}
          </p>
        )}
        <ul className="tree-choices">
          {data.kinds
            .filter((k) => k.starter)
            .map((k) => (
              <li key={k.species}>
                <KindCard kind={k} busy={busy} action={t('tree.choose.plant')} onAct={() => void plant(k.species)} first />
              </li>
            ))}
        </ul>
        <p className="tree-choices-more">{t('tree.choose.more')}</p>
      </div>
    );

  const tree = data.tree;
  const named = treeNamed(t, tree.species);
  const full = tree.stage === TREE_FULL;
  const share = tree.toward.of > 0 ? tree.toward.done / tree.toward.of : 0;
  const wash = { '--tree': treeColour(tree.species) } as React.CSSProperties;

  return (
    <div className="container tree-page" style={wash}>
      <div className="page-header">
        <span className="eyebrow">{t('tree.eyebrow')}</span>
        <h1 className="page-title">{named.name}</h1>
        <p className="page-sub">
          {[named.meaning, stageName(t, tree.stage), t('tree.day', { count: number(tree.age + 1) })].filter(Boolean).join(' · ')}
        </p>
      </div>

      <section className={`tree-stage is-${tree.health}${pouring ? ' is-pouring' : ''}`} aria-label={treeTitle(t, tree)}>
        <TreeArt species={tree.species} stage={tree.stage} health={tree.health} size={320} alive className="tree-stage-art" />
        {pouring && (
          <span className="tree-pour" aria-hidden="true">
            <WateringCan size={92} />
            <span className="tree-pour-drops">
              {[0, 1, 2, 3, 4].map((i) => (
                <i key={i} style={{ '--i': i } as React.CSSProperties}>
                  <WaterDrop size={14} />
                </i>
              ))}
            </span>
          </span>
        )}
      </section>

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
        <div className="tree-growth-head">
          <span className="tree-growth-next">
            {full ? t('tree.nextHarvest') : t('tree.next', { stage: stageName(t, (tree.stage + 1) as TreeStage) })}
          </span>
          <span className="tree-growth-count" dir="ltr">
            {number(tree.toward.done)} / {number(tree.toward.of)}
          </span>
        </div>
        <div
          className="tree-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={tree.toward.of}
          aria-valuenow={tree.toward.done}
          aria-label={full ? t('tree.nextHarvest') : t('tree.next', { stage: stageName(t, (tree.stage + 1) as TreeStage) })}
        >
          <span style={{ '--to': share } as React.CSSProperties} />
        </div>
        <ol className="tree-steps" aria-label={t('tree.stages')}>
          {Array.from({ length: TREE_STAGES }, (_, i) => (
            <li key={i} className={i < tree.stage ? 'is-done' : i === tree.stage ? 'is-now' : ''} aria-current={i === tree.stage ? 'step' : undefined}>
              <span className="sr-only">{stageName(t, i as TreeStage)}</span>
            </li>
          ))}
        </ol>
        {tree.harvests > 0 && <p className="tree-harvests">{t('tree.harvests', { count: number(tree.harvests) })}</p>}
      </section>

      {failed && (
        <p className="tree-failed" role="alert">
          {failed}
        </p>
      )}

      <section className="tree-water" aria-label={t('tree.water.held', { count: number(tree.water) })}>
        <p className="tree-water-held">
          <WaterDrop size={22} />
          <span>{t('tree.water.held', { count: number(tree.water) })}</span>
        </p>
        {tree.water > 0 ? (
          <div className="tree-water-actions">
            <Button block size="lg" disabled={busy || pouring} onClick={() => void pour(1)}>
              {tree.stage === 0 ? t('tree.water.first') : t('tree.water.pour')}
            </Button>
            {tree.water > 1 && (
              <Button variant="ghost" size="sm" disabled={busy || pouring} onClick={() => void pour(tree.water)}>
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

/** One kind of tree as a card: the tree it will be, its name and what it means, a line about it, and what can be done with it. */
function KindCard({
  kind,
  busy,
  action,
  onAct,
  note,
  first = false,
}: {
  kind: TreeKindOffer;
  busy: boolean;
  /** the button's words; none for the kind that stands */
  action: string | null;
  onAct: () => void;
  /** in place of a price: "Free", "Yours", "Growing now" */
  note?: string;
  /** the first choice of a tree: bigger, and shown from seed to tree */
  first?: boolean;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const named = treeNamed(t, kind.species);
  return (
    <article className={`tree-kind${first ? ' is-first' : ''}`} style={{ '--tree': treeColour(kind.species) } as React.CSSProperties}>
      <span className="tree-kind-art">
        <TreeArt species={kind.species} stage={TREE_FULL} size={first ? 150 : 112} />
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
        <Button size="sm" variant={first ? 'primary' : 'secondary'} disabled={busy} onClick={onAct} aria-label={`${action}: ${withMeaning(t, named)}`}>
          {action}
        </Button>
      )}
    </article>
  );
}

/**
 * The nursery: every kind there is. One that is free or already bought can
 * be planted, which is asked about first, because the tree that stands is
 * gone when another is planted; one that is not can be bought with Zêr, which
 * plants nothing by itself. The question is the sheet's second step, in the
 * sheet itself, so nothing opens over anything. What cannot be afforded says
 * how much is missing rather than only refusing.
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
    // planted: back to the tree, which is a seed now; bought: back to the kinds, where it is now theirs to plant
    if (asking.what === 'plant') onClose();
  };

  // one sheet, two steps: the kinds there are, and — once one is picked — the question that picking it asks
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
