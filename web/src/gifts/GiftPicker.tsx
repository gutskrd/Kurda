import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  applyItemFilter,
  categoriesIn,
  countByCategory,
  DEFAULT_ITEM_FILTER,
  groupByCategory,
  isFiltered,
  itemCategory,
  MAX_GIFT_RECIPIENTS,
  shopItemDescription,
  type GiftCatalog,
  type GiftCatalogItem,
  type GiftChatRef,
  type ItemFilter,
  type SendGiftResult,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { requestId } from '../lib/api';
import type { ApiError, DmMessage, GroupMessage } from '../lib/types';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { Avatar } from '../components/Avatar';
import { CheckIcon, CoinIcon } from '../components/icons';
import { Skeleton, SkeletonRegion } from '../components/Skeleton';
import { useI18n, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { SendError } from '../reports/SendError';
import {
  FilterToggle,
  ItemSearch,
  ItemSort,
  ItemToolbar,
  KindHeading,
  KindPanel,
  KindTabs,
  NoMatches,
  ResultsLine,
  useIdPrefix,
  type KindTab,
} from '../shop/ItemBrowser';
import { ZerValue } from '../shop/ZerValue';
import { GiftItemArt } from './GiftArt';

/** A shelf item, with a description when the catalogue sends one. */
type ShelfItem = GiftCatalogItem & { description?: string | null };

/** The shelf as GET /gifts/catalog sends it; an older server leaves out the hold. */
type Shelf = Omit<GiftCatalog, 'items' | 'hold' | 'freeGifts'> & { items: ShelfItem[]; hold?: GiftCatalog['hold']; freeGifts?: number };

/** Refusals of the shelf that are the gift rules rather than a failure: one calm line, nothing to retry. */
const RULES: Partial<Record<string, MessageKey>> = {
  NOT_FRIENDS: 'gift.error.friendsOnly',
  GIFT_TO_SELF: 'gift.error.friendsOnly',
  BAD_RECIPIENTS: 'gift.error.friendsOnly',
};

/** Someone a gift can go to: the friend in a DM, or a friend in the group. */
export interface GiftPerson {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

/** What a send returned: who got it, who did not and why, and the message to show. */
export interface GiftSent extends SendGiftResult {
  message: DmMessage | GroupMessage | null;
  item: GiftCatalogItem;
  /** When some friends were skipped, who got it and why the others did not ("Sent to rojda. dilan already has it."); else null. */
  partialNote: string | null;
}

const TIER_LABEL: Record<'rare' | 'legendary', MessageKey> = {
  rare: 'gift.tier.rare',
  legendary: 'gift.tier.legendary',
};

const SKIP_REASON: Record<SendGiftResult['skipped'][number]['reason'], MessageKey> = {
  already_owned: 'gift.skipped.owned',
  daily_limit: 'gift.skipped.limit',
  not_allowed: 'gift.skipped.notYet',
};

/** Refusals of the send itself, in plain words; anything else is said by SendError. */
function pickerError(error: ApiError, t: (key: MessageKey) => string): string | null {
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
    default:
      return null;
  }
}

/**
 * The gift picker from the chat's gift button. In a DM the gift is for the friend; in a group the sender first picks
 * among the members who are friends (with "Select all"). The shelf (`GET /gifts/catalog?to=…`) has the gift stickers
 * first, then every priced item, each with what it is worth, who already owns one-of-a-kind items, and the Zêr. When
 * the rules do not let a gift go yet, one calm line says why instead. Nothing is preselected.
 */
export function GiftPicker({
  open,
  onClose,
  chat,
  people,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  chat: GiftChatRef;
  /** Who may be chosen: the friend in a DM, or the sender's friends among a group's members. */
  people: GiftPerson[] | null;
  onSent: (sent: GiftSent) => void;
}): React.JSX.Element | null {
  if (!open) return null;
  return <PickerFlow onClose={onClose} chat={chat} people={people} onSent={onSent} />;
}

function PickerFlow({
  onClose,
  chat,
  people,
  onSent,
}: {
  onClose: () => void;
  chat: GiftChatRef;
  people: GiftPerson[] | null;
  onSent: (sent: GiftSent) => void;
}): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const { client } = useAuth();
  const group = chat.kind === 'group';
  const [chosen, setChosen] = useState<string[]>(() => (!group && people?.[0] ? [people[0].userId] : []));
  const [step, setStep] = useState<'who' | 'what'>(group ? 'who' : 'what');
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [shelfError, setShelfError] = useState<ApiError | null>(null);
  const [picked, setPicked] = useState<ShelfItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | string | null>(null);
  const [skippedNote, setSkippedNote] = useState<string | null>(null);
  // One idempotency key per choice, so a retry of the same send never pays twice.
  const [key, setKey] = useState(() => requestId());
  // The shelf's kind, search and order, plus the gift-only filters (balance, and who already owns it).
  const [filter, setFilter] = useState<ItemFilter>(DEFAULT_ITEM_FILTER);
  const [affordOnly, setAffordOnly] = useState(false);
  const [hideOwned, setHideOwned] = useState(false);
  const ids = useIdPrefix('gift-shelf');

  // In a DM the friend is the recipient as soon as known; the list arrives just after the sheet opens.
  const only = !group ? people?.[0]?.userId : undefined;
  useEffect(() => {
    if (only) setChosen((now) => (now.length === 0 ? [only] : now));
  }, [only]);

  const nameOf = useMemo(() => new Map((people ?? []).map((p) => [p.userId, p.name])), [people]);
  const fmt = (n: number): string => n.toLocaleString(locale);

  const loadShelf = useCallback(async () => {
    setShelf(null);
    setShelfError(null);
    const res = await client.get<Shelf>(`/gifts/catalog?to=${chosen.join(',')}`);
    if (res.ok) {
      const items = res.data.items ?? [];
      setShelf({ items, balance: res.data.balance ?? { zer: 0 }, hold: res.data.hold ?? null });
      // A reload after a price change keeps the choice at its new price, so everything reads the fresh item.
      setPicked((p) => (p ? (items.find((i) => i.sku === p.sku) ?? null) : null));
    } else setShelfError(res.error);
  }, [client, chosen]);

  useEffect(() => {
    if (step === 'what' && chosen.length > 0) void loadShelf();
  }, [step, loadShelf, chosen.length]);

  // A different choice is a different send.
  useEffect(() => setKey(requestId()), [picked, chosen]);

  const getting = (item: GiftCatalogItem): string[] => chosen.filter((id) => !item.alreadyOwnedBy.includes(id));
  const cost = (item: GiftCatalogItem): number => item.price * getting(item).length;
  const affordable = (item: GiftCatalogItem): boolean => !!shelf && cost(item) <= shelf.balance.zer;

  async function send(): Promise<void> {
    if (!picked || busy) return;
    const to = getting(picked);
    if (to.length === 0) return;
    setBusy(true);
    setError(null);
    setSkippedNote(null);
    const res = await client.post<SendGiftResult & { message: DmMessage | GroupMessage | null }>('/gifts', {
      sku: picked.sku,
      toUserIds: to,
      chat,
      idempotencyKey: key,
      expectedPrice: picked.price,
    });
    setBusy(false);
    if (!res.ok) {
      if (res.error.code === 'PRICE_CHANGED') void loadShelf();
      setError(pickerError(res.error, t) ?? res.error);
      return;
    }
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
    onSent({ ...res.data, item: picked, partialNote });
  }

  // ---- The shelf by kind: what the tabs count and the panel shows ----
  // each description in the reader's language, so what is searched is what is read
  const items = (shelf?.items ?? []).map((item) => ({ ...item, description: shopItemDescription(item, locale) }));
  // Everyone chosen already has it, so there is nobody to give it to.
  const everyoneHasIt = (item: ShelfItem): boolean => getting(item).length === 0;
  const keep = (item: ShelfItem): boolean => (!affordOnly || affordable(item)) && (!hideOwned || !everyoneHasIt(item));
  const kinds = categoriesIn(items);
  const matching = applyItemFilter(items, { ...filter, category: 'all' }, keep, locale);
  const counts = countByCategory(matching);
  const active: KindTab = filter.category !== 'all' && kinds.includes(filter.category) ? filter.category : 'all';
  const shown = active === 'all' ? matching : matching.filter((item) => itemCategory(item.category) === active);
  const filtered = isFiltered(filter) || affordOnly || hideOwned;
  const clear = (): void => {
    setFilter(DEFAULT_ITEM_FILTER);
    setAffordOnly(false);
    setHideOwned(false);
  };
  // The choice stays when a filter hides it; the bar by Send says so.
  const pickedHidden = picked !== null && !shown.some((item) => item.sku === picked.sku);

  const renderTile = (item: ShelfItem): React.JSX.Element => {
    const owners = item.alreadyOwnedBy;
    const canPay = affordable(item);
    const selected = picked?.sku === item.sku;
    return (
      <li key={item.sku}>
        <button
          type="button"
          className={`gift-tile${selected ? ' is-picked' : ''} gift-tile-${item.tier}`}
          aria-pressed={selected}
          disabled={everyoneHasIt(item)}
          onClick={() => {
            setPicked(selected ? null : item);
            setError(null);
            setSkippedNote(null);
          }}
        >
          <GiftItemArt assetUrl={item.assetUrl} category={item.category} size={72} />
          <span className="gift-tile-name">{item.name}</span>
          {item.description && <span className="gift-tile-desc">{item.description}</span>}
          <span className={`gift-tile-price${canPay ? '' : ' is-short'}`}>
            <CoinIcon size={13} /> {fmt(item.price)}
            <span className="sr-only">Zêr</span> <ZerValue zer={item.price} />
          </span>
          {item.tier !== 'common' && <span className={`gift-tier gift-tier-${item.tier}`}>{t(TIER_LABEL[item.tier])}</span>}
          {owners.length > 0 && (
            <span className="gift-tile-owned">
              {group
                ? t('gift.picker.someHaveIt', { names: owners.map((id) => nameOf.get(id) ?? '').join(', ') })
                : t('gift.picker.hasIt')}
            </span>
          )}
          {selected && (
            <span className="gift-tile-check" aria-hidden>
              <CheckIcon size={14} />
            </span>
          )}
        </button>
      </li>
    );
  };

  const names = chosen.map((id) => nameOf.get(id) ?? '').filter(Boolean);
  const title = group ? t('gift.picker.titleGroup') : t('gift.picker.title', { name: people?.[0]?.name ?? '' });

  return (
    <Sheet open onClose={onClose} label={title} className="gift-picker">
      <h2 className="gift-picker-title">{title}</h2>

      {step === 'who' && (
        <WhoStep
          people={people}
          chosen={chosen}
          onChange={setChosen}
          onNext={() => setStep('what')}
        />
      )}

      {step === 'what' && (
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
            <p className="muted gift-hold">
              {t(shelf.hold === 'new_friend' ? 'gift.hold.newFriend' : 'gift.hold.friendsOnly', { name: people?.[0]?.name ?? '' })}
            </p>
          ) : shelf.items.length === 0 ? (
            <p className="muted">{t('gift.picker.empty')}</p>
          ) : (
            <>
              <KindTabs
                kinds={['all', ...kinds]}
                value={active}
                counts={counts}
                idPrefix={ids}
                onChange={(category) => setFilter((f) => ({ ...f, category }))}
              />
              <ItemToolbar>
                <ItemSearch
                  value={filter.query}
                  label={t('gift.picker.searchLabel')}
                  placeholder={t('items.searchByName')}
                  onChange={(query) => setFilter((f) => ({ ...f, query }))}
                />
                <ItemSort value={filter.sort} onChange={(sort) => setFilter((f) => ({ ...f, sort }))} />
                <div className="item-toggles">
                  <FilterToggle checked={affordOnly} onChange={setAffordOnly}>
                    {t('items.withinBalance')}
                  </FilterToggle>
                  <FilterToggle checked={hideOwned} onChange={setHideOwned}>
                    {t('gift.picker.hideOwned')}
                  </FilterToggle>
                </div>
              </ItemToolbar>
              <ResultsLine count={shown.length} filtered={filtered && shown.length > 0} onClear={clear} />

              <KindPanel idPrefix={ids} kind={active}>
                {shown.length === 0 ? (
                  <NoMatches onClear={clear} />
                ) : active === 'all' ? (
                  groupByCategory(shown).map((g) => (
                    <section key={g.category} className="gift-shelf-section" aria-labelledby={`${ids}-${g.category}`}>
                      <KindHeading kind={g.category} count={g.items.length} id={`${ids}-${g.category}`} level={3} />
                      <ul className="gift-shelf" aria-labelledby={`${ids}-${g.category}`}>
                        {g.items.map(renderTile)}
                      </ul>
                    </section>
                  ))
                ) : (
                  <ul className="gift-shelf" aria-label={t('gift.picker.shelf')}>
                    {shown.map(renderTile)}
                  </ul>
                )}
              </KindPanel>
            </>
          )}

          {picked && (
            <div className="gift-confirm">
              {/* The chosen item beside the send button, even when the filters hide it from the shelf. */}
              <GiftItemArt assetUrl={picked.assetUrl} category={picked.category} size={44} className="gift-confirm-art" />
              <span className="gift-confirm-text">
                {t('gift.picker.confirm', {
                  item: picked.name,
                  names: getting(picked).map((id) => nameOf.get(id) ?? '').join(', '),
                })}
                <strong className="gift-confirm-cost">
                  <CoinIcon size={14} /> {fmt(cost(picked))} <ZerValue zer={cost(picked)} />
                </strong>
                {pickedHidden && <span className="gift-confirm-hidden">{t('gift.picker.pickHidden')}</span>}
                {/* Beside the button that spends: a gift, like any purchase, is final. */}
                <span className="gift-confirm-hidden">{t('shop.giftFinal')}</span>
              </span>
              {!affordable(picked) && <span className="gift-confirm-short">{t('gift.error.funds')}</span>}
              <Button onClick={() => void send()} disabled={busy || !affordable(picked)}>
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

/** The shelf while loading: empty tiles with placeholders for picture, name, subtitle and price. */
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
