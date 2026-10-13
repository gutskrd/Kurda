import { useMemo, useState } from 'react';
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
  Stat,
  Table,
  TextInput,
  Textarea,
  errorLine,
  fromLocalInput,
  shortDate,
  toLocalInput,
  useLoad,
  useToast,
  type Column,
  type Tone,
} from '../ui';

type Currency = 'zer' | 'gems';

export interface ShopItem {
  sku: string;
  name: string;
  description: string | null;
  category: string;
  currency: Currency;
  price: number;
  isUnique: boolean;
  active: boolean;
  inStock: boolean;
  availableFrom: string | null;
  availableTo: string | null;
  assetKey: string | null;
  premiumOnly: boolean;
  displayOrder: number;
}

/** The categories POST /shop/items accepts, in words; `tag` was missing, so the Kurdish tag could not be saved. */
export const CATEGORIES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'background', label: 'Background' },
  { value: 'icon', label: 'Profile icon' },
  { value: 'cosmetic', label: 'Cosmetic' },
  { value: 'tag', label: 'Tag' },
  { value: 'powerup', label: 'Power-up' },
  { value: 'freeze', label: 'Streak freeze' },
  { value: 'misc', label: 'Other' },
];

const categoryName = (c: string): string => CATEGORIES.find((x) => x.value === c)?.label ?? c;

/** The price at which a change waits for a second admin (SENSITIVE_PRICE on the server). */
export const APPROVAL_PRICE = 1000;

const PAGE = 50;

export function priceText(price: number, currency: Currency): string {
  return price === 0 ? 'Free' : `${price.toLocaleString()} ${currency === 'gems' ? 'Gems' : 'Zêr'}`;
}

export type SaleState = 'on' | 'off' | 'scheduled' | 'ended' | 'hidden';

/**
 * Whether someone can buy it now, and if not why: retired, taken off sale, or
 * outside its sale window. All four keep it out of the shop for players; the
 * badge says which, because each is undone in a different place.
 */
export function saleState(item: Pick<ShopItem, 'active' | 'inStock' | 'availableFrom' | 'availableTo'>, now = Date.now()): SaleState {
  if (!item.active) return 'hidden';
  if (!item.inStock) return 'off';
  if (item.availableFrom && Date.parse(item.availableFrom) > now) return 'scheduled';
  if (item.availableTo && Date.parse(item.availableTo) < now) return 'ended';
  return 'on';
}

const STATE: Record<SaleState, { text: string; tone: Tone }> = {
  on: { text: 'On sale', tone: 'ok' },
  off: { text: 'Off sale', tone: 'warn' },
  scheduled: { text: 'Starts later', tone: 'info' },
  ended: { text: 'Sale ended', tone: 'neutral' },
  hidden: { text: 'Retired', tone: 'neutral' },
};

function windowText(item: ShopItem): string | null {
  const from = item.availableFrom ? shortDate(new Date(item.availableFrom)) : null;
  const to = item.availableTo ? shortDate(new Date(item.availableTo)) : null;
  if (from && to) return `${from} – ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Until ${to}`;
  return null;
}

type StateFilter = 'all' | SaleState;

/**
 * The shop's catalogue: what is on sale, at what price, and when.
 *
 * Prices are the server's: a purchase sends only the SKU and is refused if
 * the price moved since the player saw it, so a change here is safe the moment
 * it lands. A new price of 1,000 or more waits for a second admin (Approvals);
 * the server refuses it anywhere else, and the form says so before saving.
 *
 * The form used to drop an item's sale window on every edit, had no `tag`
 * category (so the Kurdish tag could not be saved), and reported problems with
 * the browser's alert.
 */
export function Shop(): React.JSX.Element {
  const toast = useToast();
  const items = useLoad(() => api<{ items: ShopItem[] }>('/admin/shop/items').then((r) => r.items), []);
  // shop changes waiting for a second admin, so a saved-but-pending price is not a mystery
  const pending = useLoad(
    () => api<{ pending: { target: string }[] }>('/admin/config/changes').then((r) => r.pending.filter((c) => c.target === 'shop_item').length),
    [],
  );
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('all');
  const [state, setState] = useState<StateFilter>('all');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<ShopItem | 'new' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const all = items.data;
  const counts = useMemo(() => {
    const c: Record<SaleState, number> = { on: 0, off: 0, scheduled: 0, ended: 0, hidden: 0 };
    for (const i of all ?? []) c[saleState(i)] += 1;
    return c;
  }, [all]);

  const shown = useMemo(() => {
    if (!all) return null;
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter(
      (i) =>
        (category === 'all' || i.category === category) &&
        (state === 'all' || saleState(i) === state) &&
        words.every((w) => `${i.name} ${i.sku} ${i.description ?? ''}`.toLowerCase().includes(w)),
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
      await items.reload();
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

  const filtered = q.trim() !== '' || category !== 'all' || state !== 'all';

  return (
    <div>
      <PageHeader
        title="Shop"
        subtitle="What is on sale, at what price, and when. A price of 1,000 or more waits for a second admin."
        actions={
          <>
            <Button icon="refresh" onClick={() => void Promise.all([items.reload(), pending.reload()])} disabled={items.loading}>
              Refresh
            </Button>
            <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
              New item
            </Button>
          </>
        }
      />

      {(pending.data ?? 0) > 0 && (
        <Banner tone="info" title={`${pending.data} shop ${pending.data === 1 ? 'change waits' : 'changes wait'} for a second admin`} actions={<a href="#/approvals">Open Approvals</a>}>
          A price of 1,000 or more takes effect once another admin approves it.
        </Banner>
      )}

      <div className="stats">
        <Stat icon="store" label="On sale" value={all ? counts.on.toLocaleString() : '…'} />
        <Stat label="Off sale" value={all ? counts.off.toLocaleString() : '…'} hint="Taken out for now" />
        <Stat label="Outside their window" value={all ? (counts.scheduled + counts.ended).toLocaleString() : '…'} hint="Not started, or ended" />
        <Stat label="Retired" value={all ? counts.hidden.toLocaleString() : '…'} />
      </div>

      <Section flush title={shown ? `Items (${total.toLocaleString()}${filtered ? ` of ${(all?.length ?? 0).toLocaleString()}` : ''})` : 'Items'}>
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
            {CATEGORIES.map((c) => (
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
          loading={items.loading}
          error={items.error}
          onRetry={() => void items.reload()}
          what="the shop"
          empty={filtered ? 'No item matches these filters.' : 'No items yet. Add one with New item.'}
          paging={{ page: at, pageCount, onPage: setPage, total, pageSize: PAGE }}
          actions={(i) => (
            <>
              <Button onClick={() => setEditing(i)} aria-label={`Edit “${i.name}”`}>
                Edit
              </Button>
              {i.active && (
                <Button onClick={() => void toggleSale(i)} busy={busy === i.sku}>
                  {i.inStock ? 'Take off sale' : 'Put on sale'}
                </Button>
              )}
            </>
          )}
        />
      </Section>

      {editing && (
        <ItemForm
          key={editing === 'new' ? 'new' : editing.sku}
          item={editing === 'new' ? null : editing}
          taken={new Set((all ?? []).map((i) => i.sku))}
          onClose={() => setEditing(null)}
          onSaved={async (message) => {
            setEditing(null);
            toast.success(message);
            await Promise.all([items.reload(), pending.reload()]);
          }}
        />
      )}
    </div>
  );
}

/**
 * Whether saving this goes to a second admin: a price (or currency) that is new
 * and at or over the line. The rest of a dear item saves at once.
 */
export function needsApproval(before: Pick<ShopItem, 'price' | 'currency'> | null, price: number, currency: Currency): boolean {
  if (price < APPROVAL_PRICE) return false;
  return !before || before.price !== price || before.currency !== currency;
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
  const [category, setCategory] = useState(item?.category ?? 'background');
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
  // the categories the server accepts, plus one an older item may carry
  const categories = CATEGORIES.some((c) => c.value === category) ? CATEGORIES : [...CATEGORIES, { value: category, label: category }];

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
        <Checkbox label="Listed" hint="Off retires it: it leaves the shop and Premium stops lending it. Anyone who bought it keeps it." checked={active} onChange={setActive} />
        {problem && (
          <p className="field-error" role="alert">
            {problem}
          </p>
        )}
      </form>
    </Drawer>
  );
}
