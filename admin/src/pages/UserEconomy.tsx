import { useState } from 'react';
import { api } from '../api';
import { humanize } from '../moderation';
import { Badge, Button, FieldRow, FormActions, Section, Select, Table, TextInput, Time, errorLine, useDialogs, useLoad, useToast, type Column } from '../ui';

/**
 * A person's balances, ledger, items and Hevalo+ membership, and for a superadmin a change to any of them. The API
 * moves money through the double-entry ledger, never editing a balance, and audits every change with its reason.
 */

interface EconomyUser {
  id: string;
  username: string;
  balances: { zer: number };
  premiumUntil?: string | null;
  ledger: Array<{ currency: string; amount: number; reason: string; createdAt: string }>;
}

export interface OwnedItem {
  sku: string;
  name: string;
  category: string;
  quantity: number;
  source: string;
  equipped: boolean;
}

/** The ledger's currencies by name: Zêr, and Gewher on the rows from before it was folded into Zêr. */
const CURRENCY: Readonly<Record<string, string>> = { zer: 'Zêr', gems: 'Gewher' };

/** The ledger's reasons as people say them; one this build doesn't know is shown by its key. */
const LEDGER_REASON: Readonly<Record<string, string>> = {
  admin_adjustment: 'Changed by an admin',
  shop_purchase: 'Shop purchase',
  // From before purchases were final: the ledger keeps every row it ever had.
  shop_return: 'Shop return (no longer offered)',
  daily_quest: 'Daily quest chest',
  event_quest: 'Event quest reward',
  iap_refund: 'Taken back after a store refund',
  iap_purchase: 'Bought in the app store',
  gift: 'Gift',
  daily_reward: 'Daily reward',
  quest_reward: 'Quest reward',
  tournament_reward: 'Tournament prize',
  season_reward: 'Season reward',
  streak_repair: 'Streak restored',
  members_box: 'Hevalo+ members’ box',
  'earn:streak_milestone': 'Streak milestone',
  'earn:online_win': 'Win against another person',
  'earn:quiz_podium': 'Quiz night podium',
  'earn:league_promotion': 'League promotion',
  'earn:tournament_win': 'Tournament win',
  gewher_retired: 'Gewher folded into Zêr',
  gewher_converted: 'Zêr from folded Gewher',
  // From before Gewher was folded into Zêr: the ledger keeps every row it ever had.
  plus_daily: 'Hevalo+ daily Gewher (no longer given)',
};

export function ledgerReason(reason: string): string {
  return Object.hasOwn(LEDGER_REASON, reason) ? LEDGER_REASON[reason]! : humanize(reason);
}

type LedgerRow = EconomyUser['ledger'][number];
const LEDGER_COLUMNS: ReadonlyArray<Column<LedgerRow>> = [
  { key: 'what', header: 'What', card: 'title', cell: (r) => <strong>{ledgerReason(r.reason)}</strong> },
  {
    key: 'amount',
    header: 'Amount',
    align: 'end',
    cell: (r) => (
      <span className={r.amount < 0 ? 'is-negative' : undefined}>
        {r.amount > 0 ? '+' : ''}
        {r.amount.toLocaleString()} {CURRENCY[r.currency] ?? r.currency}
      </span>
    ),
  },
  { key: 'when', header: 'When', cell: (r) => <Time value={r.createdAt} /> },
];

export function WalletPanel({ user, canAdjust, onChanged }: { user: EconomyUser; canAdjust: boolean; onChanged: () => void }): React.JSX.Element {
  return (
    <>
      <Section title="Balances">
        <div className="balances">
          <div className="balance">
            <div className="balance-n">{user.balances.zer.toLocaleString()}</div>
            <div className="balance-k">Zêr</div>
          </div>
        </div>
      </Section>
      {canAdjust && <AdjustForm user={user} onChanged={onChanged} />}
      <PlusSection user={user} canAdjust={canAdjust} onChanged={onChanged} />
      <Section title="Ledger" description="The latest 20 movements, newest first." flush>
        <Table caption="Ledger" columns={LEDGER_COLUMNS} rows={user.ledger} rowKey={(r) => `${r.createdAt}-${r.currency}-${r.amount}-${r.reason}`} empty="No movements yet." />
      </Section>
    </>
  );
}

/** The most one change may add or take away, as the API allows. */
export const WALLET_ADJUST_MAX = 1_000_000;
/**
 * From here a credit is asked in red and the amount typed again (the shop's second-admin line). It does not wait for a
 * second admin, who may not exist; retyping catches a slip like 1000000 for 1000.
 */
const LARGE_ADJUSTMENT = 1_000;

/** Add or take away Zêr with a reason; it mints or burns currency, so the result is said back and confirmed first. */
function AdjustForm({ user, onChanged }: { user: EconomyUser; onChanged: () => void }): React.JSX.Element {
  const currency = 'zer';
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const toast = useToast();
  const dialogs = useDialogs();
  const value = Number(amount);
  const amountError = !amount.trim()
    ? 'Enter an amount.'
    : !Number.isInteger(value) || value === 0
      ? 'A whole number, not 0. A negative one takes away.'
      : Math.abs(value) > WALLET_ADJUST_MAX
        ? `At most ${WALLET_ADJUST_MAX.toLocaleString()} at a time.`
        : null;
  const reasonError = reason.trim() ? null : 'Say why, for the audit log.';

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setTouched(true);
    if (amountError || reasonError) return;
    const name = CURRENCY[currency]!;
    const now = user.balances[currency];
    const after = now + value;
    const yes = await dialogs.confirm({
      title: value > 0 ? `Add ${value.toLocaleString()} ${name} to @${user.username}?` : `Take ${Math.abs(value).toLocaleString()} ${name} from @${user.username}?`,
      body:
        `Their balance goes from ${now.toLocaleString()} to ${after.toLocaleString()} ${name}.` +
        (after < 0 ? ' That is less than they have, so it will be refused.' : '') +
        `\nReason: ${reason.trim()}`,
      confirmLabel: value > 0 ? `Add ${value.toLocaleString()} ${name}` : `Take ${Math.abs(value).toLocaleString()} ${name}`,
      tone: value < 0 || value >= LARGE_ADJUSTMENT ? 'danger' : 'default',
      typed: value >= LARGE_ADJUSTMENT ? { phrase: String(value) } : undefined,
    });
    if (!yes) return;
    setBusy(true);
    try {
      // One key per confirmed change: a double click or a retry moves the money once.
      const res = await api<{ balance?: number }>(`/admin/users/${user.id}/wallet`, {
        method: 'POST',
        body: { currency, amount: value, reason: reason.trim(), idempotencyKey: crypto.randomUUID() },
      });
      toast.success(
        `${value > 0 ? 'Added' : 'Took away'} ${Math.abs(value).toLocaleString()} ${CURRENCY[currency]}${res.balance !== undefined ? `. New balance: ${res.balance.toLocaleString()}.` : '.'}`,
      );
      setAmount('');
      setReason('');
      setTouched(false);
      onChanged();
    } catch (err) {
      toast.error(errorLine(err, 'the economy'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Change a balance" description="It goes through the ledger with your reason, so it can always be traced.">
      <form className="form" noValidate onSubmit={(e) => void submit(e)}>
        <FieldRow>
          <TextInput
            label="Amount in Zêr"
            hint="500 adds, -500 takes away."
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={touched ? amountError : undefined}
            required
          />
        </FieldRow>
        <TextInput label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} error={touched ? reasonError : undefined} required maxLength={500} />
        <FormActions>
          <Button type="submit" variant="primary" busy={busy}>
            Apply
          </Button>
        </FormActions>
      </form>
    </Section>
  );
}

/** The most days one grant may add, as the API allows. */
export const PLUS_GRANT_MAX_DAYS = 366;

/**
 * Hevalo+ membership and its end, and for a superadmin days to give or add (how testers get it while it cannot be
 * bought). The new end is said back and confirmed first, and the reason is audited.
 */
function PlusSection({ user, canAdjust, onChanged }: { user: EconomyUser; canAdjust: boolean; onChanged: () => void }): React.JSX.Element {
  const [days, setDays] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const toast = useToast();
  const dialogs = useDialogs();
  const until = user.premiumUntil ? new Date(user.premiumUntil) : null;
  const member = until !== null && until.getTime() > Date.now();
  const value = Number(days);
  const daysError = !days.trim()
    ? 'Enter a number of days.'
    : !Number.isInteger(value) || value < 1
      ? 'A whole number of days, 1 or more.'
      : value > PLUS_GRANT_MAX_DAYS
        ? `At most ${PLUS_GRANT_MAX_DAYS} days at a time.`
        : null;
  const reasonError = reason.trim() ? null : 'Say why, for the audit log.';

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setTouched(true);
    if (daysError || reasonError) return;
    // As the API counts: from the end they have while it is still to come, from now otherwise.
    const end = new Date((member ? until.getTime() : Date.now()) + value * 86_400_000);
    const count = `${value.toLocaleString()} ${value === 1 ? 'day' : 'days'}`;
    const yes = await dialogs.confirm({
      title: member ? `Add ${count} of Hevalo+ for @${user.username}?` : `Give @${user.username} Hevalo+ for ${count}?`,
      body: `They will be a member until ${end.toLocaleDateString(undefined, { dateStyle: 'long' })}.\nReason: ${reason.trim()}`,
      confirmLabel: member ? `Add ${count}` : `Give ${count}`,
    });
    if (!yes) return;
    setBusy(true);
    try {
      // One key per confirmed grant: a double click or a retry adds the days once.
      const res = await api<{ premiumUntil: string }>(`/admin/users/${user.id}/plus`, {
        method: 'POST',
        body: { days: value, reason: reason.trim(), idempotencyKey: crypto.randomUUID() },
      });
      toast.success(`Hevalo+ until ${new Date(res.premiumUntil).toLocaleDateString(undefined, { dateStyle: 'long' })}.`);
      setDays('');
      setReason('');
      setTouched(false);
      onChanged();
    } catch (err) {
      toast.error(errorLine(err, 'the economy'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Hevalo+"
      description={
        'Membership: the daily Zêr, a monthly members’ box, double quest chests, streak milestones and wins, a second ' +
        'streak freeze, and one free streak restore a month.'
      }
    >
      <p>
        {member ? (
          <>
            <Badge tone="info">Member</Badge> until <Time value={user.premiumUntil!} mode="absolute" />
          </>
        ) : until ? (
          <>
            Not a member. Their membership ended <Time value={user.premiumUntil!} mode="absolute" />.
          </>
        ) : (
          'Not a member.'
        )}
      </p>
      {canAdjust && (
        <form className="form" noValidate onSubmit={(e) => void submit(e)}>
          <FieldRow>
            <TextInput
              label="Days of Hevalo+"
              hint={member ? 'Added to the end of the membership they have.' : 'Counted from today.'}
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              error={touched ? daysError : undefined}
              required
            />
            <TextInput label="Why (for the audit log)" value={reason} onChange={(e) => setReason(e.target.value)} error={touched ? reasonError : undefined} required maxLength={500} />
          </FieldRow>
          <FormActions>
            <Button type="submit" variant="primary" busy={busy}>
              {member ? 'Add days' : 'Give Hevalo+'}
            </Button>
          </FormActions>
        </form>
      )}
    </Section>
  );
}

/** What they own, and — for a superadmin — giving an item or taking one back (which also un-equips it). */
export function ItemsPanel({ user, canAdjust }: { user: { id: string; username: string }; canAdjust: boolean }): React.JSX.Element {
  const items = useLoad(() => api<{ items: OwnedItem[] }>(`/admin/users/${user.id}/items`).then((r) => r.items), [user.id]);
  const catalog = useLoad(
    () => (canAdjust ? api<{ items: Array<{ sku: string; name: string; category: string }> }>('/admin/shop/items').then((r) => r.items) : Promise.resolve([])),
    [canAdjust],
  );
  const [sku, setSku] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  // As in the balance form: what is missing is said on "Give the item", and each goes once it is filled.
  const [touched, setTouched] = useState(false);
  const skuError = sku ? null : 'Choose the item to give.';
  const reasonError = reason.trim() ? null : 'Say why, for the audit log.';
  const toast = useToast();
  const dialogs = useDialogs();

  async function grant(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setTouched(true);
    if (skuError || reasonError) return;
    setBusy(true);
    try {
      await api(`/admin/users/${user.id}/items`, { method: 'POST', body: { sku, reason: reason.trim() } });
      toast.success('Given.');
      setSku('');
      setReason('');
      setTouched(false);
      await items.reload();
    } catch (err) {
      toast.error(errorLine(err, 'the economy'));
    } finally {
      setBusy(false);
    }
  }

  async function takeBack(item: OwnedItem): Promise<void> {
    const why = await dialogs.prompt({
      title: `Take “${item.name}” back from @${user.username}?`,
      label: 'Why (for the audit log)',
      body: item.equipped ? 'They are using it now; it comes off too.' : undefined,
      maxLength: 500,
      confirmLabel: 'Take it back',
    });
    if (!why) return;
    try {
      await api(`/admin/users/${user.id}/items/${encodeURIComponent(item.sku)}`, { method: 'DELETE', body: { reason: why } });
      toast.success('Taken back.');
      await items.reload();
    } catch (err) {
      toast.error(errorLine(err, 'the economy'));
    }
  }

  const columns: ReadonlyArray<Column<OwnedItem>> = [
    {
      key: 'item',
      header: 'Item',
      card: 'title',
      cell: (i) => (
        <span>
          <strong>{i.name}</strong> {i.equipped && <Badge tone="info">In use</Badge>}
          <span className="cell-sub mono">{i.sku}</span>
        </span>
      ),
    },
    { key: 'category', header: 'Kind', cell: (i) => humanize(i.category) },
    { key: 'qty', header: 'How many', align: 'end', cell: (i) => i.quantity },
    { key: 'source', header: 'From', cell: (i) => humanize(i.source) },
  ];

  return (
    <>
      {canAdjust && (
        <Section title="Give an item" description="Free, with your reason in the audit log.">
          <form className="form" noValidate onSubmit={(e) => void grant(e)}>
            <FieldRow>
              <Select
                label="Item"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                error={touched ? skuError : undefined}
                required
                options={[{ value: '', label: catalog.data ? 'Choose an item…' : 'Loading the shop…', disabled: true }, ...(catalog.data ?? []).map((c) => ({ value: c.sku, label: `${c.name} · ${humanize(c.category)}` }))]}
              />
              <TextInput label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} error={touched ? reasonError : undefined} required maxLength={500} />
            </FieldRow>
            <FormActions>
              <Button type="submit" variant="primary" busy={busy}>
                Give the item
              </Button>
            </FormActions>
          </form>
        </Section>
      )}
      <Section title="What they own" flush>
        <Table
          caption="Items"
          columns={columns}
          rows={items.data ?? null}
          rowKey={(i) => i.sku}
          loading={items.loading}
          error={items.error}
          onRetry={() => void items.reload()}
          what="the economy"
          empty="They own nothing yet."
          actions={
            canAdjust
              ? (i) => (
                  <Button variant="danger" onClick={() => void takeBack(i)}>
                    Take back
                  </Button>
                )
              : undefined
          }
        />
      </Section>
    </>
  );
}
