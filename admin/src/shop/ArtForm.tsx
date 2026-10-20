/**
 * Add or edit a background or an icon: its picture, name, description, price
 * and whether it is on sale. A full-screen sheet on a phone.
 *
 * An edit sends only what changed (PATCH /shop/items/:sku), so nothing it does
 * not show — a sale window, the one-per-person flag — is ever cleared. A new
 * item is added with POST /admin/shop/items, which refuses an SKU that is
 * taken instead of replacing that item. A price of 1,000 or more goes to a
 * second admin in Approvals, the whole change with it, as on the catalogue
 * table's form.
 */
import { useState } from 'react';
import { api, ApiError } from '../api';
import { Banner, Button, Checkbox, Drawer, FieldRow, FormActions, Select, TextInput, Textarea, errorLine } from '../ui';
import { ArtPicker, type UploadedArt } from './ArtPicker';
import { KIND_NAME, skuFrom } from './art';
import { needsApproval, type ArtKind, type Currency, type ShopItem } from './model';
import './shop.css';

/** What a new item of each kind starts at: what most of the shop's own cost. */
const DEFAULT_PRICE: Record<ArtKind, number> = { background: 500, icon: 700 };

type Changes = Partial<Pick<ShopItem, 'name' | 'description' | 'currency' | 'price' | 'premiumOnly' | 'displayOrder' | 'assetKey' | 'active' | 'inStock'>>;

const onSaleNow = (item: ShopItem): boolean => item.active && item.inStock && !item.retiredAt;

export function ArtForm({
  kind,
  item,
  taken,
  nextOrder,
  onClose,
  onSaved,
}: {
  kind: ArtKind;
  /** the item being edited, or null for a new one */
  item: ShopItem | null;
  /** every SKU in the catalogue, so a new one can be checked before it is sent */
  taken: ReadonlySet<string>;
  /** where a new item goes in its list: after the last one */
  nextOrder: number;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}): React.JSX.Element {
  const names = KIND_NAME[kind];
  const [name, setName] = useState(item?.name ?? '');
  const [sku, setSku] = useState<string | null>(null);
  const [description, setDescription] = useState(item?.description ?? '');
  const [currency, setCurrency] = useState<Currency>(item?.currency ?? 'zer');
  const [price, setPrice] = useState(String(item?.price ?? DEFAULT_PRICE[kind]));
  const [order, setOrder] = useState(String(item?.displayOrder ?? nextOrder));
  const [premiumOnly, setPremiumOnly] = useState(item?.premiumOnly ?? true);
  const [onSale, setOnSale] = useState(item ? onSaleNow(item) : true);
  const [art, setArt] = useState<UploadedArt | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // the server's line is the one that counts: once it has said "needs approval", the next save asks for one
  const [serverSaysDear, setServerSaysDear] = useState(false);

  // a new item's SKU follows its name until someone types one
  const skuValue = item ? item.sku : (sku ?? skuFrom(kind, name));
  const value = Number(price);
  const dear = serverSaysDear || (price !== '' && Number.isInteger(value) && needsApproval(item, value, currency));
  const clear = (field: string): void => setErrors(({ [field]: _gone, ...rest }) => rest);

  function check(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!item) {
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(skuValue)) e.sku = 'Lower-case letters, digits, - and _, starting with a letter or digit.';
      else if (taken.has(skuValue)) e.sku = 'An item already has this SKU. Change the name or the SKU.';
      if (!art) e.art = `Choose ${names.a} picture.`;
    }
    if (!name.trim()) e.name = 'Give it a name.';
    if (price === '' || !Number.isInteger(value) || value < 0 || value > 10_000_000) e.price = 'A whole number from 0 to 10,000,000.';
    if (order === '' || !Number.isInteger(Number(order)) || Number(order) > 100_000) e.order = 'A whole number up to 100,000.';
    return e;
  }

  /** What an edit changes, field by field; nothing it does not show. */
  function changes(was: ShopItem): Changes {
    const c: Changes = {};
    if (name.trim() !== was.name) c.name = name.trim();
    if ((description.trim() || null) !== was.description) c.description = description.trim() || null;
    if (value !== was.price) c.price = value;
    if (currency !== was.currency) c.currency = currency;
    if (premiumOnly !== was.premiumOnly) c.premiumOnly = premiumOnly;
    if (Number(order) !== was.displayOrder) c.displayOrder = Number(order);
    if (art) c.assetKey = art.key;
    if (onSale !== onSaleNow(was)) {
      // on sale is listed and in stock (and so no longer retired); off sale only takes it out of stock
      if (onSale) Object.assign(c, { active: true, inStock: true });
      else c.inStock = false;
    }
    return c;
  }

  async function save(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setProblem(null);
    if (uploading) {
      setErrors((x) => ({ ...x, art: 'Wait for the picture to finish uploading.' }));
      return;
    }
    const found = check();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const label = name.trim();
    setBusy(true);
    try {
      if (!item) {
        const payload = {
          sku: skuValue,
          name: label,
          ...(description.trim() ? { description: description.trim() } : {}),
          category: kind,
          currency,
          price: value,
          isUnique: true,
          active: true,
          inStock: onSale,
          assetKey: art!.key,
          premiumOnly,
          displayOrder: Number(order),
        };
        if (dear) {
          await api('/admin/config/changes', { method: 'POST', body: { target: 'shop_item', payload } });
          await onSaved(`“${label}” is waiting in Approvals: a second admin signs off on its price.`);
        } else {
          await api('/admin/shop/items', { method: 'POST', body: payload });
          await onSaved(`Added “${label}” to the ${names.plural.toLowerCase()}.`);
        }
        return;
      }
      const c = changes(item);
      if (Object.keys(c).length === 0) {
        onClose();
        return;
      }
      if (dear) {
        // the approval applies what it names and keeps the rest of the item
        await api('/admin/config/changes', {
          method: 'POST',
          body: { target: 'shop_item', payload: { sku: item.sku, name: label, currency, price: value, ...c } },
        });
        await onSaved(`“${label}” is waiting in Approvals: a second admin signs off on its price.`);
      } else {
        await api(`/shop/items/${encodeURIComponent(item.sku)}`, { method: 'PATCH', body: c });
        await onSaved(`Saved “${label}”.`);
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PRICE_NEEDS_APPROVAL') {
        setServerSaysDear(true);
        setProblem('This price needs a second admin. Send it for approval, and it is applied once another admin approves it.');
      } else if (err instanceof ApiError && err.code === 'SKU_TAKEN') {
        setErrors((x) => ({ ...x, sku: 'An item already has this SKU. Change the name or the SKU.' }));
      } else if (err instanceof ApiError && err.code === 'ART_MISSING') {
        setArt(null);
        setErrors((x) => ({ ...x, art: 'That picture is no longer stored (an upload is kept for a day until an item uses it). Upload it again.' }));
      } else if (err instanceof ApiError && err.code === 'ART_WRONG_KIND') {
        setArt(null);
        setErrors((x) => ({ ...x, art: `That picture was uploaded for another kind of item. Upload ${names.a} picture.` }));
      } else {
        setProblem(errorLine(err, 'the shop'));
      }
    } finally {
      setBusy(false);
    }
  }

  const retired = Boolean(item?.retiredAt);
  return (
    <Drawer
      open
      onClose={onClose}
      className="art-sheet"
      title={item ? `Edit “${item.name}”` : `New ${names.one}`}
      footer={
        <FormActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="art-item-form" busy={busy} disabled={uploading}>
            {busy ? 'Saving…' : dear ? 'Send for approval' : item ? 'Save' : `Add ${names.one}`}
          </Button>
        </FormActions>
      }
    >
      <form id="art-item-form" className="form" noValidate onSubmit={(e) => void save(e)}>
        <ArtPicker
          kind={kind}
          currentUrl={item?.assetUrl ?? null}
          error={errors.art}
          onBusy={setUploading}
          onChange={(next) => {
            setArt(next);
            if (next) clear('art');
          }}
        />
        <TextInput
          label="Name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            clear('name');
            if (!item && sku === null) clear('sku');
          }}
          required
          maxLength={120}
          error={errors.name}
          placeholder={kind === 'background' ? 'Şeva Sor' : 'Îstîkan'}
        />
        <TextInput
          label="SKU"
          hint={item ? 'Can’t change: purchases point at it.' : 'Made from the name. Can’t change later.'}
          value={skuValue}
          readOnly={!!item}
          onChange={(e) => {
            setSku(e.target.value.toLowerCase());
            clear('sku');
          }}
          required
          maxLength={80}
          autoCapitalize="off"
          spellCheck={false}
          error={errors.sku}
        />
        <Textarea
          label="Description"
          hint="Shown on the shop card. Optional."
          rows={2}
          maxLength={500}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <FieldRow>
          <TextInput
            label="Price"
            inputMode="numeric"
            value={price}
            onChange={(e) => {
              setPrice(e.target.value.replace(/\D/g, ''));
              clear('price');
            }}
            required
            error={errors.price}
            hint={value === 0 && price !== '' ? 'Free.' : undefined}
          />
          <Select
            label="Currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
            options={[
              { value: 'zer', label: 'Zêr' },
              { value: 'gems', label: 'Gems' },
            ]}
          />
        </FieldRow>
        {dear && (
          <Banner tone="info" title="A second admin approves this price">
            A price of 1,000 or more is applied once another admin approves it in Approvals. Until then the item stays as it is.
          </Banner>
        )}
        <Checkbox
          label="On sale"
          hint={
            retired
              ? 'It is retired. On sale puts it back in the shop and in this list.'
              : 'Off keeps it out of the shop for now. Anyone who owns it keeps it.'
          }
          checked={onSale}
          onChange={setOnSale}
        />
        <Checkbox
          label="Included with Premium"
          hint="Anyone with Premium can use it without buying it, while it is on sale."
          checked={premiumOnly}
          onChange={setPremiumOnly}
        />
        <TextInput
          label="Position"
          hint={`Lower shows first among the ${names.plural.toLowerCase()}.`}
          inputMode="numeric"
          value={order}
          onChange={(e) => {
            setOrder(e.target.value.replace(/\D/g, ''));
            clear('order');
          }}
          error={errors.order}
          fieldClassName="art-position"
        />
        {problem && (
          <p className="field-error" role="alert">
            {problem}
          </p>
        )}
      </form>
    </Drawer>
  );
}
