import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  GIFTS_PER_DAY,
  GIFTS_PER_FRIEND_PER_DAY,
  MAX_GIFT_RECIPIENTS,
  type GiftCatalogItem,
  type GiftChatRef,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { assetUrl } from '../api/env';
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
 * everything on sale with a price, its price, your balance, which recipients
 * already own something there is only one of, and what you cannot afford.
 * Send, and the sheet closes on the send animation.
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.flex}>
        <Pressable
          style={[styles.backdrop, { backgroundColor: colors.scrim }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
        />
        <View style={[styles.sheet, { backgroundColor: colors.background }]} accessibilityViewIsModal>
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
            <WhatStep chat={chat} recipients={recipients} onSent={onSent} />
          ) : null}
        </View>
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
}: {
  chat: GiftChatRef;
  recipients: GiftFriend[];
  onSent: (result: SentGift, item: GiftCatalogItem, to: GiftFriend[]) => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const ids = useMemo(() => recipients.map((r) => r.userId), [recipients]);
  const [catalog, setCatalog] = useState<GiftCatalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<GiftCatalogItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<ApiError | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // one key per choice: a retry of the same gift replays it, never pays twice
  const key = useMemo(() => newGiftKey(), [picked?.sku, ids.join(',')]);

  const load = useCallback(() => {
    setLoadError(null);
    void giftCatalog(client, ids).then((res) => {
      if (res.ok) setCatalog(res.data);
      else setLoadError(describeError(res.error, t));
    });
  }, [client, ids, t]);

  useEffect(load, [load]);

  const owners = (item: GiftCatalogItem) => item.alreadyOwnedBy.filter((id) => ids.includes(id));
  const total = picked ? picked.price * (recipients.length - owners(picked).length) : 0;
  const affordable = (item: GiftCatalogItem) =>
    catalog ? catalog.balance[item.currency] >= item.price * Math.max(1, recipients.length - owners(item).length) : false;

  const send = (): void => {
    if (!picked || busy) return;
    setBusy(true);
    setSendError(null);
    setNote(null);
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
      if (res.error.code === 'PRICE_CHANGED') {
        setPicked(null);
        setNote(t('shop.priceChangedBody'));
        load();
        return;
      }
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
      <ScrollView contentContainerStyle={[styles.grid, { flexDirection: dir.row }]}>
        {catalog.items.length === 0 ? (
          <Text style={[styles.note, { color: colors.textSecondary }]}>{t('gift.picker.empty')}</Text>
        ) : null}
        {catalog.items.map((item) => {
          const own = owners(item);
          const everyone = own.length >= recipients.length;
          const canPay = affordable(item);
          const disabled = everyone || !canPay;
          const selected = picked?.sku === item.sku;
          const uri = assetUrl(item.assetUrl);
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
              accessibilityLabel={[item.name, `${item.price} ${item.currency === 'zer' ? 'Zêr' : t('gift.picker.gems')}`, ownedLine, !canPay && !everyone ? t('gift.picker.cantAfford') : null]
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
              <View style={styles.itemArt}>
                {uri ? (
                  <Image source={{ uri }} style={[styles.itemImage, { borderRadius: item.category === 'icon' ? radii.pill : radii.sm }]} />
                ) : (
                  <Icon name="gift" size={34} color={colors.gold} />
                )}
                {item.tier !== 'common' ? (
                  <View style={[styles.tier, { backgroundColor: colors.gold }]}>
                    <Text style={[styles.tierText, { color: colors.textOnPrimary }]}>{t(TIER_LABEL[item.tier])}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.itemName, { color: colors.textPrimary }]} numberOfLines={2}>
                {item.name}
              </Text>
              <View style={styles.priceRow}>
                <Icon name={CURRENCY_ICON[item.currency]} size={14} color={item.currency === 'zer' ? colors.gold : colors.accent} />
                <Text style={[styles.price, { color: colors.textPrimary }]}>{item.price}</Text>
              </View>
              {ownedLine ? <Text style={[styles.owned, { color: colors.textSecondary }]}>{ownedLine}</Text> : null}
              {!canPay && !everyone ? <Text style={[styles.owned, { color: colors.textSecondary }]}>{t('gift.picker.cantAfford')}</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <SendErrorNotice error={sendError} onDismiss={() => setSendError(null)} />
        {note ? (
          <Text style={[styles.note, styles.center, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
            {note}
          </Text>
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

function giftErrorText(error: ApiError, t: (key: TranslationKey) => string): string {
  if (error.code === 'NOT_FRIENDS') return t('gift.picker.onlyFriends');
  if (error.code === 'INSUFFICIENT_FUNDS') return t('gift.picker.cantAfford');
  return describeError(error, t);
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  sheet: { maxHeight: '88%', borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, paddingTop: spacing.sm, paddingBottom: spacing.lg },
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
  grid: { flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  item: { width: '47.5%', borderRadius: radii.md, borderWidth: 2, padding: spacing.sm, gap: 4, minHeight: 150 },
  itemArt: { height: 72, alignItems: 'center', justifyContent: 'center' },
  itemImage: { width: 64, height: 64 },
  tier: { position: 'absolute', top: 0, end: 0, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radii.pill },
  tierText: { fontSize: 10, fontWeight: typography.weights.bold },
  itemName: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  price: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  owned: { fontSize: typography.sizes.xs },
  limits: { fontSize: typography.sizes.xs },
});
