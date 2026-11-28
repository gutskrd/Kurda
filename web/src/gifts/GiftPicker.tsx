import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MAX_GIFT_RECIPIENTS,
  giftDayFull,
  giftDayLine,
  giftLockFor,
  giftMeaning,
  giftQuantityMax,
  giftShelves,
  isGiftOnly,
  type BagEntry,
  type GiftCatalog,
  type GiftDayLeft,
  type GiftCatalogItem,
  type GiftChatRef,
  type GiftConfirmDetails,
  type GiftGroup,
  type GiftLock,
  type SendGiftResult,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { requestId } from '../lib/api';
import type { ApiError, DmMessage, GroupMessage } from '../lib/types';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { Avatar } from '../components/Avatar';
import { CheckIcon, CoinIcon, GiftIcon, LockIcon, MinusIcon, PlusIcon } from '../components/icons';
import { Skeleton, SkeletonRegion } from '../components/Skeleton';
import { useI18n, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { SendError } from '../reports/SendError';
import { ZerValue } from '../shop/ZerValue';
import { GiftItemArt, GiftName, useGiftName } from './GiftArt';

/** The shelf as GET /gifts/catalog sends it; an older server leaves out the bag, the hold and the limits. */
type Shelf = Omit<GiftCatalog, 'bag' | 'hold' | 'freeGifts' | 'limits' | 'dayLeft' | 'nudges'> &
  Partial<Pick<GiftCatalog, 'bag' | 'hold' | 'freeGifts' | 'limits' | 'dayLeft' | 'nudges'>>;

/** Refusals of the shelf that are the gift rules rather than a failure: one calm line, nothing to retry. */
const RULES: Partial<Record<string, MessageKey>> = {
  NOT_FRIENDS: 'gift.error.friendsOnly',
  GIFT_TO_SELF: 'gift.error.friendsOnly',
  BAD_RECIPIENTS: 'gift.error.friendsOnly',
  POST_NOT_FOUND: 'gift.error.postGone',
};

/** Someone a gift can go to: the friend in a DM, a friend in the group, or a post's author. */
export interface GiftPerson {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

/** What a send returned: who got it, who did not and why, and the message to show. */
export interface GiftSent extends SendGiftResult {
  message: DmMessage | GroupMessage | null;
  item: GiftCatalogItem;
  /** how many of it each recipient was given */
  quantity: number;
  /** When some friends were skipped, who got it and why the others did not ("Sent to rojda. dilan already has it."); else null. */
  partialNote: string | null;
}

const TIER_LABEL: Record<'rare' | 'legendary' | 'grand', MessageKey> = {
  rare: 'gift.tier.rare',
  legendary: 'gift.tier.legendary',
  grand: 'gift.tier.grand',
};

const GROUP_LABEL: Record<GiftGroup, MessageKey> = {
  warm: 'gift.group.warm',
  flowers: 'gift.group.flowers',
  animals: 'gift.group.animals',
  music: 'gift.group.music',
  sky: 'gift.group.sky',
  boats: 'gift.group.boats',
  houses: 'gift.group.houses',
  legends: 'gift.group.legends',
};

const SKIP_REASON: Record<SendGiftResult['skipped'][number]['reason'], MessageKey> = {
  already_owned: 'gift.skipped.owned',
  daily_limit: 'gift.skipped.limit',
  not_allowed: 'gift.skipped.notYet',
};

type Translate = (key: MessageKey, vars?: Record<string, string>) => string;

/** Refusals of the send itself, in plain words; anything else is said by SendError. */
function pickerError(error: ApiError, t: Translate, fmt: (n: number) => string): string | null {
  const details = (error.details ?? {}) as { maxPrice?: number; left?: number; by?: string };
  switch (error.code) {
    case 'INSUFFICIENT_FUNDS':
      return t('gift.error.funds');
    case 'PRICE_CHANGED':
      return t('gift.error.price');
    case 'ITEM_UNAVAILABLE':
    case 'ITEM_NOT_FOUND':
    case 'NOT_GIFTABLE':
      return t('gift.error.unavailable');
    case 'NOT_FRIENDS':
      return t('gift.error.friendsOnly');
    case 'BAG_EMPTY':
      return t('gift.error.bagEmpty');
    case 'GIFT_OVER_LIMIT':
      return t('gift.error.overLimit', { zer: fmt(details.maxPrice ?? 0) });
    case 'GIFT_SPEND_LIMIT':
      return t(details.by === 'minor_month' ? 'gift.error.monthLimit' : 'gift.error.ownLimit', { zer: fmt(details.left ?? 0) });
    default:
      return null;
  }
}

/** The second confirmation's details, checked before they are trusted. */
function confirmDetails(details: unknown): GiftConfirmDetails | null {
  const d = details as Partial<GiftConfirmDetails> | null;
  return d && typeof d.confirmToken === 'string' && typeof d.total === 'number' ? (d as GiftConfirmDetails) : null;
}

/** What is chosen: a gift from the bag, or one paid for in Zêr. */
interface Choice {
  item: GiftCatalogItem;
  fromBag: boolean;
}

/**
 * The gift sheet, from a chat's gift button or a post's. In a DM the gift is for the friend and on a post for its
 * author; in a group the sender first picks among the members who are friends (with "Select all"). It opens with the
 * gift bag, the small gifts everyone earns, with how many of each; then the gifts by shelf, cheapest first, each with
 * its Kurmancî name and what it means in the reader's language, its price in Zêr with what that is worth in money, and a
 * lock with the reason where it cannot go: not enough Zêr, or the safeguards (gift-safety.ts). Once a gift is chosen, a
 * stepper by the send button gives each recipient several of it, as many as the day's caps, the Zêr or bag and the
 * spending limit allow (shared `giftQuantityMax`), and the footer says the whole send and its price. The website sells
 * nothing, so it never offers to buy Zêr. A big send is confirmed once more with its money amount, by the server's own
 * token. Nothing is preselected.
 */
export function GiftPicker({
  open,
  onClose,
  chat,
  post,
  people,
  onSent,
  initialChosen,
}: {
  open: boolean;
  onClose: () => void;
  /** the chat the gift is posted in; left out for a gift onto a post */
  chat?: GiftChatRef;
  /** a post the gift is given onto; its author is `people[0]` */
  post?: { type: 'library' | 'image'; id: string };
  /** Who may be chosen: the friend in a DM, the sender's friends among a group's members, or a post's author. */
  people: GiftPerson[] | null;
  onSent: (sent: GiftSent) => void;
  /** Someone already chosen in a group, such as the friend a gift is sent back to. */
  initialChosen?: string[];
}): React.JSX.Element | null {
  if (!open) return null;
  return <PickerFlow onClose={onClose} chat={chat} post={post} people={people} onSent={onSent} initialChosen={initialChosen} />;
}

function PickerFlow({
  onClose,
  chat,
  post,
  people,
  onSent,
  initialChosen,
}: {
  onClose: () => void;
  chat?: GiftChatRef;
  post?: { type: 'library' | 'image'; id: string };
  people: GiftPerson[] | null;
  onSent: (sent: GiftSent) => void;
  initialChosen?: string[];
}): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const { client } = useAuth();
  const group = chat?.kind === 'group';
  const preset = group && initialChosen && initialChosen.length > 0 ? initialChosen.slice(0, MAX_GIFT_RECIPIENTS) : null;
  const [chosen, setChosen] = useState<string[]>(() => preset ?? (!group && people?.[0] ? [people[0].userId] : []));
  const [step, setStep] = useState<'who' | 'what'>(group && !preset ? 'who' : 'what');
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [shelfError, setShelfError] = useState<ApiError | null>(null);
  const [picked, setPicked] = useState<Choice | null>(null);
  /** How many of the chosen gift each recipient is given; a new choice starts again at one. */
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | string | null>(null);
  const [skippedNote, setSkippedNote] = useState<string | null>(null);
  /** The server asked for the second confirmation of a big gift: what to show, and its token. */
  const [confirming, setConfirming] = useState<GiftConfirmDetails | null>(null);
  // One idempotency key per choice, so a retry of the same send never pays twice.
  const [key, setKey] = useState(() => requestId());

  // In a DM or on a post the person is the recipient as soon as known; the list arrives just after the sheet opens.
  const only = !group ? people?.[0]?.userId : undefined;
  useEffect(() => {
    if (only) setChosen((now) => (now.length === 0 ? [only] : now));
  }, [only]);

  const nameOf = useMemo(() => new Map((people ?? []).map((p) => [p.userId, p.name])), [people]);
  const fmt = useCallback((n: number): string => n.toLocaleString(locale), [locale]);

  const loadShelf = useCallback(async () => {
    setShelf(null);
    setShelfError(null);
    const query = post ? `post=${encodeURIComponent(`${post.type}:${post.id}`)}` : `to=${chosen.join(',')}`;
    const res = await client.get<Shelf>(`/gifts/catalog?${query}`);
    if (res.ok) {
      const items = res.data.items ?? [];
      setShelf({ ...res.data, items, balance: res.data.balance ?? { zer: 0 } });
      // A reload after a price change keeps the choice at its new price, so everything reads the fresh item.
      setPicked((p) => {
        const fresh = p ? items.find((i) => i.sku === p.item.sku) : undefined;
        return p && fresh ? { ...p, item: fresh } : null;
      });
    } else setShelfError(res.error);
  }, [client, chosen, post]);

  useEffect(() => {
    if (step === 'what' && chosen.length > 0) void loadShelf();
  }, [step, loadShelf, chosen.length]);

  const getting = (item: GiftCatalogItem): string[] => (post ? chosen : chosen.filter((id) => !item.alreadyOwnedBy.includes(id)));
  const cost = (item: GiftCatalogItem): number => item.price * getting(item).length;
  const lockOf = (item: GiftCatalogItem): GiftLock | 'funds' | null =>
    giftLockFor(item, getting(item).length, shelf?.limits) ?? (shelf && cost(item) > shelf.balance.zer ? 'funds' : null);
  const bagCount = (sku: string): number => shelf?.bag?.find((b) => b.sku === sku)?.count ?? 0;
  // The day's caps: a send to recipients who can all be given nothing more for now is held before it is tried.
  const dayFull = (item: GiftCatalogItem): boolean => giftDayFull(shelf?.dayLeft ?? [], getting(item));

  /**
   * The most of a choice one send may give each recipient. A unique item (one a friend may already own) goes one at a
   * time, and a send held by the day's caps has no count to choose. A friend whose day is full is skipped whatever the
   * number, so only the others' caps bound it.
   */
  const mostOf = (choice: Choice): number => {
    const { item } = choice;
    if (!isGiftOnly(item.category) || item.alreadyOwnedBy.length > 0 || dayFull(item)) return 1;
    const to = getting(item);
    const units = choice.fromBag ? bagCount(item.sku) : shelf && item.price > 0 ? Math.floor(shelf.balance.zer / item.price) : null;
    const dayLeft = (shelf?.dayLeft ?? []).filter((d) => to.includes(d.userId) && d.left > 0).map((d) => d.left);
    return giftQuantityMax({ price: item.price, recipients: to.length, dayLeft, units, limits: shelf?.limits });
  };
  const most = picked ? mostOf(picked) : 1;
  // A reload or a change of recipients can lower the most; the count follows it down.
  const count = Math.min(quantity, most);
  /** What the whole send costs: the price of each, by how many each recipient is given, by the recipients. */
  const total = picked ? cost(picked.item) * count : 0;
  /** Why the chosen send cannot go for its price: the safeguards, then the Zêr, each on the whole send. */
  const sendLock: GiftLock | 'funds' | null = !picked
    ? null
    : (giftLockFor(picked.item, getting(picked.item).length, shelf?.limits) ??
      (shelf?.limits?.left != null && total > shelf.limits.left ? 'spend_limit' : shelf && total > shelf.balance.zer ? 'funds' : null));

  // A different choice, or a different number of it, is a different send.
  useEffect(() => setKey(requestId()), [picked?.item.sku, picked?.fromBag, chosen, count]);

  async function send(confirmToken?: string): Promise<void> {
    if (!picked || busy) return;
    const to = getting(picked.item);
    if (to.length === 0) return;
    setBusy(true);
    setError(null);
    setSkippedNote(null);
    const base = {
      sku: picked.item.sku,
      idempotencyKey: key,
      expectedPrice: picked.item.price,
      ...(count > 1 ? { quantity: count } : {}),
      ...(picked.fromBag ? { fromBag: true } : {}),
      ...(confirmToken ? { confirmToken } : {}),
    };
    const res = await client.post<SendGiftResult & { message: DmMessage | GroupMessage | null }>(
      '/gifts',
      post ? { ...base, post } : { ...base, toUserIds: to, chat },
    );
    setBusy(false);
    if (!res.ok) {
      const asked = res.error.code === 'GIFT_NEEDS_CONFIRM' ? confirmDetails(res.error.details) : null;
      if (asked) {
        setConfirming(asked);
        return;
      }
      setConfirming(null);
      if (res.error.code === 'PRICE_CHANGED' || res.error.code === 'BAG_EMPTY') void loadShelf();
      setError(pickerError(res.error, t, fmt) ?? res.error);
      return;
    }
    setConfirming(null);
    const why = res.data.skipped.map((s) => t(SKIP_REASON[s.reason], { name: nameOf.get(s.userId) ?? '' })).join(' ');
    if (res.data.sent.length === 0) {
      // Nobody could be given it: say why and let them choose again.
      setSkippedNote(why || t('gift.error.unavailable'));
      return;
    }
    const partialNote =
      res.data.skipped.length > 0
        ? `${t('gift.sentTo', { names: res.data.sent.map((id) => nameOf.get(id) ?? '').filter(Boolean).join(', ') })} ${why}`
        : null;
    onSent({ ...res.data, item: picked.item, quantity: count, partialNote });
  }

  const choose = (next: Choice | null): void => {
    setPicked(next);
    setQuantity(1);
    setError(null);
    setSkippedNote(null);
  };

  const names = chosen.map((id) => nameOf.get(id) ?? '').filter(Boolean);
  const person = people?.[0]?.name ?? '';
  const giftName = useGiftName();
  const dayNote = dayLeftNote(shelf?.dayLeft ?? [], (id) => nameOf.get(id) ?? person, t, fmt, locale);
  const title = post ? t('gift.post.title', { name: person }) : group ? t('gift.picker.titleGroup') : t('gift.picker.title', { name: person });
  const items = shelf?.items ?? [];
  // The bag's gifts that can be given here, in the order the shelf has them.
  const bag = (shelf?.bag ?? []).filter((b) => b.count > 0 && items.some((i) => i.sku === b.sku));

  return (
    <Sheet open onClose={onClose} label={title} className="gift-picker">
      <h2 className="gift-picker-title">{title}</h2>

      {step === 'who' && <WhoStep people={people} chosen={chosen} onChange={setChosen} onNext={() => setStep('what')} />}

      {step === 'what' && confirming && picked && (
        <BigGiftConfirm
          item={picked.item}
          count={count}
          names={getting(picked.item).map((id) => nameOf.get(id) ?? '').filter(Boolean)}
          details={confirming}
          busy={busy}
          error={error}
          onConfirm={() => void send(confirming.confirmToken)}
          onBack={() => {
            setConfirming(null);
            setError(null);
          }}
        />
      )}

      {step === 'what' && !confirming && (
        <>
          <div className="gift-picker-meta">
            {group && (
              <button type="button" className="link-button" onClick={() => setStep('who')}>
                {t('gift.picker.for', { names: names.join(', ') })}
              </button>
            )}
            {shelf && (
              <span className="gift-balance" aria-label={t('gift.picker.balance', { zer: fmt(shelf.balance.zer) })}>
                <span>
                  <CoinIcon size={15} /> {fmt(shelf.balance.zer)}
                </span>
              </span>
            )}
          </div>

          {shelfError && RULES[shelfError.code ?? ''] ? (
            <p className="muted gift-hold">{t(RULES[shelfError.code ?? '']!)}</p>
          ) : shelfError ? (
            <SendError error={shelfError} />
          ) : shelf === null ? (
            <ShelfSkeleton count={6} />
          ) : shelf.hold ? (
            // The rules do not let a gift go to this one friend yet: one calm line, rather than a shelf that would fail.
            <p className="muted gift-hold">{t(shelf.hold === 'new_friend' ? 'gift.hold.newFriend' : 'gift.hold.friendsOnly', { name: person })}</p>
          ) : items.length === 0 ? (
            <p className="muted">{t('gift.picker.empty')}</p>
          ) : (
            <div className="gift-shelves">
              {shelf.limits?.left != null && <p className="gift-limit-line">{t('gift.limit.leftLine', { zer: fmt(shelf.limits.left) })}</p>}
              {dayNote && <p className="gift-limit-line">{dayNote}</p>}
              <section className="gift-shelf-section gift-bag" aria-labelledby="gift-bag-title">
                <h3 className="gift-shelf-title" id="gift-bag-title">
                  {t('gift.bag.title')}
                </h3>
                {bag.length === 0 ? (
                  <p className="muted gift-bag-empty">{t('gift.bag.empty')}</p>
                ) : (
                  <ul className="gift-shelf" aria-labelledby="gift-bag-title">
                    {bag.map((entry) => {
                      const item = items.find((i) => i.sku === entry.sku)!;
                      return (
                        <BagTile
                          key={entry.sku}
                          entry={entry}
                          meaning={giftMeaning(entry.sku, locale)}
                          enough={bagCount(entry.sku) >= getting(item).length}
                          selected={picked?.fromBag === true && picked.item.sku === entry.sku}
                          onChoose={(on) => choose(on ? { item, fromBag: true } : null)}
                        />
                      );
                    })}
                  </ul>
                )}
              </section>
              {giftShelves(items).map((s) => (
                <section key={s.group} className="gift-shelf-section" aria-labelledby={`gift-group-${s.group}`}>
                  <h3 className="gift-shelf-title" id={`gift-group-${s.group}`}>
                    {t(GROUP_LABEL[s.group])}
                  </h3>
                  <ul className="gift-shelf" aria-labelledby={`gift-group-${s.group}`}>
                    {s.items.map((item) => (
                      <GiftTile
                        key={item.sku}
                        item={item}
                        meaning={giftMeaning(item.sku, locale)}
                        lock={lockOf(item)}
                        maxPrice={shelf.limits?.maxPrice ?? null}
                        everyoneHasIt={getting(item).length === 0}
                        ownedNote={
                          item.alreadyOwnedBy.length > 0 && !post
                            ? group
                              ? t('gift.picker.someHaveIt', { names: item.alreadyOwnedBy.map((id) => nameOf.get(id) ?? '').join(', ') })
                              : t('gift.picker.hasIt')
                            : null
                        }
                        selected={picked?.fromBag === false && picked.item.sku === item.sku}
                        onChoose={(on) => choose(on ? { item, fromBag: false } : null)}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {picked && (
            <div className="gift-confirm">
              {/* The chosen gift beside the send button, as it will go. */}
              <GiftItemArt assetUrl={picked.item.assetUrl} category={picked.item.category} size={44} className="gift-confirm-art" loop />
              <span className="gift-confirm-text">
                {t('gift.picker.confirm', { item: giftName(picked.item.name, count), names: getting(picked.item).map((id) => nameOf.get(id) ?? '').join(', ') })}
                {picked.fromBag ? (
                  <strong className="gift-confirm-cost">{t('gift.bag.free')}</strong>
                ) : (
                  <>
                    <strong className="gift-confirm-cost">
                      <CoinIcon size={14} /> {fmt(total)} <ZerValue zer={total} />
                    </strong>
                    {/* what there is to pay with, by what it costs, so nobody has to scroll back up to the purse */}
                    {shelf && <span className="gift-confirm-have">{t('gift.picker.balance', { zer: fmt(shelf.balance.zer) })}</span>}
                  </>
                )}
                {/* Beside the button that spends: a gift, like any purchase, is final. */}
                <span className="gift-confirm-hidden">{t('shop.giftFinal')}</span>
              </span>
              {!picked.fromBag && sendLock === 'funds' && <span className="gift-confirm-short">{t('gift.error.funds')}</span>}
              {!picked.fromBag && sendLock === 'spend_limit' && <span className="gift-confirm-short">{t('gift.lock.spendLimit')}</span>}
              {dayFull(picked.item) && dayNote && <span className="gift-confirm-short">{dayNote}</span>}
              {most > 1 && <QuantityStepper value={count} most={most} disabled={busy} onChange={setQuantity} />}
              <Button onClick={() => void send()} disabled={busy || dayFull(picked.item) || (!picked.fromBag && sendLock !== null)}>
                {busy ? t('gift.sending') : t('gift.send')}
              </Button>
              {/* The result sits by the send button, not under a shelf that may be scrolled away. */}
              <SendError error={error ?? skippedNote} className="gift-confirm-note" />
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}

/** When more gifts may go: the time alone today, with the weekday when it is another day. */
function whenMore(iso: string, locale: string): string {
  const at = new Date(iso);
  const today = at.toDateString() === new Date().toDateString();
  return at.toLocaleString(locale, today ? { hour: '2-digit', minute: '2-digit' } : { weekday: 'long', hour: '2-digit', minute: '2-digit' });
}

/** The day's caps in one line before anything is sent (shared `giftDayLine`), or null when nothing needs saying. */
function dayLeftNote(
  days: readonly GiftDayLeft[],
  nameOf: (userId: string) => string,
  t: ReturnType<typeof useT>,
  fmt: (n: number) => string,
  locale: string,
): string | null {
  const line = giftDayLine(days);
  if (!line) return null;
  if (line.kind === 'few') return t('gift.day.few', { name: nameOf(line.userId), count: fmt(line.left) });
  if (line.kind === 'someFull') return t('gift.day.someFull', { names: line.userIds.map(nameOf).filter(Boolean).join(', ') });
  if (!line.moreAt) return t('gift.day.noneNoTime', { name: nameOf(line.userId) });
  return t('gift.day.none', { name: nameOf(line.userId), time: whenMore(line.moreAt, locale) });
}

/** One kind of gift in the bag: free to give, with how many are left. */
function BagTile({
  entry,
  meaning,
  enough,
  selected,
  onChoose,
}: {
  entry: BagEntry;
  meaning: string | null;
  enough: boolean;
  selected: boolean;
  onChoose: (on: boolean) => void;
}): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  return (
    <li>
      <button
        type="button"
        className={`gift-tile gift-tile-bag${selected ? ' is-picked' : ''}`}
        aria-pressed={selected}
        disabled={!enough}
        onClick={() => onChoose(!selected)}
      >
        <GiftItemArt assetUrl={entry.assetUrl} category="gift" size={64} />
        <span className="gift-tile-name" lang="ku">
          {entry.name}
        </span>
        {meaning && <span className="gift-tile-desc">{meaning}</span>}
        <span className="gift-tile-price">{t('gift.bag.count', { count: entry.count.toLocaleString(locale) })}</span>
        {!enough && <span className="gift-tile-owned">{t('gift.bag.notEnough')}</span>}
        {selected && (
          <span className="gift-tile-check" aria-hidden>
            <CheckIcon size={14} />
          </span>
        )}
      </button>
    </li>
  );
}

/** A gift on a shelf: its Kurmancî name and meaning, its price and worth, and a lock with the reason when it cannot go. */
function GiftTile({
  item,
  meaning,
  lock,
  maxPrice,
  everyoneHasIt,
  ownedNote,
  selected,
  onChoose,
}: {
  item: GiftCatalogItem;
  meaning: string | null;
  lock: GiftLock | 'funds' | null;
  maxPrice: number | null;
  everyoneHasIt: boolean;
  ownedNote: string | null;
  selected: boolean;
  onChoose: (on: boolean) => void;
}): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const fmt = (n: number): string => n.toLocaleString(locale);
  const why =
    lock === 'over_limit'
      ? t('gift.lock.overLimit', { zer: fmt(maxPrice ?? 0) })
      : lock === 'spend_limit'
        ? t('gift.lock.spendLimit')
        : lock === 'funds'
          ? t('gift.lock.funds')
          : null;
  // A gift the safeguards rule out cannot be chosen; one only beyond the balance still can be looked at and chosen,
  // and says so by the send button.
  const blocked = everyoneHasIt || lock === 'over_limit' || lock === 'spend_limit';
  return (
    <li>
      <button
        type="button"
        className={`gift-tile gift-tile-${item.tier}${selected ? ' is-picked' : ''}${lock ? ' is-locked' : ''}`}
        aria-pressed={selected}
        disabled={blocked}
        onClick={() => onChoose(!selected)}
      >
        <GiftItemArt assetUrl={item.assetUrl} category={item.category} size={72} loop={selected} />
        <span className="gift-tile-name" lang="ku">
          {item.name}
        </span>
        {meaning && <span className="gift-tile-desc">{meaning}</span>}
        <span className={`gift-tile-price${lock ? ' is-short' : ''}`}>
          {lock ? <LockIcon size={13} /> : <CoinIcon size={13} />} {fmt(item.price)}
          <span className="sr-only">Zêr</span> <ZerValue zer={item.price} />
        </span>
        {item.tier !== 'common' && <span className={`gift-tier gift-tier-${item.tier}`}>{t(TIER_LABEL[item.tier])}</span>}
        {why && <span className="gift-tile-owned gift-tile-lock">{why}</span>}
        {ownedNote && <span className="gift-tile-owned">{ownedNote}</span>}
        {selected && (
          <span className="gift-tile-check" aria-hidden>
            <CheckIcon size={14} />
          </span>
        )}
      </button>
    </li>
  );
}

/**
 * How many of the chosen gift each recipient is given: minus, the count and plus in one pill by the send button, from
 * one to `most`. Each end stays focusable but does nothing, so a keyboard is not thrown out of the pill at a limit, and
 * the new count is said as it changes.
 */
function QuantityStepper({
  value,
  most,
  disabled,
  onChange,
}: {
  value: number;
  most: number;
  disabled: boolean;
  onChange: (next: number) => void;
}): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const fewer = disabled || value <= 1;
  const more = disabled || value >= most;
  return (
    <div className="gift-qty" role="group" aria-label={t('gift.quantity.label')}>
      <button
        type="button"
        className="gift-qty-step"
        aria-label={t('gift.quantity.fewer')}
        aria-disabled={fewer}
        onClick={() => !fewer && onChange(value - 1)}
      >
        <MinusIcon size={18} />
      </button>
      <output className="gift-qty-count" aria-live="polite">
        {value.toLocaleString(locale)}
      </output>
      <button
        type="button"
        className="gift-qty-step"
        aria-label={t('gift.quantity.more')}
        aria-disabled={more}
        onClick={() => !more && onChange(value + 1)}
      >
        <PlusIcon size={18} />
      </button>
    </div>
  );
}

/**
 * The second look at a big gift, asked for by the server: the gift, who it is for, and what it costs in Zêr and in
 * money, said large, with "Send it" and a plain "Go back" that changes nothing.
 */
function BigGiftConfirm({
  item,
  count,
  names,
  details,
  busy,
  error,
  onConfirm,
  onBack,
}: {
  item: GiftCatalogItem;
  /** how many of it each recipient is given */
  count: number;
  names: string[];
  details: GiftConfirmDetails;
  busy: boolean;
  error: ApiError | string | null;
  onConfirm: () => void;
  onBack: () => void;
}): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <section className="gift-big-confirm" aria-labelledby="gift-big-confirm-title">
      <GiftItemArt assetUrl={item.assetUrl} category={item.category} size={120} className="gift-big-confirm-art" loop />
      <h3 className="gift-big-confirm-title" id="gift-big-confirm-title" ref={heading} tabIndex={-1}>
        {t('gift.confirm.title')}
      </h3>
      <p className="gift-big-confirm-what">
        <GiftName name={item.name} count={count} /> · {t('gift.confirm.for', { names: names.join(', ') })}
      </p>
      <p className="gift-big-confirm-amount">
        <span className="gift-big-confirm-money">
          <ZerValue zer={details.total} />
        </span>
        <span className="gift-big-confirm-zer">
          <CoinIcon size={14} /> {t('gift.confirm.zer', { zer: details.total.toLocaleString(locale) })}
        </span>
      </p>
      <p className="muted gift-big-confirm-note">{t('gift.confirm.note')}</p>
      <div className="gift-big-confirm-actions">
        <Button variant="secondary" onClick={onBack} disabled={busy}>
          {t('gift.confirm.back')}
        </Button>
        <Button onClick={onConfirm} disabled={busy}>
          <GiftIcon size={16} /> {busy ? t('gift.sending') : t('gift.confirm.send')}
        </Button>
      </div>
      <SendError error={error} className="gift-confirm-note" />
    </section>
  );
}

/** Choosing recipients in a group: the sender's friends among its members, up to seven at once. */
function WhoStep({
  people,
  chosen,
  onChange,
  onNext,
}: {
  people: GiftPerson[] | null;
  chosen: string[];
  onChange: (ids: string[]) => void;
  onNext: () => void;
}): React.JSX.Element {
  const t = useT();
  if (people === null) return <ShelfSkeleton count={3} />;
  if (people.length === 0) return <p className="muted">{t('gift.picker.noFriendsHere')}</p>;

  const all = people.slice(0, MAX_GIFT_RECIPIENTS).map((p) => p.userId);
  const allChosen = all.every((id) => chosen.includes(id)) && chosen.length === all.length;
  const toggle = (id: string): void => {
    if (chosen.includes(id)) onChange(chosen.filter((x) => x !== id));
    else if (chosen.length < MAX_GIFT_RECIPIENTS) onChange([...chosen, id]);
  };

  return (
    <>
      <p className="gift-picker-intro">{t('gift.picker.who', { max: MAX_GIFT_RECIPIENTS })}</p>
      <label className="gift-person gift-person-all">
        <input type="checkbox" checked={allChosen} onChange={() => onChange(allChosen ? [] : all)} />
        <span>{t('gift.picker.selectAll')}</span>
      </label>
      <ul className="gift-people">
        {people.map((p) => (
          <li key={p.userId}>
            <label className="gift-person">
              <input
                type="checkbox"
                checked={chosen.includes(p.userId)}
                disabled={!chosen.includes(p.userId) && chosen.length >= MAX_GIFT_RECIPIENTS}
                onChange={() => toggle(p.userId)}
              />
              <Avatar url={p.avatarUrl} glyphSize={16} />
              <span className="gift-person-name">{p.name}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="report-actions">
        <span />
        <Button onClick={onNext} disabled={chosen.length === 0}>
          {t('gift.picker.next')}
        </Button>
      </div>
    </>
  );
}

/** The shelf while loading: empty tiles with placeholders for picture, name, meaning and price. */
function ShelfSkeleton({ count }: { count: number }): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t('gift.picker.loading')} className="gift-shelf">
      {Array.from({ length: count }, (_, i) => (
        <span className="gift-tile is-skeleton" key={i}>
          <Skeleton w={72} h={72} radius="var(--r-md)" />
          <span className="gift-tile-name">
            <Skeleton line w={[64, 80, 56][i % 3]} />
          </span>
          <span className="gift-tile-desc">
            <Skeleton line w={[72, 56, 64][i % 3]} />
          </span>
          <span className="gift-tile-price">
            <Skeleton line w={40} />
          </span>
        </span>
      ))}
    </SkeletonRegion>
  );
}
