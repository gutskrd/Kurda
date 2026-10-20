/**
 * Deleting an item, asked about first in words that say what will happen.
 *
 * Whether it is deleted or retired is the server's to decide — it counts who
 * owns, wears or was given the item under a lock (api/src/shop/catalogue.ts)
 * — so the question asks it first (GET …/usage) and says which it will be,
 * and the answer after says which it was.
 */
import { useEffect, useState } from 'react';
import { api } from '../api';
import { Button, Dialog, ErrorState, errorLine } from '../ui';
import { ownersText, type ShopItem } from './model';

export interface ItemUsage {
  sku: string;
  owners: number;
  equipped: number;
  gifts: number;
  refunds: number;
  builtIn: boolean;
  outcome: 'delete' | 'retire';
}

export interface RemoveResult extends Omit<ItemUsage, 'outcome'> {
  outcome: 'deleted' | 'retired';
  unequipped: number;
  artReleased: boolean;
}

const people = (n: number): string => `${n.toLocaleString()} ${n === 1 ? 'person' : 'people'}`;

/** Why it will be retired, in a sentence: the first thing that keeps it. */
function whyKept(u: ItemUsage): string {
  if (u.owners > 0) return `${ownersText(u.owners)}, so it can’t be deleted.`;
  if (u.equipped > 0) return `${people(u.equipped)} ${u.equipped === 1 ? 'is' : 'are'} wearing it, so it can’t be deleted.`;
  if (u.gifts > 0) return `It was given as a gift ${u.gifts === 1 ? 'once' : `${u.gifts.toLocaleString()} times`}, and deleting it would take the gift out of those chats.`;
  if (u.refunds > 0) return 'Refunds were recorded for it when its art was replaced, so it is kept with them.';
  return 'It is part of the art that ships with the app, so it is kept as a retired item rather than deleted — that way a re-seed of the catalogue can’t bring it back.';
}

/** The toast after: what happened, in one line. */
export function removedText(name: string, r: RemoveResult): string {
  if (r.outcome === 'deleted') return `Deleted “${name}”.`;
  return r.owners > 0
    ? `Retired “${name}”. ${people(r.owners)} ${r.owners === 1 ? 'owns' : 'own'} it and can still wear it.`
    : `Retired “${name}”. It has left the shop.`;
}

export function RemoveDialog({
  item,
  onClose,
  onDone,
}: {
  item: ShopItem;
  onClose: () => void;
  onDone: (result: RemoveResult) => Promise<void>;
}): React.JSX.Element {
  const [usage, setUsage] = useState<ItemUsage | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoadError(null);
    api<ItemUsage>(`/admin/shop/items/${encodeURIComponent(item.sku)}/usage`)
      .then((u) => alive && setUsage(u))
      .catch((err: unknown) => alive && setLoadError(err));
    return () => {
      alive = false;
    };
  }, [item.sku, attempt]);

  async function remove(): Promise<void> {
    setBusy(true);
    setProblem(null);
    try {
      const result = await api<RemoveResult>(`/shop/items/${encodeURIComponent(item.sku)}`, { method: 'DELETE' });
      await onDone(result);
    } catch (err) {
      setProblem(errorLine(err, 'the shop'));
      setBusy(false);
    }
  }

  const retire = usage?.outcome === 'retire';
  const title = !usage ? `Delete “${item.name}”?` : retire ? `Retire “${item.name}”?` : `Delete “${item.name}”?`;
  return (
    <Dialog
      open
      title={title}
      onClose={onClose}
      dismissable={false}
      alert
      footer={
        <>
          <Button onClick={onClose} data-autofocus>
            Cancel
          </Button>
          <Button className="danger-solid" onClick={() => void remove()} busy={busy} disabled={!usage}>
            {busy ? (retire ? 'Retiring…' : 'Deleting…') : retire ? 'Retire' : 'Delete'}
          </Button>
        </>
      }
    >
      {loadError ? (
        <ErrorState error={loadError} what="the shop" compact onRetry={() => setAttempt((n) => n + 1)} />
      ) : !usage ? (
        <p className="dialog-text" aria-busy="true">
          Checking who has it…
        </p>
      ) : retire ? (
        <div className="remove-text">
          <p className="dialog-text">{whyKept(usage)}</p>
          <p className="dialog-text">
            It will be retired instead: it leaves the shop and this list, and nobody can buy it any more.
            {usage.owners > 0 ? ' Everyone who owns it keeps it and can still wear it.' : ''}
          </p>
        </div>
      ) : (
        <div className="remove-text">
          <p className="dialog-text">Nobody owns it, wears it or has been given it, so it will be deleted for good.</p>
          {item.assetKey?.startsWith('cosmetic/') && <p className="dialog-text">Its picture is removed from storage a day later.</p>}
        </div>
      )}
      {problem && (
        <p className="field-error" role="alert">
          {problem}
        </p>
      )}
    </Dialog>
  );
}
