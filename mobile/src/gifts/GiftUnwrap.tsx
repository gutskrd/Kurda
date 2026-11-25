import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Modal, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Pressable, ReachReset } from '../theme/Pressable';
import {
  GIFT_MOMENT_LOOK,
  GIFT_MOMENT_MS,
  GIFT_REDUCED_MOTION_MS,
  GIFT_UNWRAP_MS,
  giftGlow,
  giftMeaning,
  giftSeed,
  type EquippableCategory,
  type GiftCard,
  type GiftMomentLook,
  type GiftTier,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { assetUrl } from '../api/env';
import { describeError } from '../api/errors';
import { useIntents } from '../api/optimistic';
import type { ApiError } from '../api/types';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useI18n } from '../i18n/I18nContext';
import { DarkScheme, useTheme } from '../theme/ThemeProvider';
import { PALETTES } from '../theme/palette';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { display } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { useDirection } from '../reports/direction';
import { SendErrorNotice } from '../reports/SendError';
import { openGift, wearGift } from './api';
import { giftsSeen, refreshGiftBadge } from '../shop/useUnseenGifts';
import { GiftBox, NightSky } from './art';
import { GiftLight } from './GiftLight';
import { heldDim } from '../theme/MotionParts';
import { ConfettiBurst, GlowRing, useCelebration } from '../theme/CelebrationParts';

/** A gift to unwrap: the recipient's own gift id, the card to show, who sent it. */
export interface UnwrapTarget {
  giftId: string;
  card: GiftCard;
  fromName: string;
}

/** How large the gift stands in its light, by tier: a grand gift the largest. */
const ART: Readonly<Record<GiftTier, number>> = { common: 140, rare: 156, legendary: 156, grand: 172 };

/**
 * The moment a gift is opened (shared gift-moment.ts), the same as on the website: the screen dims to night, the
 * wrapped box waits in the gift's own light for its tier's unwrap time (a tap skips it), then the gift springs out
 * large on its glow as the rays come up behind it and light sparkles drift, under "Gift from Rojda", with its Kurmancî
 * name and meaning and Say thanks, Send one back (a known adult's only, the parent decides) or Close. The tier sets the
 * strength: a gentle glow and short rays for a common gift, brighter rays and sparkles for a rare one, and a grand one
 * keeps its night sky. Everything moves on the native driver; under Reduce Motion the light is there and still.
 *
 * The gift is opened on the server as the moment starts (`POST /gifts/:id/open`); `onOpened` hands back the fresh
 * card for the bubble.
 */
export function GiftUnwrap({
  target,
  onClose,
  onOpened,
  onThanks,
  onSendBack,
}: {
  target: UnwrapTarget;
  onClose: () => void;
  onOpened: (card: GiftCard) => void;
  /**
   * Send the thank-you into the chat; resolves to null when it went, or to the server's refusal, said here since the
   * chat's own notice is behind this.
   */
  onThanks: () => Promise<ApiError | null>;
  /** Open the gift sheet for whoever sent it; left out where nothing can be sent back. */
  onSendBack?: () => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const card = target.card;
  const meaning = giftMeaning(card.sku, locale);
  const look = GIFT_MOMENT_LOOK[card.tier];
  const art = ART[card.tier];
  // The moment is night in either scheme.
  const colors = PALETTES.dark;
  const details = useRef(new Animated.Value(0)).current;
  const [revealed, setRevealed] = useState(false);
  const [equippable, setEquippable] = useState<EquippableCategory | null>(card.equippable);
  const [openError, setOpenError] = useState<string | null>(null);
  const [worn, setWorn] = useState(false);
  const [thanked, setThanked] = useState<'idle' | 'busy' | 'done'>('idle');
  const [actionError, setActionError] = useState<string | null>(null);
  const [thanksError, setThanksError] = useState<ApiError | null>(null);
  const sky = useWindowDimensions();
  // Held in a ref: a parent passing a fresh one on every render must not reopen the gift.
  const opened = useRef(onOpened);
  opened.current = onOpened;

  // Whether it was opened before this moment, read once: the card is replaced by the opened one.
  const openedBefore = useRef(target.card.myOpened);
  // Open it on the server as the moment starts, so "Opened ✓" reaches the sender.
  useEffect(() => {
    let alive = true;
    // An unopened gift leaves the badge at once; a refusal reads the count again.
    if (!openedBefore.current) giftsSeen(1);
    void openGift(client, target.giftId).then((res) => {
      if (!res.ok) refreshGiftBadge();
      if (!alive) return;
      if (res.ok) {
        setEquippable(res.data.equippable);
        opened.current(res.data.card);
      } else {
        setOpenError(describeError(res.error, t));
      }
    });
    return () => {
      alive = false;
    };
  }, [client, target.giftId, t]);

  // The box waits for the tier's unwrap time, or the short fade under Reduce Motion; a tap goes on at once.
  useEffect(() => {
    const wait = setTimeout(() => setRevealed(true), reduce ? GIFT_REDUCED_MOTION_MS : GIFT_UNWRAP_MS[card.tier]);
    return () => clearTimeout(wait);
  }, [card.tier, reduce]);

  useEffect(() => {
    if (!revealed) return;
    const words = Animated.timing(details, {
      toValue: 1,
      duration: reduce ? 0 : GIFT_MOMENT_MS.words,
      delay: reduce ? 0 : GIFT_MOMENT_MS.wordsDelay,
      useNativeDriver: true,
    });
    words.start();
    AccessibilityInfo.announceForAccessibility?.(t('gift.unwrap.announce', { item: card.name, name: target.fromName || t('gift.someone') }));
    return () => words.stop();
  }, [revealed, details, reduce, t, card.name, target.fromName]);

  // Worn at once: it is already yours. A refusal takes it off again and says why.
  const wearing = useIntents<EquippableCategory, boolean>(
    async (category) => {
      const res = await wearGift(client, category, card.sku);
      if (res.ok) setWorn(true);
      return res;
    },
    { failed: (error) => setActionError(describeError(error, t)) },
  );
  const wearShown = equippable ? wearing.shown(equippable, worn) : worn;
  const wear = (): void => {
    if (!equippable || wearShown) return;
    setActionError(null);
    wearing.want(equippable, true, worn);
  };

  const thank = (): void => {
    if (thanked !== 'idle') return;
    setThanked('busy');
    setThanksError(null);
    void onThanks().then((error) => {
      setThanked(error ? 'idle' : 'done');
      setThanksError(error);
    });
  };

  return (
    <Modal visible transparent animationType={reduce ? 'none' : 'fade'} onRequestClose={onClose}>
      <ReachReset>
        <DarkScheme>
          <View style={styles.backdrop}>
            {/* the night's own page colour over whatever was open: the screen dims */}
            <View style={[styles.fill, styles.dim, { backgroundColor: colors.background }]} pointerEvents="none" />
            {look.sky ? (
              <View style={styles.fill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="night-sky">
                <NightSky width={sky.width} height={sky.height} gold={colors.gold} />
              </View>
            ) : null}
            <View style={styles.panel} accessibilityViewIsModal testID={`gift-moment-${card.tier}`}>
              <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
                {target.fromName ? t('gift.from', { name: target.fromName }) : t('gift.fromMember')}
              </Text>
              <Pressable
                onPress={revealed ? undefined : () => setRevealed(true)}
                disabled={revealed}
                // Skip while the box waits; afterwards only a picture, not a nameless button.
                accessible={!revealed}
                accessibilityRole={revealed ? undefined : 'button'}
                accessibilityLabel={revealed ? undefined : t('common.skip')}
                style={styles.stage}
              >
                <GiftLight sku={card.sku} look={look} art={art} lit={revealed} still={reduce}>
                  {revealed ? <Landed card={card} size={art} look={look} gold={colors.gold} /> : <Waiting card={card} size={art * 0.82} still={reduce} gold={colors.gold} />}
                </GiftLight>
              </Pressable>

              {/* Unseen until the gift is out, so out of a screen reader's reach until then too. */}
              <Animated.View
                style={[styles.details, { opacity: details }]}
                pointerEvents={revealed ? 'auto' : 'none'}
                // Both platforms: VoiceOver's elements-hidden and TalkBack's no-hide-descendants.
                aria-hidden={!revealed}
              >
                <Text style={[styles.line, { color: colors.textSecondary }]}>
                  <Text style={[styles.name, { color: colors.textPrimary }]} accessibilityLanguage="ku">
                    {card.name}
                  </Text>
                  {meaning ? ` · ${meaning}` : ''}
                </Text>
                {openError ? (
                  <Text style={[styles.error, dir.text, { color: colors.danger }]} accessibilityRole="alert">
                    {openError}
                  </Text>
                ) : (
                  <View style={styles.actions}>
                    <ClayButton
                      label={thanked === 'done' ? t('gift.unwrap.thanked') : t('gift.unwrap.thanks')}
                      icon={thanked === 'done' ? 'check' : 'heart'}
                      tone="primary"
                      size="large"
                      busy={thanked === 'busy'}
                      disabled={thanked === 'done'}
                      onPress={thank}
                      style={styles.stretch}
                    />
                    {equippable ? (
                      <ClayButton
                        label={wearShown ? t('gift.unwrap.wearing') : t('gift.unwrap.wear')}
                        icon={wearShown ? 'check' : undefined}
                        tone="neutral"
                        variant="outline"
                        size="large"
                        disabled={wearShown}
                        onPress={wear}
                        style={styles.stretch}
                      />
                    ) : null}
                    {onSendBack ? (
                      <ClayButton
                        label={t('gift.sendBack')}
                        icon="gift"
                        tone="neutral"
                        variant="outline"
                        size="large"
                        onPress={() => {
                          onClose();
                          onSendBack();
                        }}
                        style={styles.stretch}
                      />
                    ) : null}
                  </View>
                )}
                {actionError ? (
                  <Text style={[styles.error, { color: colors.danger }]} accessibilityRole="alert">
                    {actionError}
                  </Text>
                ) : null}
                {/* A refused thank-you (a chat mute, the automatic pause) says why here; the way to Account standing closes
                   this first. */}
                <SendErrorNotice error={thanksError} onDismiss={() => setThanksError(null)} onNavigate={onClose} style={styles.notice} />
                <Pressable onPress={onClose} accessibilityRole="button" style={({ pressed }) => [styles.close, pressed && heldDim]}>
                  <Text style={[styles.closeText, { color: colors.textSecondary }]}>{t('social.close')}</Text>
                </Pressable>
              </Animated.View>
            </View>
          </View>
        </DarkScheme>
      </ReachReset>
    </Modal>
  );
}

/** The wrapped box waiting in the light: it wiggles, something is in there; still under Reduce Motion. */
function Waiting({ card, size, still, gold }: { card: GiftCard; size: number; still: boolean; gold: string }): React.JSX.Element {
  const wiggle = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (still) return;
    const run = Animated.loop(Animated.timing(wiggle, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }));
    run.start();
    return () => run.stop();
  }, [still, wiggle]);
  const rotate = wiggle.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 1], outputRange: ['0deg', '-5deg', '4deg', '0deg', '0deg'] });
  return (
    <Animated.View style={still ? undefined : { transform: [{ rotate }] }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <GiftBox size={size} tier={card.tier} gold={gold} />
    </Animated.View>
  );
}

/**
 * The gift out of its box: it springs in on the app's celebration (theme/CelebrationParts.tsx), with the ring widening
 * once and, for a rare or grand gift, flecks of its colour thrown out (shared `BURST`), felt as it lands.
 */
function Landed({ card, size, look, gold }: { card: GiftCard; size: number; look: GiftMomentLook; gold: string }): React.JSX.Element {
  const { colors } = useTheme();
  const moment = useCelebration();
  const glow = giftGlow(card.sku);
  const scale = moment.plan.travel ? moment.art.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) : 1;
  const uri = assetUrl(card.assetUrl);
  return (
    <View style={styles.landed} pointerEvents="none">
      <GlowRing progress={moment.ring} colour={glow} size={size} />
      <ConfettiBurst progress={moment.burst} count={moment.plan.travel ? look.burst : 0} seed={giftSeed(card.sku)} colours={[glow, gold]} reach={size} testID="gift-burst" />
      <Animated.View style={{ opacity: moment.art, transform: [{ scale }] }}>
        {uri ? (
          <Image source={{ uri }} style={{ width: size, height: size }} resizeMode="contain" accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.itemFallback, { width: size, height: size, backgroundColor: colors.controlTrack }]}>
            <Icon name="gift" size={size * 0.5} color={gold} />
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  // most of the way to the night's own page, so the chat behind is still felt
  dim: { opacity: 0.88 },
  panel: { width: '100%', maxWidth: 420, alignItems: 'center', gap: spacing.sm },
  title: { ...display(typography.sizes.title), textAlign: 'center' },
  stage: { alignItems: 'center', justifyContent: 'center' },
  landed: { alignItems: 'center', justifyContent: 'center' },
  itemFallback: { borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center' },
  details: { width: '100%', alignItems: 'center', gap: spacing.sm },
  line: { fontSize: typography.sizes.text, textAlign: 'center' },
  name: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  actions: { width: '100%', maxWidth: 340, gap: spacing.sm, marginTop: spacing.sm },
  // As wide as the buttons above it, in their column.
  notice: { alignSelf: 'stretch', marginHorizontal: 0, marginBottom: 0 },
  stretch: { alignSelf: 'stretch' },
  error: { fontSize: typography.sizes.text, textAlign: 'center' },
  close: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg },
  closeText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
});
