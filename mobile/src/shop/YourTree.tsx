import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TREE_FULL } from '@kurda/shared';
import { describeError, isMaintenance } from '../api/errors';
import type { ApiError } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import { ZerValue } from './value';
import { useDirection } from '../reports/direction';
import { Sheet } from '../stories/ui';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { buyTreeKind, getTree, plantTree, treesMissing, type MyTree, type TreeKindOffer } from '../tree/api';
import { treeNamed } from '../tree/names';
import { TreeArt } from '../tree/TreeArt';
import { TreePicture } from '../tree/TreeScene';
import { ART, YoursRow, YoursRowSkeleton } from './YoursRow';

/**
 * Your tree in the Shop, as on the website (web/src/shop/YourTree.tsx): a row showing the tree that stands, opening the
 * tree screen's nursery (tree/TreeScreen `Nursery`) in the sheet itself: every kind, which are yours, which are free
 * and what the others cost. Buying plants nothing; planting is confirmed first, since the standing tree is replaced
 * (the water held stays). A guest is never asked about, and a server with no trees shows nothing.
 */

/** What `GET /me/tree` holds, and the way to read it again or put a newer answer in its place. */
export interface ShopTreeState {
  data: MyTree | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => Promise<void>;
  set: (next: MyTree) => void;
}

/** Whether an answer is the tree at all, rather than something an older server sent. */
const isMyTree = (value: unknown): value is MyTree => typeof value === 'object' && value !== null && Array.isArray((value as Partial<MyTree>).kinds);

/**
 * The tree as the Shop needs it, read with the Shop's catalogue (on focus and on pull). A later failed read keeps what
 * the first one showed.
 */
export function useShopTree(): ShopTreeState {
  const { client, isGuest } = useAuth();
  const [state, setState] = useState<{ data: MyTree | null; loading: boolean; error: ApiError | null }>({ data: null, loading: !isGuest, error: null });
  const reload = useCallback(async () => {
    if (isGuest) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const res = await getTree(client);
    if (res.ok) setState({ data: isMyTree(res.data) ? res.data : null, loading: false, error: null });
    else if (treesMissing(res) || res.error.status === 403) setState({ data: null, loading: false, error: null });
    else setState((s) => ({ data: s.data, loading: false, error: s.data ? null : res.error }));
  }, [client, isGuest]);
  const set = useCallback((data: MyTree) => setState({ data, loading: false, error: null }), []);
  return { ...state, reload, set };
}

export function YourTree({ tree, zer, onZer }: { tree: ShopTreeState; zer: number | null; onZer: (zer: number) => void }): React.JSX.Element | null {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const data = tree.data;

  if (!data) {
    if (tree.loading) return <YoursRowSkeleton />;
    if (tree.error)
      return (
        <YoursRow
          art={<TreePicture species="beru" stage={TREE_FULL} season="summer" size={ART} />}
          label={t('tree.eyebrow')}
          value={t('common.retry')}
          onPress={() => void tree.reload()}
          testID="shop-your-tree"
        />
      );
    return null;
  }

  const standing = data.tree;
  const first = data.kinds.find((k) => k.starter)?.species ?? 'beru';
  return (
    <>
      <YoursRow
        art={
          standing ? (
            <TreePicture species={standing.species} stage={standing.stage} health={standing.health} size={ART} />
          ) : (
            <TreePicture species={first} stage={TREE_FULL} season="summer" size={ART} />
          )
        }
        label={t('tree.eyebrow')}
        value={standing ? `${treeNamed(t, standing.species).name} · ${t('tree.nursery.standing')}` : t('tree.choose.title')}
        onPress={() => setOpen(true)}
        testID="shop-your-tree"
      />
      {open ? <Nursery tree={tree} data={data} zer={zer ?? data.zer} onZer={onZer} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/**
 * The nursery in the Shop: every kind, and once one is picked its question as the sheet's second step, so nothing opens
 * over anything. Planted, the sheet closes on the Shop; bought, it goes back to the kinds, where the new one is yours
 * to plant.
 */
function Nursery({ tree, data, zer, onZer, onClose }: { tree: ShopTreeState; data: MyTree; zer: number; onZer: (zer: number) => void; onClose: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const [asking, setAsking] = useState<{ kind: TreeKindOffer; what: 'buy' | 'plant' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const number = (n: number): string => formatNumber(n, locale);
  const standing = data.tree?.species ?? null;

  /** A newer tree, as an action or a second look answered it: the kinds and the Shop's purse follow it. */
  const learn = (next: MyTree): void => {
    tree.set(next);
    onZer(next.zer);
  };

  const act = async (kind: TreeKindOffer, what: 'buy' | 'plant'): Promise<void> => {
    setBusy(true);
    setFailed(null);
    const res = what === 'buy' ? await buyTreeKind(client, kind.species) : await plantTree(client, kind.species);
    if (res.ok) {
      setBusy(false);
      haptic('correct');
      learn(res.data);
      setAsking(null);
      // Planted: back to the Shop, whose row shows the seed; bought: back to the kinds, where it is now theirs to
      // plant.
      if (what === 'plant') onClose();
      return;
    }
    // Spent elsewhere meanwhile, or bought already: the tree is read again, and what it says now is shown.
    if (res.error.code === 'INSUFFICIENT_FUNDS' || res.error.code === 'TREE_OWNED') {
      const again = await getTree(client);
      setBusy(false);
      if (again.ok && isMyTree(again.data)) learn(again.data);
      if (res.error.code === 'TREE_OWNED') setAsking(null);
      else haptic('error');
      return;
    }
    setBusy(false);
    if (isMaintenance(res.error)) return;
    haptic('error');
    setFailed(describeError(res.error, t));
  };

  if (asking) {
    const asked = treeNamed(t, asking.kind.species);
    const buying = asking.what === 'buy';
    const short = buying ? Math.max(0, asking.kind.price - zer) : 0;
    return (
      <Sheet
        title={buying ? t('tree.buy.title', { name: asked.name }) : t('tree.replace.title', { name: asked.name })}
        onClose={onClose}
        footer={
          <>
            <ClayButton
              label={buying ? t('tree.buy.confirm') : t('tree.replace.confirm')}
              tone="primary"
              size="large"
              busy={busy}
              disabled={short > 0}
              onPress={() => void act(asking.kind, asking.what)}
              testID="shop-tree-confirm"
            />
            <ClayButton
              label={buying || !standing ? t('common.cancel') : t('tree.replace.keep')}
              variant="outline"
              disabled={busy}
              onPress={() => {
                setAsking(null);
                setFailed(null);
              }}
              testID="shop-tree-back"
            />
          </>
        }
      >
        <View style={styles.ask}>
          <TreeArt species={asking.kind.species} stage={buying ? TREE_FULL : 0} size={150} />
          {buying ? (
            <View style={[styles.price, { flexDirection: dir.row }]}>
              <Icon name="coin" size={18} color={colors.gold} />
              <Text style={[styles.priceText, { color: colors.textPrimary }]}>{`${number(asking.kind.price)} Zêr`}</Text>
              <ZerValue zer={asking.kind.price} />
            </View>
          ) : null}
          {buying ? <Text style={[styles.balance, { color: colors.textSecondary }]}>{t('shop.balance', { zer: number(zer) })}</Text> : null}
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            {buying ? t('tree.buy.body', { price: number(asking.kind.price) }) : standing ? t('tree.replace.body', { current: treeNamed(t, standing).name }) : t('tree.replace.first')}
          </Text>
          {short > 0 ? <Text style={[styles.short, { color: colors.textPrimary }]}>{t('tree.buy.short', { count: number(short) })}</Text> : null}
          {failed ? (
            <Text style={[styles.body, { color: colors.danger }]} accessibilityRole="alert">
              {failed}
            </Text>
          ) : null}
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet title={t('tree.nursery.title')} onClose={onClose}>
      <Text style={[styles.body, { color: colors.textSecondary }]}>{standing ? t('tree.nursery.sub') : t('tree.choose.sub')}</Text>
      <View style={[styles.price, { flexDirection: dir.row }]} accessible accessibilityLabel={`${number(zer)} Zêr`}>
        <Icon name="coin" size={18} color={colors.gold} />
        <Text style={[styles.priceText, { color: colors.textPrimary }]}>{`${number(zer)} Zêr`}</Text>
      </View>
      {data.kinds.map((kind) => {
        const here = kind.species === standing;
        return (
          <KindRow
            key={kind.species}
            kind={kind}
            zer={zer}
            busy={busy}
            note={here ? t('tree.nursery.standing') : kind.starter ? t('tree.nursery.free') : kind.owned ? t('tree.nursery.yours') : undefined}
            action={here ? null : kind.owned ? t('tree.nursery.plant') : t('tree.nursery.buy')}
            onAct={() => {
              setFailed(null);
              setAsking({ kind, what: kind.owned ? 'plant' : 'buy' });
            }}
          />
        );
      })}
    </Sheet>
  );
}

/**
 * One kind as a row, as in the nursery: the tree full-grown in summer, its name and meaning, and its price or owner.
 * One that cannot be afforded says how much is missing, and still opens its question.
 */
function KindRow({
  kind,
  zer,
  busy,
  note,
  action,
  onAct,
}: {
  kind: TreeKindOffer;
  zer: number;
  busy: boolean;
  /** In place of a price: "Free", "Yours", "Growing now" */
  note?: string;
  /** The button's words; none for the kind that stands. */
  action: string | null;
  onAct: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const named = treeNamed(t, kind.species);
  const said = named.meaning ? `${named.name} (${named.meaning})` : named.name;
  const missing = kind.owned ? 0 : Math.max(0, kind.price - zer);
  return (
    <View style={[styles.kind, { flexDirection: dir.row, backgroundColor: colors.surface }]} testID={`shop-tree-${kind.species}`}>
      <TreePicture species={kind.species} stage={TREE_FULL} season="summer" size={84} />
      <View style={styles.kindText}>
        <Text style={[styles.kindName, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
          {named.name}
        </Text>
        {named.meaning ? (
          <Text style={[styles.kindMeaning, dir.text, { color: colors.textSecondary }]} numberOfLines={1}>
            {named.meaning}
          </Text>
        ) : null}
        {note ? (
          <Text style={[styles.kindNote, dir.text, { color: colors.textPrimary }]}>{note}</Text>
        ) : (
          <View style={[styles.kindPrice, { flexDirection: dir.row }]}>
            <Icon name="coin" size={15} color={colors.gold} />
            <Text style={[styles.kindNote, { color: missing > 0 ? colors.textSecondary : colors.textPrimary }]}>{formatNumber(kind.price, locale)}</Text>
            <ZerValue zer={kind.price} />
          </View>
        )}
        {!note && missing > 0 ? <Text style={[styles.kindShort, dir.text, { color: colors.textSecondary }]}>{t('tree.buy.short', { count: formatNumber(missing, locale) })}</Text> : null}
        {action ? (
          <ClayButton label={action} accessibilityLabel={`${action}: ${said}`} tone={kind.owned ? 'neutral' : 'primary'} disabled={busy} onPress={onAct} style={styles.kindAct} testID={`shop-tree-act-${kind.species}`} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: typography.sizes.text, lineHeight: 22, textAlign: 'center' },
  price: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  priceText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  balance: { fontSize: typography.sizes.text, textAlign: 'center', fontVariant: ['tabular-nums'] },
  short: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, textAlign: 'center' },
  ask: { alignItems: 'center', gap: spacing.sm },
  kind: { alignItems: 'center', gap: spacing.md, borderRadius: radii.lg, padding: spacing.sm + 2 },
  kindText: { flex: 1, gap: 2 },
  kindName: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  kindMeaning: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  kindNote: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  kindPrice: { alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  kindShort: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  kindAct: { alignSelf: 'stretch', marginTop: spacing.xs },
});
