import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { TREE_FULL, treeColour, type TreeSpecies } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { useLocale, useT } from '../i18n/I18nProvider';
import { Button } from '../components/Button';
import { Skeleton, SkeletonText } from '../components/Skeleton';
import { ChevronIcon, CoinIcon } from '../components/icons';
import { withMeaning } from '../ranks/names';
import { TreeArt } from '../tree/TreeArt';
import { TreePicture } from '../tree/TreeScene';
import { treeNamed } from '../tree/names';
import type { MyTree, TreeKindOffer, TreeState } from '../tree/useTree';
import { BuyConfirm } from './BuyConfirm';
import './yours.css';

/**
 * The tree in the Shop: every kind, which can be planted, which are free, and what the others cost. It works like the
 * nursery (tree/TreePage.tsx) with the same words, confirming in BuyConfirm: buying plants nothing, and planting warns
 * that the current tree goes while the water stays. On a phone the kinds are one swiped row. A server without trees
 * shows nothing.
 */

/** The kind a confirmation is about, and whether it buys or plants. */
type Ask = { kind: TreeKindOffer; what: 'buy' | 'plant' };

/** The section's heading, with a link to the tree at its end. */
function Heading({ id }: { id: string }): React.JSX.Element {
  const t = useT();
  return (
    <div className="yours-head">
      <h2 className="item-section-title" id={id}>
        {t('tree.eyebrow')}
      </h2>
      <Link className="yours-link" to="/app/tree">
        {t('tree.title')}
        <ChevronIcon size={14} className="yours-link-chevron" />
      </Link>
    </div>
  );
}

/** One kind's tile while the nursery loads: the square picture, its name and meaning, the price and the button. */
function TreeTileSkeleton(): React.JSX.Element {
  return (
    <div className="yours-tree">
      <Skeleton className="yours-tree-art" h="auto" />
      <span className="yours-tree-name">
        <Skeleton line w="64%" />
      </span>
      <span className="yours-tree-meaning">
        <Skeleton line w="46%" />
      </span>
      <span className="yours-tree-state">
        <Skeleton line w="58%" />
      </span>
      <Skeleton className="skeleton-btn skeleton-btn-sm yours-tree-act" />
    </div>
  );
}

export function YourTree({ tree, zer, onZer }: { tree: TreeState; zer: number | null; onZer: (zer: number) => void }): React.JSX.Element | null {
  const { client } = useAuth();
  const t = useT();
  const locale = useLocale();
  const headingId = `${useId().replace(/[^A-Za-z0-9_-]/g, '')}-tree`;
  const [asking, setAsking] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  // The kind just bought or planted here, which takes a small bow.
  const [won, setWon] = useState<TreeSpecies | null>(null);
  const [said, setSaid] = useState('');
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);
  const data = tree.data;

  if (tree.unavailable) return null;
  if (!data) {
    if (tree.loading)
      return (
        <section className="yours" aria-labelledby={headingId} aria-busy="true">
          <Heading id={headingId} />
          <span className="sr-only">{t('common.loading')}</span>
          <p className="yours-lead yours-lead--alone">
            <SkeletonText lines={2} lastWidth="44%" />
          </p>
          <ul className="yours-trees" aria-hidden="true">
            {Array.from({ length: 5 }, (_, i) => (
              <li key={i}>
                <TreeTileSkeleton />
              </li>
            ))}
          </ul>
        </section>
      );
    if (tree.error)
      return (
        <section className="yours" aria-labelledby={headingId}>
          <Heading id={headingId} />
          <div className="yours-card yours-failed">
            <p>{tree.error}</p>
            <Button variant="secondary" size="sm" onClick={tree.reload}>
              {t('common.retry')}
            </Button>
          </div>
        </section>
      );
    return null;
  }
  // An answer without the kinds offers nothing.
  if (!Array.isArray(data.kinds)) return null;

  // The Shop's own balance when it has one, since it reflects purchases made after the tree was read.
  const purse = zer ?? data.zer;
  const standing = data.tree?.species ?? null;

  /** Takes a newer tree from an action or a reload; the tiles and the Shop's balance follow it. */
  const learn = (next: MyTree): void => {
    tree.set(next);
    onZer(next.zer);
  };

  async function act(): Promise<void> {
    if (!asking || busy) return;
    const { kind, what } = asking;
    setBusy(true);
    setFailed(null);
    const res = what === 'buy' ? await client.post<MyTree>(`/me/tree/kinds/${kind.species}/buy`) : await client.post<MyTree>('/me/tree/plant', { species: kind.species });
    if (res.ok) {
      setBusy(false);
      learn(res.data);
      setAsking(null);
      setWon(kind.species);
      const named = treeNamed(t, kind.species).name;
      setSaid(`${named}: ${what === 'buy' ? t('tree.nursery.yours') : t('tree.nursery.standing')}`);
      return;
    }
    // Spent or bought elsewhere meanwhile: reload the tree. The dialog stays to show a shortfall, and closes for a kind
    // that turned out to be owned.
    if (res.error.code === 'INSUFFICIENT_FUNDS' || res.error.code === 'TREE_OWNED') {
      const again = await client.get<MyTree>('/me/tree');
      setBusy(false);
      if (again.ok && Array.isArray(again.data.kinds)) learn(again.data);
      if (res.error.code === 'TREE_OWNED') setAsking(null);
      return;
    }
    setBusy(false);
    setFailed(describeError(res.error, t));
  }

  const open = (kind: TreeKindOffer, what: Ask['what']): void => {
    setFailed(null);
    setWon(null);
    setAsking({ kind, what });
  };
  const close = (): void => {
    setAsking(null);
    setFailed(null);
  };

  // The question as the nursery asks it: buying says the cost, planting what it replaces.
  const asked = asking ? treeNamed(t, asking.kind.species) : null;
  const buying = asking?.what === 'buy';
  const askedShort = asking && buying ? Math.max(0, asking.kind.price - purse) : 0;

  return (
    <section className="yours" aria-labelledby={headingId}>
      <Heading id={headingId} />
      <p className="yours-lead yours-lead--alone">{standing ? t('tree.nursery.sub') : t('tree.choose.sub')}</p>
      <ul className="yours-trees">
        {data.kinds.map((kind) => {
          const named = treeNamed(t, kind.species);
          const here = kind.species === standing;
          const missing = kind.owned ? 0 : Math.max(0, kind.price - purse);
          const action = here ? null : kind.owned ? t('tree.nursery.plant') : t('tree.nursery.buy');
          return (
            <li key={kind.species}>
              <article
                className={`yours-tree${here ? ' is-standing' : ''}${won === kind.species ? ' is-won' : ''}`}
                style={{ '--tree': treeColour(kind.species) } as React.CSSProperties}
                aria-label={withMeaning(t, named)}
              >
                <span className="yours-tree-art">
                  {/* Full-grown in summer leaves, since in spring every flowering kind is pink. */}
                  <TreePicture species={kind.species} stage={TREE_FULL} season="summer" size={128} />
                </span>
                <span className="yours-tree-name">{named.name}</span>
                {named.meaning && <span className="yours-tree-meaning">{named.meaning}</span>}
                <span className="yours-tree-state">
                  {here ? (
                    <span className="yours-tree-now">{t('tree.nursery.standing')}</span>
                  ) : kind.owned ? (
                    <span className="yours-tree-note">{kind.starter ? t('tree.nursery.free') : t('tree.nursery.yours')}</span>
                  ) : (
                    <span className={`shop-price${missing > 0 ? ' is-short' : ''}`}>
                      <CoinIcon size={14} />
                      {`${number(kind.price)} Zêr`}
                      {missing > 0 && <span className="shop-short">{t('shop.amountMore', { amount: number(missing) })}</span>}
                    </span>
                  )}
                </span>
                {action && (
                  <Button
                    size="sm"
                    variant={kind.owned ? 'secondary' : 'primary'}
                    className="yours-tree-act"
                    disabled={busy || missing > 0}
                    onClick={() => open(kind, kind.owned ? 'plant' : 'buy')}
                    aria-label={`${action}: ${withMeaning(t, named)}`}
                  >
                    {action}
                  </Button>
                )}
              </article>
            </li>
          );
        })}
      </ul>
      <p className="sr-only" aria-live="polite">
        {said}
      </p>

      <BuyConfirm
        item={asking && asked ? { name: asked.name, price: buying ? asking.kind.price : 0, currency: 'zer' } : null}
        busy={busy}
        title={asked ? (buying ? t('tree.buy.title', { name: asked.name }) : t('tree.replace.title', { name: asked.name })) : undefined}
        art={asking ? <TreeArt species={asking.kind.species} stage={buying ? TREE_FULL : 0} size={150} /> : null}
        balance={buying ? purse : null}
        short={askedShort > 0 ? t('tree.buy.short', { count: number(askedShort) }) : null}
        note={
          asking
            ? buying
              ? t('tree.buy.body', { price: number(asking.kind.price) })
              : standing
                ? t('tree.replace.body', { current: treeNamed(t, standing).name })
                : t('tree.replace.first')
            : undefined
        }
        error={failed}
        confirmLabel={buying ? t('tree.buy.confirm') : t('tree.replace.confirm')}
        cancelLabel={buying || !standing ? t('common.cancel') : t('tree.replace.keep')}
        onConfirm={() => void act()}
        onCancel={close}
      />
    </section>
  );
}
