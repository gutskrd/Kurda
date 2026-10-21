import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SheetIn } from '../theme/MotionParts';
import {
  DEFAULT_ITEM_FILTER,
  GIFTS_PER_DAY,
  GIFTS_PER_FRIEND_PER_DAY,
  MAX_GIFT_RECIPIENTS,
  applyItemFilter,
  categoriesIn,
  countByCategory,
  groupByCategory,
  isFiltered,
  itemCategory,
  type GiftCatalogItem,
  type GiftChatRef,
  type ItemCategory,
  type ItemFilter,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useTheme } from '../theme/ThemeProvider';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { display } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { restrictionOf } from '../reports/sendErrors';
import { SendErrorNotice } from '../reports/SendError';
import { useDirection } from '../reports/direction';
import { SHEET_MAX_WIDTH } from '../reports/sheet';
import { EmptyState } from '../theme/EmptyState';
import { KIND_LABEL, kindWithCount, withinBalance } from '../shop/format';
import { ItemArt, KindChips, KindHeading, OptionRow, ResultsLine, SearchField, SortChip, ToggleChip } from '../shop/ItemFilters';
import { giftCatalog, newGiftKey, sendGift, type GiftCatalog, type SentGift } from './api';

/** A friend a gift can go to. */
export interface GiftFriend {
  userId: string;
  name: string;
  avatarUrl?: string | null;
}

/**
 * Choosing a gift — the sheet behind the gift button in a chat.
 *
 * In a direct message the friend is already chosen. In a group it starts with
 * who: only your friends among the members can be given anything (the server's
 * rule too), with "All my friends here" to choose them at once. Then what:
 * everything on sale with a price, by kind as the shop sorts it, with a search,
 * an order, "Within my balance" and "Hide ones they already have"; its price,
 * your balance, which recipients already own something there is only one of,
 * and what you cannot afford. Send, and the sheet closes on the send animation.
 */
export function GiftPickerSheet({
  visible,
  chat,
  friends,
  onClose,
  onSent,
}: {
  visible: boolean;
  chat: GiftChatRef;
  /** DM: the one friend. Group: your friends among the members (may be empty). */
  friends: GiftFriend[];
  onClose: () => void;
  onSent: (result: SentGift, item: GiftCatalogItem, to: GiftFriend[]) => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const group = chat.kind === 'group';
  const [step, setStep] = useState<'who' | 'what'>(group ? 'who' : 'what');
  const [chosen, setChosen] = useState<string[]>(group ? [] : friends.map((f) => f.userId));

  useEffect(() => {
    if (!visible) return;
    setStep(group ? 'who' : 'what');
    setChosen(group ? [] : friends.map((f) => f.userId));
  }, [visible, group, friends]);

  const recipients = friends.filter((f) => chosen.includes(f.userId));
  const title = group ? t('gift.button') : t('gift.picker.titleFor', { name: friends[0]?.name ?? '' });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.flex}>
        <Pressable
          style={[styles.backdrop, { backgroundColor: colors.scrim }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
        />
        <SheetIn style={[styles.sheet, { backgroundColor: colors.background }]} accessibilityViewIsModal>
          <View style={[styles.grabber, { backgroundColor: colors.separator }]} />
          <View style={[styles.header, { flexDirection: dir.row }]}>
            {group && step === 'what' ? (
              <Pressable
                onPress={() => setStep('who')}
                hitSlop={12}
                style={styles.headerBtn}
                accessibilityRole="button"
                accessibilityLabel={t('common.back')}
              >
                <Icon name="chevron-left" size={20} color={colors.textSecondary} style={dir.flip} />
              </Pressable>
            ) : (
              <Icon name="gift" size={20} color={colors.gold} />
            )}
            <Text style={[styles.title, dir.text, { color: colors.textPrimary }]} accessibilityRole="header" numberOfLines={1}>
              {title}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel={t('social.close')}>
              <Icon name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          {step === 'who' ? (
            <WhoStep friends={friends} chosen={chosen} onChange={setChosen} onNext={() => setStep('what')} />
          ) : visible && recipients.length > 0 ? (
            <WhatStep chat={chat} recipients={recipients} onSent={onSent} onClose={onClose} />
          ) : null}
        </SheetIn>
      </View>
    </Modal>
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
      <ScrollView contentContainerStyle={styles.body}>
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
            avatar={<InitialsAvatar name={f.name} id={f.userId} size={32} photoUrl={f.avatarUrl ?? undefined} />}
          />
        ))}
      </ScrollView>
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
      // aria-* as well as the state object: react-native-web reads only these
      accessibilityState={{ checked, disabled }}
      aria-checked={checked}
      aria-disabled={disabled}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.checkRow, { flexDirection: dir.row, opacity: disabled ? 0.45 : pressed ? 0.7 : 1 }]}
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

const CURRENCY_ICON = { zer: 'coin', gems: 'gem' } as const;

function WhatStep({
  chat,
  recipients,
  onSent,
  onClose,
}: {
  chat: GiftChatRef;
  recipients: GiftFriend[];
  onSent: (result: SentGift, item: GiftCatalogItem, to: GiftFriend[]) => void;
  /** the sheet closes before Account standing opens, or it would open underneath */
  onClose: () => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  // keyed on who, not on the array: the parent draws a fresh one on every
  // render (a friend typing is a render a second), and each new array was a
  // new catalog request and a list reshuffling under the finger
  const idKey = recipients.map((r) => r.userId).join(',');
  const ids = useMemo(() => (idKey ? idKey.split(',') : []), [idKey]);
  const [catalog, setCatalog] = useState<GiftCatalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<GiftCatalogItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<ApiError | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // finding one's way through the catalogue: the shop's kinds, search and orders
  const [filter, setFilter] = useState<ItemFilter>(DEFAULT_ITEM_FILTER);
  const [affordableOnly, setAffordableOnly] = useState(false);
  const [hideOwned, setHideOwned] = useState(false);
  // one key per choice: a retry of the same gift replays it, never pays twice
  // (a fresh one only if the server says this key already named another request)
  const [keyRound, setKeyRound] = useState(0);
  const key = useMemo(() => newGiftKey(), [picked?.sku, idKey, keyRound]);

  const load = useCallback(() => {
    setLoadError(null);
    void giftCatalog(client, ids).then((res) => {
      if (res.ok) setCatalog(res.data);
      else setLoadError(giftErrorText(res.error, t));
    });
  }, [client, ids, t]);

  useEffect(load, [load]);

  const owners = useCallback((item: GiftCatalogItem) => item.alreadyOwnedBy.filter((id) => ids.includes(id)), [ids]);
  const total = picked ? picked.price * (recipients.length - owners(picked).length) : 0;
  const affordable = useCallback(
    (item: GiftCatalogItem) =>
      catalog ? withinBalance(item, catalog.balance, Math.max(1, recipients.length - owners(item).length)) : false,
    [catalog, recipients.length, owners],
  );

  const all = useMemo(() => catalog?.items ?? [], [catalog]);
  const kinds = useMemo(() => categoriesIn(all), [all]);
  const category: ItemCategory | 'all' = filter.category === 'all' || kinds.includes(filter.category) ? filter.category : 'all';
  // "hide ones they already have": what every friend it is for owns already
  const keep = useCallback(
    (item: GiftCatalogItem) =>
      (!affordableOnly || affordable(item)) && (!hideOwned || owners(item).length < recipients.length),
    [affordableOnly, affordable, hideOwned, owners, recipients.length],
  );
  const counts = useMemo(() => countByCategory(applyItemFilter(all, { ...filter, category: 'all' }, keep)), [all, filter, keep]);
  const shown = useMemo(() => applyItemFilter(all, { ...filter, category }, keep, locale), [all, filter, category, keep, locale]);
  const groups = useMemo(() => groupByCategory(shown), [shown]);
  const filtered = isFiltered({ ...filter, category }) || affordableOnly || hideOwned;
  const clear = (): void => {
    setFilter(DEFAULT_ITEM_FILTER);
    setAffordableOnly(false);
    setHideOwned(false);
  };
  // a choice the filters have hidden stays chosen, and is named by the Send button
  const pickedHidden = picked !== null && !shown.some((i) => i.sku === picked.sku);
  // a new filter shows its results from the top, not from where the longer list was scrolled to
  const scroller = useRef<ScrollView>(null);
  const filterKey = JSON.stringify([filter, affordableOnly, hideOwned]);
  const lastFilterKey = useRef(filterKey);
  useEffect(() => {
    if (lastFilterKey.current === filterKey) return;
    lastFilterKey.current = filterKey;
    scroller.current?.scrollTo({ y: 0, animated: false });
  }, [filterKey]);

  const send = (): void => {
    if (!picked || busy) return;
    setBusy(true);
    setSendError(null);
    setNote(null);
    // given: felt as it goes; and felt as an error if it did not go
    haptic('tap');
    void sendGift(client, {
      sku: picked.sku,
      toUserIds: ids.filter((id) => !owners(picked).includes(id)),
      chat,
      idempotencyKey: key,
      expectedPrice: picked.price,
    }).then((res) => {
      setBusy(false);
      if (res.ok) {
        if (res.data.sent.length === 0) {
          // nobody could be given it: say why here rather than animate a gift that went nowhere
          setNote(skippedText(res.data.skipped, recipients, t));
          return;
        }
        onSent(res.data, picked, recipients.filter((r) => res.data.sent.includes(r.userId)));
        return;
      }
      haptic('error');
      // what is on offer changed while the sheet was open (a new price, a
      // Newroz item that has gone): say so, and show the catalog as it is now
      const code = res.error.code;
      if (code === 'PRICE_CHANGED' || (code && GONE.has(code))) {
        setPicked(null);
        setNote(code === 'PRICE_CHANGED' ? t('shop.priceChangedBody') : t('gift.picker.unavailable'));
        load();
        return;
      }
      if (code === 'IDEMPOTENCY_REUSED') setKeyRound((n) => n + 1);
      if (restrictionOf(res.error)) setSendError(res.error);
      else setNote(giftErrorText(res.error, t));
    });
  };

  if (loadError) {
    return (
      <View style={styles.body}>
        <Text style={[styles.note, dir.text, { color: colors.danger }]}>{loadError}</Text>
        <ClayButton label={t('common.retry')} onPress={load} />
      </View>
    );
  }
  if (!catalog) return <ActivityIndicator color={colors.primary} style={styles.spinner} />;

  const priceWords = (item: GiftCatalogItem): string => `${item.price} ${item.currency === 'zer' ? 'Zêr' : t('gift.picker.gems')}`;

  const tile = (item: GiftCatalogItem): React.JSX.Element => {
    const own = owners(item);
    const everyone = own.length >= recipients.length;
    const canPay = affordable(item);
    const disabled = everyone || !canPay;
    const selected = picked?.sku === item.sku;
    const wide = itemCategory(item.category) === 'background';
    const ownedLine = everyone
      ? recipients.length > 1
        ? t('gift.picker.allHaveIt')
        : t('gift.picker.hasIt')
      : own.length > 0
        ? t('gift.picker.someHaveIt', { count: own.length })
        : null;
    return (
      <Pressable
        key={item.sku}
        onPress={() => setPicked(item)}
        disabled={disabled}
        accessibilityRole="radio"
        accessibilityState={{ selected, disabled }}
        aria-checked={selected}
        aria-disabled={disabled}
        accessibilityLabel={[item.name, priceWords(item), ownedLine, !canPay && !everyone ? t('gift.picker.cantAfford') : null]
          .filter(Boolean)
          .join(', ')}
        style={({ pressed }) => [
          styles.item,
          {
            backgroundColor: colors.controlTrack,
            borderColor: selected ? colors.gold : 'transparent',
            opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
          },
        ]}
      >
        {/* a background as the 16:9 picture it is; an icon, and the art-less tag, on a square */}
        <View style={[styles.itemArt, wide ? null : styles.itemArtSquare]}>
          <ItemArt category={item.category} path={item.assetUrl} width={wide ? undefined : 64} />
          {item.tier !== 'common' ? (
            <View style={[styles.tier, dir.row === 'row-reverse' ? styles.tierLeft : styles.tierRight, { backgroundColor: colors.gold }]}>
              <Text style={[styles.tierText, { color: colors.textOnPrimary }]}>{t(TIER_LABEL[item.tier])}</Text>
            </View>
          ) : null}
        </View>
        {/* a Kurmancî name, read in its own direction whatever the app is in */}
        <Text style={[styles.itemName, dir.free, { color: colors.textPrimary }]} numberOfLines={2}>
          {item.name}
        </Text>
        <View style={[styles.priceRow, { flexDirection: dir.row }]}>
          <Icon name={CURRENCY_ICON[item.currency]} size={14} color={item.currency === 'zer' ? colors.gold : colors.accent} />
          <Text style={[styles.price, { color: colors.textPrimary }]}>{item.price}</Text>
        </View>
        {ownedLine ? <Text style={[styles.owned, dir.text, { color: colors.textSecondary }]}>{ownedLine}</Text> : null}
        {!canPay && !everyone ? (
          <Text style={[styles.owned, dir.text, { color: colors.textSecondary }]}>{t('gift.picker.cantAfford')}</Text>
        ) : null}
      </Pressable>
    );
  };

  return (
    <>
      <View style={[styles.balance, { flexDirection: dir.row }]} accessibilityLabel={t('gift.picker.balance', { zer: catalog.balance.zer, gems: catalog.balance.gems })}>
        <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>{t('gift.picker.youHave')}</Text>
        <View style={[styles.chip, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]}>
          <Icon name="coin" size={14} color={colors.gold} />
          <Text style={[styles.chipText, { color: colors.textPrimary }]}>{catalog.balance.zer}</Text>
        </View>
        <View style={[styles.chip, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]}>
          <Icon name="gem" size={14} color={colors.accent} />
          <Text style={[styles.chipText, { color: colors.textPrimary }]}>{catalog.balance.gems}</Text>
        </View>
      </View>

      {/* the search and the kinds stay put while the gifts scroll under them */}
      {all.length > 0 ? (
        <View style={styles.filters}>
          <SearchField
            value={filter.query}
            onChange={(query) => setFilter((f) => ({ ...f, query }))}
            label={t('gift.picker.search')}
            style={styles.gutter}
          />
          <KindChips
            options={(['all', ...kinds] as const).map((k) => ({ key: k, label: t(KIND_LABEL[k]), count: counts[k], a11y: kindWithCount(t, k, counts[k]) }))}
            value={category}
            onChange={(next) => setFilter((f) => ({ ...f, category: next }))}
            label={t('shop.kind.label')}
            inset={spacing.lg}
          />
        </View>
      ) : null}

      <ScrollView ref={scroller} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {all.length === 0 ? (
          <Text style={[styles.note, styles.gutter, dir.text, { color: colors.textSecondary }]}>{t('gift.picker.empty')}</Text>
        ) : (
          <>
            <OptionRow inset={spacing.lg}>
              <SortChip value={filter.sort} onChange={(sort) => setFilter((f) => ({ ...f, sort }))} />
              <ToggleChip label={t('shop.filter.withinBalance')} value={affordableOnly} onChange={setAffordableOnly} />
              <ToggleChip label={t('gift.picker.hideOwned')} value={hideOwned} onChange={setHideOwned} />
            </OptionRow>
            {/* the All chip says how many there are; narrowed, the count and the way back are worth a line of the sheet */}
            {filtered && shown.length > 0 ? (
              <View style={styles.gutter}>
                <ResultsLine count={shown.length} onClear={clear} />
              </View>
            ) : null}
            {shown.length === 0 ? (
              <EmptyState title={t('shop.noMatches.title')} body={t('shop.noMatches.body')} action={{ label: t('shop.filter.clear'), onPress: clear }} />
            ) : (
              groups.map((group) => (
                <View key={group.category} style={styles.group}>
                  {/* under All, each kind under its own heading; one kind needs none, its chip says it */}
                  {category === 'all' ? <KindHeading kind={group.category} count={group.items.length} style={styles.gutter} /> : null}
                  <View style={[styles.grid, { flexDirection: dir.row }]}>{group.items.map(tile)}</View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <SendErrorNotice error={sendError} onDismiss={() => setSendError(null)} onNavigate={onClose} />
        {note ? (
          <Text style={[styles.note, styles.center, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
            {note}
          </Text>
        ) : null}
        {picked && pickedHidden ? (
          <View style={[styles.selected, { flexDirection: dir.row }]} accessible accessibilityLabel={`${t('gift.picker.selected', { name: picked.name })}, ${priceWords(picked)}`}>
            <ItemArt category={picked.category} path={picked.assetUrl} width={itemCategory(picked.category) === 'background' ? 40 : 24} />
            <Text style={[styles.selectedText, { color: colors.textPrimary }]} numberOfLines={1}>
              {t('gift.picker.selected', { name: picked.name })}
            </Text>
            <Icon name={CURRENCY_ICON[picked.currency]} size={14} color={picked.currency === 'zer' ? colors.gold : colors.accent} />
            <Text style={[styles.price, { color: colors.textPrimary }]}>{picked.price}</Text>
          </View>
        ) : null}
        <Text style={[styles.limits, styles.center, { color: colors.textSecondary }]}>
          {t('gift.picker.limits', { perDay: GIFTS_PER_DAY, perFriend: GIFTS_PER_FRIEND_PER_DAY })}
        </Text>
        <ClayButton
          label={
            picked
              ? recipients.length > 1
                ? t('gift.picker.sendTotal', { total, currency: picked.currency === 'zer' ? 'Zêr' : t('gift.picker.gems') })
                : t('gift.picker.send')
              : t('gift.picker.pick')
          }
          icon="gift"
          tone="primary"
          size="large"
          busy={busy}
          disabled={!picked}
          onPress={send}
        />
      </View>
    </>
  );
}

const TIER_LABEL: Record<'rare' | 'legendary', TranslationKey> = {
  rare: 'gift.tier.rare',
  legendary: 'gift.tier.legendary',
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

/** An item that can no longer be given: off sale, priceless, or gone from the shop. */
const GONE = new Set(['ITEM_UNAVAILABLE', 'NOT_GIFTABLE', 'ITEM_NOT_FOUND']);

/**
 * A refusal from the gift routes in the reader's language. The routes answer
 * in English for developers; a child reading Soranî gets a sentence of their
 * own, and anything unforeseen the server says is "the gift didn't go".
 */
export function giftErrorText(error: ApiError, t: (key: TranslationKey) => string): string {
  switch (error.code) {
    case 'NOT_FRIENDS':
      return t('gift.picker.onlyFriends');
    case 'INSUFFICIENT_FUNDS':
      return t('gift.picker.cantAfford');
    case 'ITEM_UNAVAILABLE':
    case 'NOT_GIFTABLE':
    case 'ITEM_NOT_FOUND':
      return t('gift.picker.unavailable');
    default:
      // offline, the server down, too many tries: said as everywhere else
      return error.kind === 'client' ? t('gift.picker.failed') : describeError(error, t);
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  sheet: {
    width: '100%',
    maxWidth: SHEET_MAX_WIDTH,
    alignSelf: 'center',
    maxHeight: '88%',
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: radii.pill, marginBottom: spacing.sm },
  header: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  headerBtn: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center', marginHorizontal: -spacing.sm },
  title: { ...display(typography.sizes.lg), flex: 1 },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm },
  lead: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold },
  note: { fontSize: typography.sizes.sm, lineHeight: 20 },
  center: { textAlign: 'center' },
  checkRow: { alignItems: 'center', gap: spacing.md, minHeight: 52, paddingVertical: spacing.xs },
  checkLabel: { flex: 1, fontSize: typography.sizes.md },
  box: { width: 24, height: 24, borderRadius: radii.xs, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  spinner: { marginVertical: spacing.xl },
  balance: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  balanceLabel: { fontSize: typography.sizes.sm },
  chip: { alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: spacing.sm, borderRadius: radii.pill },
  chipText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  gutter: { marginHorizontal: spacing.lg },
  filters: { gap: spacing.sm, paddingBottom: spacing.sm },
  scroll: { paddingBottom: spacing.sm, gap: spacing.xs },
  group: { gap: spacing.sm, marginTop: spacing.sm },
  // two columns edge to edge: the gap between them is what is left over, so both line up with the header
  grid: { flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.sm, paddingHorizontal: spacing.lg },
  item: { width: '48.5%', borderRadius: radii.md, borderWidth: 2, padding: spacing.sm, gap: 4, minHeight: 150 },
  itemArt: { alignItems: 'center', justifyContent: 'center' },
  itemArtSquare: { height: 72 },
  selected: { alignItems: 'center', gap: spacing.sm, minHeight: 28 },
  selectedText: { flexShrink: 1, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  tier: { position: 'absolute', top: 0, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radii.pill },
  tierRight: { right: 0 },
  tierLeft: { left: 0 },
  tierText: { fontSize: 10, fontWeight: typography.weights.bold },
  itemName: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  priceRow: { alignItems: 'center', gap: 4 },
  price: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  owned: { fontSize: typography.sizes.xs },
  limits: { fontSize: typography.sizes.xs },
});
