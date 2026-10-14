import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MAX_GIFT_RECIPIENTS,
  type GiftCatalogItem,
  type GiftChatRef,
  type SendGiftResult,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { requestId } from '../lib/api';
import type { ApiError, DmMessage, GroupMessage } from '../lib/types';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { Avatar } from '../components/Avatar';
import { CheckIcon, CoinIcon, GemIcon } from '../components/icons';
import { Skeleton, SkeletonRegion } from '../components/Skeleton';
import { useI18n, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { SendError } from '../reports/SendError';
import { GiftItemArt } from './GiftArt';

/** Someone a gift can go to: a friend you are talking to, or a friend in the group. */
export interface GiftPerson {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

/** What a send gave back: who got it, who did not and why, and the message to show. */
export interface GiftSent extends SendGiftResult {
  message: DmMessage | GroupMessage | null;
  item: GiftCatalogItem;
  /**
   * When some of the chosen friends were skipped: who did get it and why the
   * others did not, in the reader's words ("Sent to rojda. dilan already has
   * it."); null when everyone chosen was given it.
   */
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
 * The gift picker, from the chat's gift button.
 *
 * In a direct message the gift is for the friend you are talking to; in a
 * group you first choose who among the members — only your friends are
 * offered (gifts are only ever between friends), with "Select all" — and
 * then what. The shelf is `GET /gifts/catalog?to=…`: everything on sale with
 * a price, the price, who already has a one-of-a-kind item, and your balance.
 * Nothing is chosen for you and nothing nudges; there is no "send one back".
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
  /** who may be chosen: the one friend in a DM, your friends among a group's members */
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
  const [shelf, setShelf] = useState<{ items: GiftCatalogItem[]; balance: { zer: number; gems: number } } | null>(null);
  const [shelfError, setShelfError] = useState<ApiError | null>(null);
  const [picked, setPicked] = useState<GiftCatalogItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | string | null>(null);
  const [skippedNote, setSkippedNote] = useState<string | null>(null);
  // one key per attempt at one choice: a retry of the same send never pays twice
  const [key, setKey] = useState(() => requestId());

  // in a direct message the one friend is the recipient as soon as they are known
  // (the list arrives a moment after the sheet opens)
  const only = !group ? people?.[0]?.userId : undefined;
  useEffect(() => {
    if (only) setChosen((now) => (now.length === 0 ? [only] : now));
  }, [only]);

  const nameOf = useMemo(() => new Map((people ?? []).map((p) => [p.userId, p.name])), [people]);
  const fmt = (n: number): string => n.toLocaleString(locale);

  const loadShelf = useCallback(async () => {
    setShelf(null);
    setShelfError(null);
    const res = await client.get<{ items: GiftCatalogItem[]; balance: { zer: number; gems: number } }>(
      `/gifts/catalog?to=${chosen.join(',')}`,
    );
    if (res.ok) {
      const items = res.data.items ?? [];
      setShelf({ items, balance: res.data.balance ?? { zer: 0, gems: 0 } });
      // a reload (after a price change) keeps the choice, at what it costs now:
      // the confirm bar, the affordability and the next send's expected price
      // all read the fresh item, not the one that was refused
      setPicked((p) => (p ? (items.find((i) => i.sku === p.sku) ?? null) : null));
    } else setShelfError(res.error);
  }, [client, chosen]);

  useEffect(() => {
    if (step === 'what' && chosen.length > 0) void loadShelf();
  }, [step, loadShelf, chosen.length]);

  // a different choice is a different send
  useEffect(() => setKey(requestId()), [picked, chosen]);

  const getting = (item: GiftCatalogItem): string[] => chosen.filter((id) => !item.alreadyOwnedBy.includes(id));
  const cost = (item: GiftCatalogItem): number => item.price * getting(item).length;
  const affordable = (item: GiftCatalogItem): boolean =>
    !!shelf && cost(item) <= (item.currency === 'gems' ? shelf.balance.gems : shelf.balance.zer);

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
      // nobody could be given it: say why, and let them choose again
      setSkippedNote(why || t('gift.error.unavailable'));
      return;
    }
    const partialNote =
      res.data.skipped.length > 0
        ? `${t('gift.sentTo', { names: res.data.sent.map((id) => nameOf.get(id) ?? '').filter(Boolean).join(', ') })} ${why}`
        : null;
    onSent({ ...res.data, item: picked, partialNote });
  }

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
              <span className="gift-balance" aria-label={t('gift.picker.balance', { zer: fmt(shelf.balance.zer), gems: fmt(shelf.balance.gems) })}>
                <span>
                  <CoinIcon size={15} /> {fmt(shelf.balance.zer)}
                </span>
                <span>
                  <GemIcon size={15} /> {fmt(shelf.balance.gems)}
                </span>
              </span>
            )}
          </div>

          {shelfError ? (
            <SendError error={shelfError} />
          ) : shelf === null ? (
            <ShelfSkeleton count={6} />
          ) : shelf.items.length === 0 ? (
            <p className="muted">{t('gift.picker.empty')}</p>
          ) : (
            <ul className="gift-shelf" aria-label={t('gift.picker.shelf')}>
              {shelf.items.map((item) => {
                const owners = item.alreadyOwnedBy;
                const allHave = getting(item).length === 0;
                const canPay = affordable(item);
                const selected = picked?.sku === item.sku;
                return (
                  <li key={item.sku}>
                    <button
                      type="button"
                      className={`gift-tile${selected ? ' is-picked' : ''} gift-tile-${item.tier}`}
                      aria-pressed={selected}
                      disabled={allHave}
                      onClick={() => {
                        setPicked(selected ? null : item);
                        setError(null);
                        setSkippedNote(null);
                      }}
                    >
                      <GiftItemArt assetUrl={item.assetUrl} category={item.category} size={72} />
                      <span className="gift-tile-name">{item.name}</span>
                      <span className={`gift-tile-price${canPay ? '' : ' is-short'}`}>
                        {item.currency === 'gems' ? <GemIcon size={13} /> : <CoinIcon size={13} />} {fmt(item.price)}
                        <span className="sr-only">{item.currency === 'gems' ? t('shop.gems') : 'Zêr'}</span>
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
              })}
            </ul>
          )}

          {picked && (
            <div className="gift-confirm">
              <span className="gift-confirm-text">
                {t('gift.picker.confirm', {
                  item: picked.name,
                  names: getting(picked).map((id) => nameOf.get(id) ?? '').join(', '),
                })}
                <strong className="gift-confirm-cost">
                  {picked.currency === 'gems' ? <GemIcon size={14} /> : <CoinIcon size={14} />} {fmt(cost(picked))}
                </strong>
              </span>
              {!affordable(picked) && <span className="gift-confirm-short">{t('gift.error.funds')}</span>}
              <Button onClick={() => void send()} disabled={busy || !affordable(picked)}>
                {busy ? t('gift.sending') : t('gift.send')}
              </Button>
              {/* the answer sits by the button that asked, not under a shelf
                  that may be scrolled far above it */}
              <SendError error={error ?? skippedNote} className="gift-confirm-note" />
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}

/** Choosing who, in a group: your friends among its members, up to seven at once. */
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

/** The shelf while it loads: the same tiles, empty. */
function ShelfSkeleton({ count }: { count: number }): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t('gift.picker.loading')} className="gift-shelf">
      {Array.from({ length: count }, (_, i) => (
        <span className="gift-tile is-skeleton" key={i}>
          <Skeleton w={72} h={72} radius="var(--r-md)" />
          <Skeleton line w="70%" />
        </span>
      ))}
    </SkeletonRegion>
  );
}
