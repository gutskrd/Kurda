import { useMemo, useState } from 'react';
import { foldForSearch } from '@kurda/shared';
import { api, ApiError } from '../api';
import {
  Badge,
  Banner,
  Button,
  Checkbox,
  Drawer,
  FieldRow,
  FormActions,
  Icon,
  PageHeader,
  Section,
  Select,
  Table,
  TabPanel,
  Tabs,
  TextInput,
  Textarea,
  errorLine,
  fromLocalInput,
  shortDate,
  toLocalInput,
  useLoad,
  useToast,
  type Column,
} from '../ui';
import { ArtCatalogue } from '../shop/ArtCatalogue';
import { ArtForm } from '../shop/ArtForm';
import { KIND_NAME } from '../shop/art';
import { RemoveDialog, removedText } from '../shop/RemoveDialog';
import {
  CATEGORIES,
  STATE,
  categoryName,
  isArtKind,
  needsApproval,
  priceText,
  saleState,
  type ArtKind,
  type Currency,
  type SaleState,
  type ShopItem,
} from '../shop/model';

// what the page has always offered to other modules and its tests
export { APPROVAL_PRICE, CATEGORIES, needsApproval, priceText, saleState, type SaleState, type ShopItem } from '../shop/model';

const PAGE = 50;

/** Everything that is not a background or an icon: the table's categories. */
const OTHER_CATEGORIES = CATEGORIES.filter((c) => !isArtKind(c.value));

function windowText(item: ShopItem): string | null {
  const from = item.availableFrom ? shortDate(new Date(item.availableFrom)) : null;
  const to = item.availableTo ? shortDate(new Date(item.availableTo)) : null;
  if (from && to) return `${from} – ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Until ${to}`;
  return null;
}

/** 'listed' is everything not retired: what the shop has, or will have, on its shelves. */
type StateFilter = 'listed' | 'all' | SaleState;

type View = ArtKind | 'other';

/**
 * The shop's catalogue: what is on sale, at what price, and when.
 *
 * Backgrounds and icons are pictures, so each has a view of its own, as cards
 * with their art, where they are added with an uploaded picture, edited and
 * deleted (admin/src/shop). Everything else — tags, power-ups, streak freezes
 * — is in the table, as before.
 *
 * Prices are the server's: a purchase sends only the SKU and is refused if
 * the price moved since the player saw it, so a change here is safe the moment
 * it lands. A new price of 1,000 or more waits for a second admin (Approvals);
 * the server refuses it anywhere else, and the forms say so before saving.
 *
 * The form used to drop an item's sale window on every edit, had no `tag`
 * category (so the Kurdish tag could not be saved), and reported problems with
 * the browser's alert.
 */
export function Shop(): React.JSX.Element {
  const toast = useToast();
  // retired items too: the views leave them out until asked for
  const items = useLoad(() => api<{ items: ShopItem[] }>('/admin/shop/items?retired=include').then((r) => r.items), []);
  // shop changes waiting for a second admin, so a saved-but-pending price is not a mystery
  const pending = useLoad(
    () => api<{ pending: { target: string }[] }>('/admin/config/changes').then((r) => r.pending.filter((c) => c.target === 'shop_item').length),
    [],
  );
  const [view, setView] = useState<View>('background');
  const [editing, setEditing] = useState<ShopItem | 'new' | null>(null);
  const [removing, setRemoving] = useState<ShopItem | null>(null);

  const all = items.data;
  const taken = useMemo(() => new Set((all ?? []).map((i) => i.sku)), [all]);
  const count = (v: View): number | undefined =>
    all ? all.filter((i) => (v === 'other' ? !isArtKind(i.category) : i.category === v) && !i.retiredAt).length : undefined;
  const reload = (): Promise<unknown> => Promise.all([items.reload(), pending.reload()]);
  const saved = async (message: string): Promise<void> => {
    setEditing(null);
    toast.success(message);
    await reload();
  };
  const nextOrder = (kind: ArtKind): number =>
    Math.min(100_000, Math.max(0, ...(all ?? []).filter((i) => i.category === kind).map((i) => i.displayOrder)) + 1);

  return (
    <div>
      <PageHeader
        title="Shop"
        subtitle="Backgrounds, icons and everything else on sale, at what price, and when. A price of 1,000 or more waits for a second admin."
        actions={
          <>
            <Button icon="refresh" onClick={() => void reload()} disabled={items.loading}>
              Refresh
            </Button>
            <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
              {view === 'other' ? 'New item' : `New ${KIND_NAME[view].one}`}
            </Button>
          </>
        }
      />

      {(pending.data ?? 0) > 0 && (
        <Banner tone="info" title={`${pending.data} shop ${pending.data === 1 ? 'change waits' : 'changes wait'} for a second admin`} actions={<a href="#/approvals">Open Approvals</a>}>
          A price of 1,000 or more takes effect once another admin approves it.
        </Banner>
      )}

      <Tabs<View>
        label="Kind of item"
        idBase="shop"
        value={view}
        onChange={(v) => {
          setView(v);
          setEditing(null);
        }}
        items={[
          { key: 'background', label: 'Backgrounds', count: count('background') },
          { key: 'icon', label: 'Icons', count: count('icon') },
          { key: 'other', label: 'Other items', count: count('other') },
        ]}
      />
      <TabPanel idBase="shop" value={view}>
        {view === 'other' ? (
          <OtherItems items={all ?? null} loading={items.loading} error={items.error} onReload={reload} onEdit={setEditing} />
        ) : (
          <ArtCatalogue
            key={view}
            kind={view}
            items={all ?? null}
            loading={items.loading}
            error={items.error}
            onRetry={() => void items.reload()}
            onAdd={() => setEditing('new')}
            onEdit={setEditing}
            onRemove={setRemoving}
          />
        )}
      </TabPanel>

      {editing && view !== 'other' && (
        <ArtForm
          key={editing === 'new' ? `new-${view}` : editing.sku}
          kind={view}
          item={editing === 'new' ? null : editing}
          taken={taken}
          nextOrder={nextOrder(view)}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      )}
      {editing && view === 'other' && (
        <ItemForm
          key={editing === 'new' ? 'new' : editing.sku}
          item={editing === 'new' ? null : editing}
          taken={taken}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      )}
      {removing && (
        <RemoveDialog
          item={removing}
          onClose={() => setRemoving(null)}
          onDone={async (result) => {
            setRemoving(null);
            toast.success(removedText(removing.name, result));
            await reload();
          }}
        />
      )}
    </div>
  );
}

/**
 * Everything that is not a picture — tags, power-ups, streak freezes — as a
 * table: what is on sale, at what price, and inside which window.
 */
function OtherItems({
  items,
  loading,
  error,
  onReload,
  onEdit,
}: {
  items: readonly ShopItem[] | null;
  loading: boolean;
  error: unknown;
  onReload: () => Promise<unknown>;
  onEdit: (item: ShopItem) => void;
}): React.JSX.Element {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('all');
  const [state, setState] = useState<StateFilter>('listed');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const all = useMemo(() => (items ? items.filter((i) => !isArtKind(i.category)) : null), [items]);
  const shown = useMemo(() => {
    if (!all) return null;
    // (Kurdish letters folded, as the shop folds them: "istikan" finds Îstîkan)
    const words = foldForSearch(q).split(/\s+/).filter(Boolean);
    return all.filter(
      (i) =>
        (category === 'all' || i.category === category) &&
        (state === 'all' || (state === 'listed' ? saleState(i) !== 'retired' : saleState(i) === state)) &&
        words.every((w) => foldForSearch(`${i.name} ${i.sku} ${i.description ?? ''}`).includes(w)),
    );
  }, [all, q, category, state]);
  const total = shown?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE));
  const at = Math.min(page, pageCount - 1);
  const rows = shown ? shown.slice(at * PAGE, (at + 1) * PAGE) : null;

  async function toggleSale(item: ShopItem): Promise<void> {
    setBusy(item.sku);
    try {
      await api(`/shop/items/${encodeURIComponent(item.sku)}/stock`, { method: 'PATCH', body: { inStock: !item.inStock } });
      toast.success(item.inStock ? `“${item.name}” is off sale. Anyone who owns it keeps it.` : `“${item.name}” is on sale again.`);
      await onReload();
    } catch (err) {
      toast.error(errorLine(err, 'the shop'));
    } finally {
      setBusy(null);
    }
  }

  const columns: Column<ShopItem>[] = [
    {
      key: 'item',
      header: 'Item',
      card: 'title',
      sort: (a, b) => a.name.localeCompare(b.name),
      cell: (i) => (
        <>
          <strong>{i.name}</strong>
          <span className="cell-sub">
            <code>{i.sku}</code>
            {i.description ? ` · ${i.description}` : ''}
          </span>
        </>
      ),
    },
    { key: 'category', header: 'Category', sort: (a, b) => categoryName(a.category).localeCompare(categoryName(b.category)), cell: (i) => categoryName(i.category) },
    {
      key: 'price',
      header: 'Price',
      align: 'end',
      sort: (a, b) => a.price - b.price || a.currency.localeCompare(b.currency),
      cell: (i) => <strong className="nowrap">{priceText(i.price, i.currency)}</strong>,
    },
    {
      key: 'state',
      header: 'Status',
      cell: (i) => {
        const s = STATE[saleState(i)];
        const window = windowText(i);
        return (
          <>
            <span className="badges">
              <Badge tone={s.tone}>{s.text}</Badge>
              {i.premiumOnly && <Badge tone="info">With Premium</Badge>}
            </span>
            {window && <span className="cell-sub">{window}</span>}
          </>
        );
      },
    },
  ];

  return (
    <Section flush title={shown && all ? `Items (${total.toLocaleString()}${total !== all.length ? ` of ${all.length.toLocaleString()}` : ''})` : 'Items'}>
      <div className="table-tools">
        <div className="search-box">
          <Icon name="search" size={16} />
          <input
            type="search"
            aria-label="Search items"
            placeholder="Search by name or SKU"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <select
          aria-label="Filter by category"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(0);
          }}
        >
          <option value="all">Every category</option>
          {OTHER_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          value={state}
          onChange={(e) => {
            setState(e.target.value as StateFilter);
            setPage(0);
          }}
        >
          <option value="listed">All but retired</option>
          <option value="all">Any status</option>
          {(Object.keys(STATE) as SaleState[]).map((k) => (
            <option key={k} value={k}>
              {STATE[k].text}
            </option>
          ))}
        </select>
      </div>
      <Table
        caption="Shop items"
        columns={columns}
        rows={rows}
        rowKey={(i) => i.sku}
        loading={loading}
        error={error}
        onRetry={() => void onReload()}
        what="the shop"
        empty={all && all.length > 0 ? 'No item matches these filters.' : 'No items yet. Add one with New item.'}
        paging={{ page: at, pageCount, onPage: setPage, total, pageSize: PAGE }}
        actions={(i) => (
          // Edit last, so it sits in the same place on every row
          <>
            {i.active && !i.retiredAt && (
              <Button onClick={() => void toggleSale(i)} busy={busy === i.sku}>
                {i.inStock ? 'Take off sale' : 'Put on sale'}
              </Button>
            )}
            <Button onClick={() => onEdit(i)} aria-label={`Edit “${i.name}”`}>
              Edit
            </Button>
          </>
        )}
      />
    </Section>
  );
}

/**
 * Create or edit an item. Every field the item has is on the form and is sent
 * back, because the catalogue route writes the whole row: an edit used to
 * clear the sale window it did not show.
 */
function ItemForm({
  item,
  taken,
  onClose,
  onSaved,
}: {
  item: ShopItem | null;
  taken: ReadonlySet<string>;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}): React.JSX.Element {
  const [sku, setSku] = useState(item?.sku ?? '');
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [category, setCategory] = useState(item?.category ?? 'cosmetic');
  const [currency, setCurrency] = useState<Currency>(item?.currency ?? 'zer');
  const [price, setPrice] = useState(String(item?.price ?? 0));
  const [from, setFrom] = useState(item?.availableFrom ? toLocalInput(item.availableFrom) : '');
  const [to, setTo] = useState(item?.availableTo ? toLocalInput(item.availableTo) : '');
  const [order, setOrder] = useState(String(item?.displayOrder ?? 0));
  const [assetKey, setAssetKey] = useState(item?.assetKey ?? '');
  const [active, setActive] = useState(item?.active ?? true);
  const [inStock, setInStock] = useState(item?.inStock ?? true);
  const [premiumOnly, setPremiumOnly] = useState(item?.premiumOnly ?? false);
  const [isUnique, setIsUnique] = useState(item?.isUnique ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // the server's line is the one that counts: once it has said "needs approval", the next save asks for one
  const [serverSaysDear, setServerSaysDear] = useState(false);
  const value = Number(price);
  const dear = serverSaysDear || (price !== '' && Number.isInteger(value) && needsApproval(item, value, currency));
  // the categories the server accepts, but for backgrounds and icons, which are added with a picture in their own
  // views; plus one an older item may carry
  const categories = OTHER_CATEGORIES.some((c) => c.value === category) ? OTHER_CATEGORIES : [...OTHER_CATEGORIES, { value: category, label: categoryName(category) }];

  function check(): Record<string, string> {
    const e: Record<string, string> = {};
    const s = sku.trim();
    if (!item) {
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(s)) e.sku = 'Lower-case letters, digits, - and _, starting with a letter or digit.';
      else if (taken.has(s)) e.sku = 'An item already has this SKU. Edit that one instead.';
    }
    if (!name.trim()) e.name = 'Give it a name.';
    if (price === '' || !Number.isInteger(value) || value < 0 || value > 10_000_000) e.price = 'A whole number from 0 to 10,000,000.';
    if (from && to && Date.parse(to) <= Date.parse(from)) e.to = 'The end comes after the start.';
    if (order !== '' && (!Number.isInteger(Number(order)) || Number(order) > 100_000)) e.order = 'A whole number up to 100,000.';
    return e;
  }

  async function save(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setProblem(null);
    const found = check();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const payload = {
      sku: item?.sku ?? sku.trim(),
      name: name.trim(),
      description: description.trim() || null,
      category,
      currency,
      price: value,
      isUnique,
      active,
      inStock,
      availableFrom: fromLocalInput(from),
      availableTo: fromLocalInput(to),
      assetKey: assetKey.trim() || null,
      premiumOnly,
      displayOrder: Number(order) || 0,
    };
    setBusy(true);
    try {
      if (dear) {
        // a price at or over the line waits for a second admin; this route takes nulls for "clear it"
        const res = await api<{ status: 'applied' | 'pending' }>('/admin/config/changes', { method: 'POST', body: { target: 'shop_item', payload } });
        await onSaved(
          res.status === 'pending' ? `“${payload.name}” is waiting in Approvals: a second admin signs off on its price.` : `Saved “${payload.name}”.`,
        );
      } else {
        // the catalogue route writes the whole row: a field left out is cleared, which is what null meant above
        const body = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== null));
        await api('/shop/items', { method: 'POST', body });
        await onSaved(item ? `Saved “${payload.name}”.` : `Added “${payload.name}” to the shop.`);
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PRICE_NEEDS_APPROVAL') {
        setServerSaysDear(true);
        setProblem('This price needs a second admin. Send it for approval, and it is applied once another admin approves it.');
      } else {
        setProblem(errorLine(err, 'the shop'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={item ? `Edit “${item.name}”` : 'New item'}
      footer={
        <FormActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="shop-item-form" busy={busy}>
            {busy ? 'Saving…' : dear ? 'Send for approval' : item ? 'Save' : 'Add item'}
          </Button>
        </FormActions>
      }
    >
      <form id="shop-item-form" className="form" noValidate onSubmit={(e) => void save(e)}>
        <FieldRow>
          <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} error={errors.name} placeholder="Newroz background" />
          <TextInput
            label="SKU"
            hint={item ? 'Can’t change: purchases point at it.' : 'Lower case, - and _. Can’t change later.'}
            value={sku}
            readOnly={!!item}
            onChange={(e) => setSku(e.target.value.toLowerCase())}
            required
            maxLength={80}
            autoCapitalize="off"
            spellCheck={false}
            error={errors.sku}
            placeholder="bg-newroz"
          />
        </FieldRow>
        <Textarea label="Description" hint="Shown on the shop card. Optional." rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
        <FieldRow>
          <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)} options={categories} />
          <Select
            label="Currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
            options={[
              { value: 'zer', label: 'Zêr' },
              { value: 'gems', label: 'Gems' },
            ]}
          />
          <TextInput
            label="Price"
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))}
            required
            error={errors.price}
            hint={value === 0 && price !== '' ? 'Free.' : undefined}
          />
        </FieldRow>
        {dear && (
          <Banner tone="info" title="A second admin approves this price">
            A price of 1,000 or more is applied once another admin approves it in Approvals. Until then the item stays as it is.
          </Banner>
        )}
        <FieldRow>
          <TextInput label="On sale from" type="datetime-local" hint="Empty: from now." value={from} onChange={(e) => setFrom(e.target.value)} />
          <TextInput label="On sale until" type="datetime-local" hint="Empty: no end." value={to} onChange={(e) => setTo(e.target.value)} error={errors.to} />
        </FieldRow>
        <FieldRow>
          <TextInput label="Order" hint="Lower shows first in its category." inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value.replace(/\D/g, ''))} error={errors.order} />
          <TextInput
            label="Art key"
            hint="The picture the app shows for it. Change it only to a key the art set has."
            value={assetKey}
            onChange={(e) => setAssetKey(e.target.value)}
            maxLength={200}
            autoCapitalize="off"
            spellCheck={false}
            placeholder="backgrounds/made-20-newroz.webp"
          />
        </FieldRow>
        <Checkbox label="On sale" hint="Off takes it out of the shop for now. Anyone who owns it keeps it." checked={inStock} onChange={setInStock} />
        <Checkbox label="One per person" hint="Someone who owns it no longer sees it in the shop." checked={isUnique} onChange={setIsUnique} />
        <Checkbox label="Included with Premium" hint="Anyone with Premium can use it without buying it, while it is listed." checked={premiumOnly} onChange={setPremiumOnly} />
        <Checkbox label="Listed" hint="Off hides it: it leaves the shop and Premium stops lending it. Anyone who bought it keeps it." checked={active} onChange={setActive} />
        {problem && (
          <p className="field-error" role="alert">
            {problem}
          </p>
        )}
      </form>
    </Drawer>
  );
}
