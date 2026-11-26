import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Pressable } from '../theme/Pressable';
import {
  GIFTS_PER_DAY,
  GIFTS_PER_FRIEND_PER_DAY,
  MAX_GIFT_RECIPIENTS,
  ZER_ON_SALE,
  giftLockFor,
  giftMeaning,
  giftShelves,
  type BagEntry,
  type GiftCatalogItem,
  type GiftChatRef,
  type GiftConfirmDetails,
  type GiftGroup,
  type GiftLock,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import type { TranslationKey } from '../i18n/translations';
import { useTheme } from '../theme/ThemeProvider';
import { BottomSheet, SheetScrollView } from '../theme/BottomSheet';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { Avatar } from '../profile/Avatar';
import { restrictionOf } from '../reports/sendErrors';
import { SendErrorNotice } from '../reports/SendError';
import { useDirection } from '../reports/direction';
import { ZER } from '../shop/format';
import { ItemArt, ToggleChip } from '../shop/ItemFilters';
import { ZerValue, useZerValue } from '../shop/value';
import { giftCatalog, newGiftKey, sendGift, type GiftCatalog, type PostTarget, type SentGift } from './api';
import { Loading } from '../theme/Loading';
import { pressedDim } from '../theme/motion';
import type { RootNavigation } from '../navigation/rootStack';
import { display } from '../theme/fonts';

/** A friend a gift can go to. */
export interface GiftFriend {
  userId: string;
  name: string;
  avatarUrl?: string | null;
}

/**
 * Choosing a gift, the sheet behind a chat's gift button and a post's. In a direct message the friend is already chosen,
 * and on a post its author; in a group it starts with who (only your friends among the members, the server's rule too,
 * with "All my friends here"), unless a gift is being sent back to one of them. Then what: the gift bag first, the small
 * gifts everyone earns, with how many of each; then the gifts by shelf, cheapest first, each with its Kurmancî name and
 * what it means in the reader's language, its price and what that is worth, and a lock with the reason where it cannot
 * go (not enough Zêr, or a safeguard for these recipients). "Get Zêr" shows only while Zêr is on sale and never to
 * anyone under 18. A member's free gifts can pay for a small one. A big send stops for one more look with its money
 * amount, sent with the server's token. When the rules do not let a gift go yet, one calm line says why instead. Send
 * closes the sheet on the send animation.
 */
export function GiftPickerSheet({
  visible,
  chat,
  post,
  friends,
  onClose,
  onSent,
  initialChosen,
}: {
  visible: boolean;
  /** the chat the gift is posted in; left out for a gift onto a post */
  chat?: GiftChatRef;
  /** a post the gift is given onto, with its author's name for the title */
  post?: PostTarget;
  /** DM: the one friend. Group: your friends among the members (may be empty). A post: its author. */
  friends: GiftFriend[];
  onClose: () => void;
  onSent: (result: SentGift, item: GiftCatalogItem, to: GiftFriend[]) => void;
  /** In a group, the friend a gift is being sent back to, chosen already. */
  initialChosen?: string[];
}): React.JSX.Element {
  const { t } = useI18n();
  const group = chat?.kind === 'group';
  const preset = group ? (initialChosen ?? []).filter((id) => friends.some((f) => f.userId === id)) : [];
  const presetKey = preset.join(',');
  const [step, setStep] = useState<'who' | 'what'>(group && preset.length === 0 ? 'who' : 'what');
  const [chosen, setChosen] = useState<string[]>(group ? preset : friends.map((f) => f.userId));

  useEffect(() => {
    if (!visible) return;
    const back = presetKey ? presetKey.split(',') : [];
    setStep(group && back.length === 0 ? 'who' : 'what');
    setChosen(group ? back : friends.map((f) => f.userId));
  }, [visible, group, friends, presetKey]);

  const recipients = friends.filter((f) => chosen.includes(f.userId));
  const name = friends[0]?.name ?? '';
  const title = group ? t('gift.button') : post ? t('gift.post.titleFor', { name }) : t('gift.picker.titleFor', { name });

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      icon="gift"
      onBack={group && step === 'what' ? () => setStep('who') : undefined}
      contentStyle={styles.edge}
    >
      {step === 'who' ? (
        <WhoStep friends={friends} chosen={chosen} onChange={setChosen} onNext={() => setStep('what')} />
      ) : visible && recipients.length > 0 ? (
        <WhatStep chat={chat} post={post} recipients={recipients} onSent={onSent} onClose={onClose} />
      ) : null}
    </BottomSheet>
  );
}

function WhoStep({
  friends,
  chosen,
  onChange,
  onNext,
}: {
  friends: GiftFriend[];
  chosen: string[];
  onChange: (ids: string[]) => void;
  onNext: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  if (friends.length === 0) {
    return (
      <View style={styles.body}>
        <Text style={[styles.note, dir.text, { color: colors.textSecondary }]}>{t('gift.picker.noFriendsHere')}</Text>
        <Text style={[styles.note, dir.text, { color: colors.textSecondary }]}>{t('gift.picker.onlyFriends')}</Text>
      </View>
    );
  }
  const pickable = friends.slice(0, MAX_GIFT_RECIPIENTS).map((f) => f.userId);
  const hint = friends.length > MAX_GIFT_RECIPIENTS ? t('gift.picker.max', { max: MAX_GIFT_RECIPIENTS }) : t('gift.picker.onlyFriends');
  const all = pickable.every((id) => chosen.includes(id)) && chosen.length === pickable.length;
  const toggle = (id: string): void => {
    if (chosen.includes(id)) onChange(chosen.filter((c) => c !== id));
    else if (chosen.length < MAX_GIFT_RECIPIENTS) onChange([...chosen, id]);
  };
  return (
    <>
      <SheetScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.lead, dir.text, { color: colors.textPrimary }]}>{t('gift.picker.who')}</Text>
        <Text style={[styles.note, dir.text, { color: colors.textSecondary }]}>{hint}</Text>
        <CheckRow
          label={t('gift.picker.selectAll')}
          checked={all}
          onPress={() => onChange(all ? [] : pickable)}
          strong
        />
        {friends.map((f) => (
          <CheckRow
            key={f.userId}
            label={f.name}
            checked={chosen.includes(f.userId)}
            disabled={!chosen.includes(f.userId) && chosen.length >= MAX_GIFT_RECIPIENTS}
            onPress={() => toggle(f.userId)}
            avatar={<Avatar name={f.name} size={32} photoUrl={f.avatarUrl ?? undefined} />}
          />
        ))}
      </SheetScrollView>
      <View style={styles.footer}>
        <ClayButton label={t('gift.picker.next')} tone="primary" size="large" disabled={chosen.length === 0} onPress={onNext} />
      </View>
    </>
  );
}

function CheckRow({
  label,
  checked,
  onPress,
  disabled = false,
  strong = false,
  avatar,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
  disabled?: boolean;
  strong?: boolean;
  avatar?: React.ReactNode;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      // Aria-* as well as the state object: react-native-web reads only these.
      accessibilityState={{ checked, disabled }}
      aria-checked={checked}
      aria-disabled={disabled}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.checkRow, { flexDirection: dir.row, opacity: disabled ? 0.45 : pressed ? pressedDim : 1 }]}
    >
      {avatar}
      <Text
        style={[styles.checkLabel, dir.text, { color: colors.textPrimary, fontWeight: strong ? typography.weights.semibold : typography.weights.regular }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <View
        style={[
          styles.box,
          { borderColor: checked ? colors.primary : colors.textSecondary, backgroundColor: checked ? colors.primary : 'transparent' },
        ]}
      >
        {checked ? <Icon name="check" size={14} color={colors.textOnPrimary} /> : null}
      </View>
    </Pressable>
  );
}

/** What is chosen: a gift from the bag, or one paid for in Zêr. */
interface Choice {
  item: GiftCatalogItem;
  fromBag: boolean;
}

const GROUP_LABEL: Record<GiftGroup, TranslationKey> = {
  warm: 'gift.group.warm',
  flowers: 'gift.group.flowers',
  animals: 'gift.group.animals',
  music: 'gift.group.music',
  sky: 'gift.group.sky',
  boats: 'gift.group.boats',
  houses: 'gift.group.houses',
  legends: 'gift.group.legends',
};

/** The second confirmation's details, checked before they are trusted. */
function confirmDetails(details: unknown): GiftConfirmDetails | null {
  const d = details as Partial<GiftConfirmDetails> | null;
  return d && typeof d.confirmToken === 'string' && typeof d.total === 'number' ? (d as GiftConfirmDetails) : null;
}

function WhatStep({
  chat,
  post,
  recipients,
  onSent,
  onClose,
}: {
  chat?: GiftChatRef;
  post?: PostTarget;
  recipients: GiftFriend[];
  onSent: (result: SentGift, item: GiftCatalogItem, to: GiftFriend[]) => void;
  /** The sheet closes before Account standing opens, or it would open underneath. */
  onClose: () => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  // Keyed on who, not the array: the parent passes a fresh array every render, and each one would be a new catalogue
  // request.
  const idKey = recipients.map((r) => r.userId).join(',');
  const ids = useMemo(() => (idKey ? idKey.split(',') : []), [idKey]);
  const [catalog, setCatalog] = useState<GiftCatalog | null>(null);
  // A rule that keeps this gift from going is one calm line; only a failure to reach the server offers a retry.
  const [loadError, setLoadError] = useState<{ text: string; rule: boolean } | null>(null);
  const [picked, setPicked] = useState<Choice | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<ApiError | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [useFree, setUseFree] = useState(false);
  /** The server asked for the second look at a big gift: what to show, and its token. */
  const [confirming, setConfirming] = useState<GiftConfirmDetails | null>(null);
  const value = useZerValue();
  // One key per choice, so a retry of the same gift replays it and never pays twice (a fresh key only if the server
  // says this one already named another request).
  const [keyRound, setKeyRound] = useState(0);
  const key = useMemo(() => newGiftKey(), [picked?.item.sku, picked?.fromBag, idKey, keyRound]);

  const load = useCallback(() => {
    setLoadError(null);
    void giftCatalog(client, post ?? ids).then((res) => {
      if (res.ok) {
        setCatalog(res.data);
        // a reload after a price change keeps the choice at its new price
        setPicked((p) => {
          const fresh = p ? res.data.items.find((i) => i.sku === p.item.sku) : undefined;
          return p && fresh ? { ...p, item: fresh } : null;
        });
      } else setLoadError({ text: giftErrorText(res.error, t), rule: GIFT_RULES.has(res.error.code ?? '') });
    });
  }, [client, ids, post, t]);

  useEffect(load, [load]);

  // On a post the author is the one recipient, whom the server names in `alreadyOwnedBy`.
  const owners = useCallback((item: GiftCatalogItem) => (post ? [] : item.alreadyOwnedBy.filter((id) => ids.includes(id))), [ids, post]);
  const giving = (item: GiftCatalogItem): number => Math.max(1, recipients.length - owners(item).length);
  const lockOf = (item: GiftCatalogItem): GiftLock | 'funds' | null =>
    giftLockFor(item, giving(item), catalog?.limits) ?? (catalog && item.price * giving(item) > catalog.balance.zer ? 'funds' : null);
  const bagCount = (sku: string): number => catalog?.bag?.find((b) => b.sku === sku)?.count ?? 0;

  const amount = (n: number): string => formatNumber(n, locale);
  const priceWords = (item: GiftCatalogItem): string => `${amount(item.price)} ${ZER}, ${value(item.price)}`;
  const total = picked ? picked.item.price * giving(picked.item) : 0;
  // A member's free gifts pay for a small gift, one a recipient, only when there are enough for everyone it goes to.
  const canUseFree = picked !== null && !picked.fromBag && picked.item.freeGiftEligible && (catalog?.freeGifts ?? 0) >= giving(picked.item);
  const free = useFree && canUseFree;

  const send = (confirmToken?: string): void => {
    if (!picked || busy) return;
    setBusy(true);
    setSendError(null);
    setNote(null);
    // Given: felt as it goes, and felt as an error if it did not go.
    haptic('tap');
    const base = {
      sku: picked.item.sku,
      idempotencyKey: key,
      expectedPrice: picked.item.price,
      ...(picked.fromBag ? { fromBag: true } : free ? { useFreeGift: true } : {}),
      ...(confirmToken ? { confirmToken } : {}),
    };
    void sendGift(client, post ? { ...base, post } : { ...base, toUserIds: ids.filter((id) => !owners(picked.item).includes(id)), chat: chat! }).then((res) => {
      setBusy(false);
      if (res.ok) {
        setConfirming(null);
        if (res.data.sent.length === 0) {
          // Nobody could be given it: say why here rather than animate a gift that went nowhere.
          setNote(skippedText(res.data.skipped, recipients, t));
          return;
        }
        onSent(res.data, picked.item, recipients.filter((r) => res.data.sent.includes(r.userId)));
        return;
      }
      const asked = res.error.code === 'GIFT_NEEDS_CONFIRM' ? confirmDetails(res.error.details) : null;
      if (asked) {
        setConfirming(asked);
        return;
      }
      setConfirming(null);
      haptic('error');
      // What is on offer changed while the sheet was open (a new price, a Newroz gift gone, the bag emptied): say so and
      // show the catalogue as it is now.
      const code = res.error.code;
      if (code === 'PRICE_CHANGED' || code === 'BAG_EMPTY' || (code && GONE.has(code))) {
        if (code !== 'BAG_EMPTY') setPicked(null);
        setNote(code === 'PRICE_CHANGED' ? t('shop.priceChangedBody') : giftErrorText(res.error, t));
        load();
        return;
      }
      if (code === 'IDEMPOTENCY_REUSED') setKeyRound((n) => n + 1);
      if (restrictionOf(res.error)) setSendError(res.error);
      else setNote(giftErrorText(res.error, t));
    });
  };

  if (loadError?.rule) {
    return (
      <View style={styles.body} testID="gift-hold">
        <Text style={[styles.note, dir.text, { color: colors.textSecondary }]}>{loadError.text}</Text>
      </View>
    );
  }
  if (loadError) {
    return (
      <View style={styles.body}>
        <Text style={[styles.note, dir.text, { color: colors.danger }]}>{loadError.text}</Text>
        <ClayButton label={t('common.retry')} onPress={load} />
      </View>
    );
  }
  if (!catalog) return <Loading style={styles.spinner} />;
  // The rules do not let a gift go to this one person yet: one calm line, rather than a catalogue that would fail.
  if (catalog.hold) {
    return (
      <View style={styles.body} testID="gift-hold">
        <Text style={[styles.note, dir.text, { color: colors.textSecondary }]}>
          {t(catalog.hold === 'new_friend' ? 'gift.hold.newFriend' : 'gift.hold.friendsOnly', { name: recipients[0]?.name ?? '' })}
        </Text>
      </View>
    );
  }

  if (confirming && picked) {
    return (
      <BigGiftConfirm
        item={picked.item}
        names={recipients.filter((r) => !owners(picked.item).includes(r.userId)).map((r) => r.name)}
        details={confirming}
        busy={busy}
        note={note}
        onConfirm={() => send(confirming.confirmToken)}
        onBack={() => {
          setConfirming(null);
          setNote(null);
        }}
      />
    );
  }

  const items = catalog.items;
  const bag = (catalog.bag ?? []).filter((b) => b.count > 0 && items.some((i) => i.sku === b.sku));
  const nudges = ZER_ON_SALE && catalog.nudges === true;

  return (
    <>
      <View style={[styles.balance, { flexDirection: dir.row }]} accessibilityLabel={t('gift.picker.balance', { zer: amount(catalog.balance.zer) })}>
        <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>{t('gift.picker.youHave')}</Text>
        <View style={[styles.chip, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]}>
          <Icon name="coin" size={14} color={colors.gold} />
          <Text style={[styles.chipText, { color: colors.textPrimary }]}>{amount(catalog.balance.zer)}</Text>
        </View>
        {catalog.freeGifts > 0 ? (
          <View style={[styles.chip, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]}>
            <Icon name="gift" size={14} color={colors.gold} />
            <Text style={[styles.chipText, { color: colors.textPrimary }]}>{t('gift.picker.freeGifts', { count: amount(catalog.freeGifts) })}</Text>
          </View>
        ) : null}
      </View>

      <SheetScrollView contentContainerStyle={styles.scroll}>
        {items.length === 0 ? (
          <Text style={[styles.note, styles.gutter, dir.text, { color: colors.textSecondary }]}>{t('gift.picker.empty')}</Text>
        ) : (
          <>
            {catalog.limits?.left != null ? (
              <Text style={[styles.note, styles.gutter, dir.text, { color: colors.textSecondary }]}>{t('gift.limit.leftLine', { zer: amount(catalog.limits.left) })}</Text>
            ) : null}
            <View style={[styles.bag, { borderColor: colors.separator, backgroundColor: colors.controlTrack }]} testID="gift-bag">
              <Text style={[styles.heading, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
                {t('gift.bag.title')}
              </Text>
              {bag.length === 0 ? (
                <Text style={[styles.note, dir.text, { color: colors.textSecondary }]}>{t('gift.bag.empty')}</Text>
              ) : (
                <View style={[styles.grid, styles.gridInset, { flexDirection: dir.row }]}>
                  {bag.map((entry) => {
                    const item = items.find((i) => i.sku === entry.sku)!;
                    return (
                      <BagTile
                        key={entry.sku}
                        entry={entry}
                        meaning={giftMeaning(entry.sku, locale)}
                        enough={bagCount(entry.sku) >= giving(item)}
                        selected={picked?.fromBag === true && picked.item.sku === entry.sku}
                        onPress={() => setPicked({ item, fromBag: true })}
                      />
                    );
                  })}
                </View>
              )}
            </View>
            {giftShelves(items).map((shelf) => (
              <View key={shelf.group} style={styles.group}>
                <Text style={[styles.heading, styles.gutter, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
                  {t(GROUP_LABEL[shelf.group])}
                </Text>
                <View style={[styles.grid, { flexDirection: dir.row }]}>
                  {shelf.items.map((item) => (
                    <GiftTile
                      key={item.sku}
                      item={item}
                      meaning={giftMeaning(item.sku, locale)}
                      lock={lockOf(item)}
                      maxPrice={catalog.limits?.maxPrice ?? null}
                      owned={owners(item).length}
                      recipients={recipients.length}
                      selected={picked?.fromBag === false && picked.item.sku === item.sku}
                      priceWords={priceWords(item)}
                      nudges={nudges}
                      onPress={() => setPicked({ item, fromBag: false })}
                      onGetZer={onClose}
                    />
                  ))}
                </View>
              </View>
            ))}
          </>
        )}
      </SheetScrollView>

      <View style={styles.footer}>
        <SendErrorNotice error={sendError} onDismiss={() => setSendError(null)} onNavigate={onClose} />
        {note ? (
          <Text style={[styles.note, styles.center, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
            {note}
          </Text>
        ) : null}
        {canUseFree ? (
          <View style={[styles.freeRow, { flexDirection: dir.row }]}>
            <ToggleChip label={t('gift.picker.useFree')} value={useFree} onChange={setUseFree} />
          </View>
        ) : null}
        <Text style={[styles.limits, styles.center, { color: colors.textSecondary }]}>
          {t('gift.picker.limits', { perDay: GIFTS_PER_DAY, perFriend: GIFTS_PER_FRIEND_PER_DAY })} {t('shop.giftFinal')}
        </Text>
        <ClayButton
          label={
            picked
              ? picked.fromBag
                ? t('gift.picker.sendFromBag')
                : free
                  ? t('gift.picker.sendFree')
                  : recipients.length > 1
                    ? `${t('gift.picker.sendTotal', { total: amount(total), currency: ZER })} · ${value(total)}`
                    : t('gift.picker.send')
              : t('gift.picker.pick')
          }
          icon="gift"
          tone="primary"
          size="large"
          busy={busy}
          disabled={!picked || (!picked.fromBag && !free && lockOf(picked.item) !== null)}
          onPress={() => send()}
        />
      </View>
    </>
  );
}

/** One kind of gift in the bag: free to give, with how many are left. */
function BagTile({
  entry,
  meaning,
  enough,
  selected,
  onPress,
}: {
  entry: BagEntry;
  meaning: string | null;
  enough: boolean;
  selected: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const count = t('gift.bag.count', { count: formatNumber(entry.count, locale) });
  return (
    <Pressable
      onPress={onPress}
      disabled={!enough}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: !enough }}
      aria-checked={selected}
      aria-disabled={!enough}
      accessibilityLabel={[entry.name, meaning, count, t('gift.bag.free')].filter(Boolean).join(', ')}
      style={({ pressed }) => [
        styles.item,
        { backgroundColor: colors.background, borderColor: selected ? colors.gold : 'transparent', opacity: !enough ? 0.45 : pressed ? pressedDim : 1 },
      ]}
    >
      <View style={[styles.itemArt, styles.itemArtSquare]}>
        <ItemArt category="gift" path={entry.assetUrl} width={64} />
      </View>
      <Text style={[styles.itemName, dir.free, { color: colors.textPrimary }]} numberOfLines={2} accessibilityLanguage="ku">
        {entry.name}
      </Text>
      {meaning ? <Text style={[styles.owned, dir.text, { color: colors.textSecondary }]}>{meaning}</Text> : null}
      <Text style={[styles.price, dir.text, { color: colors.textPrimary }]}>{count}</Text>
      {!enough ? <Text style={[styles.owned, dir.text, { color: colors.textSecondary }]}>{t('gift.bag.notEnough')}</Text> : null}
    </Pressable>
  );
}

/** A gift on a shelf: its Kurmancî name and meaning, its price and worth, and a lock with the reason when it cannot go. */
function GiftTile({
  item,
  meaning,
  lock,
  maxPrice,
  owned,
  recipients,
  selected,
  priceWords,
  nudges,
  onPress,
  onGetZer,
}: {
  item: GiftCatalogItem;
  meaning: string | null;
  lock: GiftLock | 'funds' | null;
  maxPrice: number | null;
  owned: number;
  recipients: number;
  selected: boolean;
  priceWords: string;
  /** whether a "Get Zêr" may be offered: Zêr on sale, and a known adult */
  nudges: boolean;
  onPress: () => void;
  onGetZer: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const everyone = owned >= recipients;
  // the safeguards rule it out; one beyond the balance alone can still be looked at, and the Send button says so
  const ruled = everyone || lock === 'over_limit' || lock === 'spend_limit';
  const why =
    lock === 'over_limit'
      ? t('gift.lock.overLimit', { zer: formatNumber(maxPrice ?? 0, locale) })
      : lock === 'spend_limit'
        ? t('gift.lock.spendLimit')
        : lock === 'funds'
          ? t('gift.lock.funds')
          : null;
  const ownedLine = everyone ? (recipients > 1 ? t('gift.picker.allHaveIt') : t('gift.picker.hasIt')) : owned > 0 ? t('gift.picker.someHaveIt', { count: owned }) : null;
  return (
    <View style={styles.cell}>
      <Pressable
        onPress={onPress}
        disabled={ruled}
        accessibilityRole="radio"
        accessibilityState={{ selected, disabled: ruled }}
        aria-checked={selected}
        aria-disabled={ruled}
        accessibilityLabel={[item.name, meaning, priceWords, why, ownedLine].filter(Boolean).join(', ')}
        style={({ pressed }) => [
          styles.item,
          { backgroundColor: colors.controlTrack, borderColor: selected ? colors.gold : 'transparent', opacity: ruled ? 0.45 : pressed ? pressedDim : 1 },
        ]}
      >
        <View style={[styles.itemArt, styles.itemArtSquare]}>
          <ItemArt category={item.category} path={item.assetUrl} width={64} />
          {item.tier !== 'common' ? (
            <View style={[styles.tier, dir.row === 'row-reverse' ? styles.tierLeft : styles.tierRight, { backgroundColor: colors.gold }]}>
              <Text style={[styles.tierText, { color: colors.textOnGold }]}>{t(TIER_LABEL[item.tier])}</Text>
            </View>
          ) : null}
        </View>
        {/* A Kurmancî name, read in its own direction whatever the app language. */}
        <Text style={[styles.itemName, dir.free, { color: colors.textPrimary }]} numberOfLines={2} accessibilityLanguage="ku">
          {item.name}
        </Text>
        {meaning ? <Text style={[styles.owned, dir.text, { color: colors.textSecondary }]}>{meaning}</Text> : null}
        <View style={[styles.priceRow, { flexDirection: dir.row }]}>
          <Icon name={lock ? 'lock' : 'coin'} size={14} color={lock ? colors.textSecondary : colors.gold} />
          <Text style={[styles.price, { color: colors.textPrimary }]}>{formatNumber(item.price, locale)}</Text>
        </View>
        <ZerValue zer={item.price} style={dir.text} />
        {why ? <Text style={[styles.owned, dir.text, { color: colors.textSecondary }]}>{why}</Text> : null}
        {ownedLine ? <Text style={[styles.owned, dir.text, { color: colors.textSecondary }]}>{ownedLine}</Text> : null}
      </Pressable>
      {lock === 'funds' && nudges ? <GetZer onLeave={onGetZer} /> : null}
    </View>
  );
}

/** "Get Zêr", to the shop where Zêr is sold, for a known adult while it is on sale (`ZER_ON_SALE`). */
function GetZer({ onLeave }: { onLeave: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const navigation = useNavigation<RootNavigation>();
  return (
    <ClayButton
      label={t('gift.getZer')}
      variant="outline"
      onPress={() => {
        onLeave();
        navigation.navigate('Shop');
      }}
    />
  );
}

/**
 * The second look at a big gift, asked for by the server: the gift, who it is for, and what it costs in money and in
 * Zêr, said large, with "Send it" and a plain "Go back" that changes nothing.
 */
function BigGiftConfirm({
  item,
  names,
  details,
  busy,
  note,
  onConfirm,
  onBack,
}: {
  item: GiftCatalogItem;
  names: string[];
  details: GiftConfirmDetails;
  busy: boolean;
  note: string | null;
  onConfirm: () => void;
  onBack: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const value = useZerValue();
  const dir = useDirection();
  return (
    <SheetScrollView contentContainerStyle={[styles.body, styles.confirm]} testID="gift-confirm">
      <ItemArt category={item.category} path={item.assetUrl} width={120} />
      <Text style={[styles.confirmTitle, { color: colors.textPrimary }]} accessibilityRole="header">
        {t('gift.confirm.title')}
      </Text>
      <Text style={[styles.note, styles.center, { color: colors.textSecondary }]}>
        {item.name} · {t('gift.confirm.for', { names: names.join(', ') })}
      </Text>
      <Text style={[styles.confirmMoney, { color: colors.textPrimary }]}>{value(details.total)}</Text>
      <View style={[styles.priceRow, { flexDirection: dir.row }]}>
        <Icon name="coin" size={14} color={colors.gold} />
        <Text style={[styles.price, { color: colors.textPrimary }]}>{t('gift.confirm.zer', { zer: formatNumber(details.total, locale) })}</Text>
      </View>
      <Text style={[styles.note, styles.center, { color: colors.textSecondary }]}>{t('gift.confirm.note')}</Text>
      {note ? (
        <Text style={[styles.note, styles.center, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
          {note}
        </Text>
      ) : null}
      <View style={styles.confirmActions}>
        <ClayButton label={t('gift.confirm.send')} icon="gift" tone="primary" size="large" busy={busy} onPress={onConfirm} />
        <ClayButton label={t('gift.confirm.back')} variant="outline" size="large" disabled={busy} onPress={onBack} />
      </View>
    </SheetScrollView>
  );
}

const TIER_LABEL: Record<'rare' | 'legendary' | 'grand', TranslationKey> = {
  rare: 'gift.tier.rare',
  legendary: 'gift.tier.legendary',
  grand: 'gift.tier.grand',
};

const SKIP_KEY: Record<SentGift['skipped'][number]['reason'], TranslationKey> = {
  already_owned: 'gift.skipped.alreadyOwned',
  not_allowed: 'gift.skipped.notAllowed',
  daily_limit: 'gift.skipped.dailyLimit',
};

/** Why each friend was left out, one line each, by name. */
export function skippedText(
  skipped: SentGift['skipped'],
  recipients: GiftFriend[],
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
): string {
  return skipped
    .map((s) => t(SKIP_KEY[s.reason], { name: recipients.find((r) => r.userId === s.userId)?.name ?? '' }))
    .join('\n');
}

/** Refusals that are the gift rules rather than a failure: asking again would only be refused again. */
const GIFT_RULES = new Set(['NOT_FRIENDS', 'GIFT_TO_SELF', 'POST_NOT_FOUND', 'BAD_RECIPIENTS']);

/** An item that can no longer be given: off sale, priceless, or gone from the shop. */
const GONE = new Set(['ITEM_UNAVAILABLE', 'NOT_GIFTABLE', 'ITEM_NOT_FOUND']);

/**
 * A refusal from the gift routes in the reader's language: the routes answer in English for developers, and anything
 * unforeseen is "the gift didn't go".
 */
export function giftErrorText(error: ApiError, t: (key: TranslationKey, vars?: Record<string, string | number>) => string): string {
  switch (error.code) {
    case 'NOT_FRIENDS':
      return t('gift.picker.onlyFriends');
    case 'POST_NOT_FOUND':
      return t('gift.post.gone');
    case 'INSUFFICIENT_FUNDS':
      return t('gift.picker.cantAfford');
    case 'ITEM_UNAVAILABLE':
    case 'NOT_GIFTABLE':
    case 'ITEM_NOT_FOUND':
      return t('gift.picker.unavailable');
    case 'BAG_EMPTY':
      return t('gift.error.bagEmpty');
    case 'GIFT_OVER_LIMIT': {
      const max = (error.details as { maxPrice?: number } | undefined)?.maxPrice ?? 0;
      return t('gift.error.overLimit', { zer: max });
    }
    case 'GIFT_SPEND_LIMIT': {
      const d = (error.details ?? {}) as { left?: number; by?: string };
      return t(d.by === 'minor_month' ? 'gift.error.monthLimit' : 'gift.error.ownLimit', { zer: d.left ?? 0 });
    }
    default:
      // Offline, the server down, too many tries: said as everywhere else.
      return error.kind === 'client' ? t('gift.picker.failed') : describeError(error, t);
  }
}

const styles = StyleSheet.create({
  // The steps lay out their own gutters: the chips and the gifts scroll edge to edge, under the sheet's header.
  edge: { paddingHorizontal: 0, gap: 0 },
  body: { paddingHorizontal: layout.gutter, paddingBottom: spacing.md, gap: spacing.sm },
  lead: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  note: { fontSize: typography.sizes.text, lineHeight: 20 },
  center: { textAlign: 'center' },
  checkRow: { alignItems: 'center', gap: spacing.md, minHeight: 52, paddingVertical: spacing.xs },
  checkLabel: { flex: 1, fontSize: typography.sizes.text },
  box: { width: 24, height: 24, borderRadius: radii.xs, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: layout.gutter, paddingTop: spacing.sm, gap: spacing.sm },
  spinner: { marginVertical: spacing.xl },
  balance: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: layout.gutter, paddingBottom: spacing.sm },
  balanceLabel: { fontSize: typography.sizes.text },
  chip: { alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: spacing.sm, borderRadius: radii.pill },
  chipText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  gutter: { marginHorizontal: layout.gutter },
  filters: { gap: spacing.sm, paddingBottom: spacing.sm },
  scroll: { paddingBottom: spacing.sm, gap: spacing.xs },
  group: { gap: spacing.sm, marginTop: spacing.sm },
  // Two columns edge to edge with the leftover width as the gap, so both line up with the header.
  grid: { flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.sm, paddingHorizontal: layout.gutter },
  gridInset: { paddingHorizontal: 0 },
  cell: { width: '48.5%', gap: 4 },
  item: { width: '100%', borderRadius: radii.md, borderWidth: 2, padding: spacing.sm, gap: 4, minHeight: 150 },
  bag: { marginHorizontal: layout.gutter, padding: spacing.sm, borderRadius: radii.lg, borderWidth: 1, borderStyle: 'dashed', gap: spacing.sm },
  heading: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  confirm: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm },
  confirmTitle: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, textAlign: 'center' },
  confirmMoney: { ...display(typography.sizes.title), fontVariant: ['tabular-nums'] },
  confirmActions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.sm },
  itemArt: { alignItems: 'center', justifyContent: 'center' },
  itemArtSquare: { height: 72 },
  selected: { alignItems: 'center', gap: spacing.sm, minHeight: 28 },
  freeRow: { justifyContent: 'center' },
  selectedText: { flexShrink: 1, fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  tier: { position: 'absolute', top: 0, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radii.pill },
  tierRight: { right: 0 },
  tierLeft: { left: 0 },
  tierText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  itemName: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  priceRow: { alignItems: 'center', gap: 4 },
  price: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  owned: { fontSize: typography.sizes.text },
  limits: { fontSize: typography.sizes.text },
});
