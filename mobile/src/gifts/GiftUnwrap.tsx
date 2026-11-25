import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Modal,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Pressable, ReachReset } from '../theme/Pressable';
import { giftMeaning, type EquippableCategory, type GiftCard } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { assetUrl } from '../api/env';
import { describeError } from '../api/errors';
import { useIntents } from '../api/optimistic';
import type { ApiError } from '../api/types';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { DarkScheme, useTheme } from '../theme/ThemeProvider';
import { PALETTES } from '../theme/palette';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { display } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { useDirection } from '../reports/direction';
import { SHEET_MAX_WIDTH } from '../reports/sheet';
import { SendErrorNotice } from '../reports/SendError';
import { openGift, wearGift } from './api';
import { giftsSeen, refreshGiftBadge } from '../shop/useUnseenGifts';
import { GiftBox, NewrozFlame, NightSky, Seed, Spark } from './art';
import { unwrapPlan, type Particle } from './motion';
import { heldDim } from '../theme/MotionParts';

/** A gift to unwrap: the recipient's own gift id, the card to show, who sent it. */
export interface UnwrapTarget {
  giftId: string;
  card: GiftCard;
  fromName: string;
}

/**
 * Unwrapping a present, sized by the gift's tier (shared `GIFT_UNWRAP_MS`): a common gift bursts in a small card, a
 * rare one rises in a sheet throwing pomegranate seeds, a legendary one takes the whole screen with the Newroz flame,
 * and a grand one (the moon, the sun, the galaxy) turns the whole screen to a night sky as it rises. A tap skips it;
 * under Reduce Motion it is a short fade to the item, the sky standing still. A haptic plays once as the lid comes off
 * (or at the skip). It runs on the native driver with one progress value, so a busy JS thread cannot make it stutter.
 *
 * Then the item with its Kurmancî name and what it means, who it is from, and Wear it, Say thanks (sent by the parent),
 * Send one back (the gift sheet for the sender, opening on the bag) or Close. The gift is opened on the server as the
 * animation starts (`POST /gifts/:id/open`); `onOpened` hands back the fresh card for the bubble.
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
  const theme = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const card = target.card;
  const meaning = giftMeaning(card.sku, locale);
  const plan = useMemo(() => unwrapPlan(card.tier, reduce), [card.tier, reduce]);
  // The full-screen moment is staged on night-dark in either scheme.
  const full = plan.stage === 'full';
  const colors = full ? PALETTES.dark : theme.colors;
  const progress = useRef(new Animated.Value(0)).current;
  const details = useRef(new Animated.Value(0)).current;
  const [revealed, setRevealed] = useState(false);
  const [equippable, setEquippable] = useState<EquippableCategory | null>(card.equippable);
  const [openError, setOpenError] = useState<string | null>(null);
  const [worn, setWorn] = useState(false);
  const [thanked, setThanked] = useState<'idle' | 'busy' | 'done'>('idle');
  const [actionError, setActionError] = useState<string | null>(null);
  const [thanksError, setThanksError] = useState<ApiError | null>(null);
  const tick = useRef<ReturnType<typeof setTimeout> | null>(null);
  const felt = useRef(false);
  const feel = (): void => {
    if (felt.current) return;
    felt.current = true;
    haptic('celebrate');
  };
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

  const reveal = (): void => {
    if (tick.current) clearTimeout(tick.current);
    feel();
    progress.stopAnimation();
    progress.setValue(1);
    setRevealed(true);
  };

  useEffect(() => {
    const run = Animated.timing(progress, {
      toValue: 1,
      duration: plan.durationMs,
      easing: reduce ? Easing.linear : Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    run.start(({ finished }) => {
      if (finished) setRevealed(true);
    });
    tick.current = setTimeout(feel, plan.durationMs * plan.popAt);
    return () => {
      run.stop();
      if (tick.current) clearTimeout(tick.current);
    };
  }, [plan, progress, reduce]);

  useEffect(() => {
    if (!revealed) return;
    Animated.timing(details, { toValue: 1, duration: reduce ? 0 : 220, useNativeDriver: true }).start();
    AccessibilityInfo.announceForAccessibility?.(
      t('gift.unwrap.announce', { item: card.name, name: target.fromName || t('gift.someone') }),
    );
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

  const art = full ? 220 : plan.stage === 'sheet' ? 180 : 140;
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);

  const content = (
    <View
      style={[
        styles.backdrop,
        plan.stage === 'sheet' && styles.backdropSheet,
        { backgroundColor: full ? colors.background : colors.scrim },
      ]}
    >
      <View
        style={[
          plan.stage === 'card' ? styles.card : plan.stage === 'sheet' ? styles.sheet : styles.fullStage,
          !full && { backgroundColor: colors.background },
        ]}
        accessibilityViewIsModal
        onLayout={plan.sky ? (e) => setStageSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height }) : undefined}
      >
        {plan.sky && stageSize ? (
          <View style={styles.sky} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="night-sky">
            <NightSky width={stageSize.width} height={stageSize.height} gold={colors.gold} />
          </View>
        ) : null}
        <Pressable
          onPress={revealed ? undefined : reveal}
          disabled={revealed}
          // Skip while it plays; afterwards only a picture, not a nameless button.
          accessible={!revealed}
          accessibilityRole={revealed ? undefined : 'button'}
          accessibilityLabel={revealed ? undefined : t('common.skip')}
          style={[styles.stage, { height: art + spacing.xl }]}
        >
          {plan.flame ? <Flame progress={progress} size={art * 1.25} item={art * 0.62} gold={colors.gold} /> : null}
          {plan.particles.map((p, i) => (
            <Burst key={i} particle={p} progress={progress} popAt={plan.popAt} gold={colors.gold} />
          ))}
          {reduce ? null : <Box progress={progress} size={art * 0.8} card={card} gold={colors.gold} />}
          <ItemArt card={card} size={art * 0.62} progress={progress} reduce={reduce} gold={colors.gold} />
        </Pressable>

        {/* Unseen until the reveal, so out of a screen reader's reach until then too. */}
        <Animated.View
          style={[styles.details, { opacity: details }]}
          pointerEvents={revealed ? 'auto' : 'none'}
          // Both platforms: VoiceOver's elements-hidden and TalkBack's no-hide-descendants.
          aria-hidden={!revealed}
        >
          <Text style={[styles.name, { color: colors.textPrimary }]} accessibilityRole="header" accessibilityLanguage={meaning ? 'ku' : undefined}>
            {card.name}
          </Text>
          {meaning ? <Text style={[styles.from, { color: colors.textSecondary }]}>{meaning}</Text> : null}
          {/* Unnamed when the viewer may not see who sent it (blocked, closed, or hidden from them). */}
          <Text style={[styles.from, { color: colors.textSecondary }]}>{target.fromName ? t('gift.from', { name: target.fromName }) : t('gift.fromMember')}</Text>
          {openError ? (
            <Text style={[styles.error, dir.text, { color: colors.danger }]} accessibilityRole="alert">
              {openError}
            </Text>
          ) : (
            <View style={styles.actions}>
              {equippable ? (
                <ClayButton
                  label={wearShown ? t('gift.unwrap.wearing') : t('gift.unwrap.wear')}
                  icon={wearShown ? 'check' : undefined}
                  tone="primary"
                  size="large"
                  disabled={wearShown}
                  onPress={wear}
                  style={styles.stretch}
                />
              ) : null}
              <ClayButton
                label={thanked === 'done' ? t('gift.unwrap.thanked') : t('gift.unwrap.thanks')}
                icon={thanked === 'done' ? 'check' : 'heart'}
                tone={equippable ? 'neutral' : 'primary'}
                variant={equippable ? 'outline' : 'solid'}
                size="large"
                busy={thanked === 'busy'}
                disabled={thanked === 'done'}
                onPress={thank}
                style={styles.stretch}
              />
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
  );

  return (
    <Modal visible transparent animationType={reduce ? 'none' : 'fade'} onRequestClose={onClose}>
      <ReachReset>
        {full ? <DarkScheme>{content}</DarkScheme> : content}
      </ReachReset>
    </Modal>
  );
}

/** The wrapped box: it wobbles, its lid lifts away, and it fades as the item rises out of it. */
function Box({
  progress,
  size,
  card,
  gold,
}: {
  progress: Animated.Value;
  size: number;
  card: GiftCard;
  gold: string;
}): React.JSX.Element {
  const scale = progress.interpolate({ inputRange: [0, 0.15, 0.3, 0.4], outputRange: [0.6, 1.08, 0.97, 1], extrapolate: 'clamp' });
  const wobble = progress.interpolate({
    inputRange: [0, 0.1, 0.2, 0.3, 0.4],
    outputRange: ['0deg', '-8deg', '7deg', '-4deg', '0deg'],
    extrapolate: 'clamp',
  });
  const lidY = progress.interpolate({ inputRange: [0.38, 0.6], outputRange: [0, -size * 0.7], extrapolate: 'clamp' });
  const lidTurn = progress.interpolate({ inputRange: [0.38, 0.6], outputRange: ['0deg', '-25deg'], extrapolate: 'clamp' });
  const lidFade = progress.interpolate({ inputRange: [0.5, 0.65], outputRange: [1, 0], extrapolate: 'clamp' });
  const bodyFade = progress.interpolate({ inputRange: [0.55, 0.75], outputRange: [1, 0], extrapolate: 'clamp' });
  return (
    <Animated.View
      style={[styles.layer, { transform: [{ scale }, { rotate: wobble }] }]}
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Animated.View style={[styles.layer, { opacity: bodyFade }]}>
        <GiftBox size={size} tier={card.tier} gold={gold} part="body" />
      </Animated.View>
      <Animated.View style={[styles.layer, { opacity: lidFade, transform: [{ translateY: lidY }, { rotate: lidTurn }] }]}>
        <GiftBox size={size} tier={card.tier} gold={gold} part="lid" />
      </Animated.View>
    </Animated.View>
  );
}

/** One seed or spark thrown out as the lid comes off, and falling away. */
function Burst({
  particle,
  progress,
  popAt,
  gold,
}: {
  particle: Particle;
  progress: Animated.Value;
  popAt: number;
  gold: string;
}): React.JSX.Element {
  const start = popAt + particle.delay;
  const x = progress.interpolate({ inputRange: [start, 1], outputRange: [0, particle.dx], extrapolate: 'clamp' });
  const y = progress.interpolate({
    inputRange: [start, (start + 1) / 2, 1],
    outputRange: [0, particle.dy, particle.dy + 40],
    extrapolate: 'clamp',
  });
  const opacity = progress.interpolate({
    inputRange: [start, start + 0.04, 0.85, 1],
    outputRange: [0, 1, 1, 0],
    extrapolate: 'clamp',
  });
  const rotate = progress.interpolate({ inputRange: [start, 1], outputRange: ['0deg', `${particle.spin}deg`], extrapolate: 'clamp' });
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.layer, { opacity, transform: [{ translateX: x }, { translateY: y }, { rotate }] }]}
    >
      {particle.kind === 'seed' ? <Seed size={particle.size} /> : <Spark size={particle.size} gold={gold} />}
    </Animated.View>
  );
}

/**
 * The Newroz fire rising behind the item, its base level with the item's so the item stands in front of it, settling to
 * a glow once the item is out.
 */
function Flame({
  progress,
  size,
  item,
  gold,
}: {
  progress: Animated.Value;
  size: number;
  item: number;
  gold: string;
}): React.JSX.Element {
  const opacity = progress.interpolate({ inputRange: [0.3, 0.5, 1], outputRange: [0, 0.95, 0.8], extrapolate: 'clamp' });
  const scale = progress.interpolate({ inputRange: [0.3, 0.6], outputRange: [0.6, 1], extrapolate: 'clamp' });
  const lift = -(size - item) / 2;
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.layer, { opacity, transform: [{ translateY: lift }, { scale }] }]}
    >
      <NewrozFlame size={size} gold={gold} />
    </Animated.View>
  );
}

/** What was inside: the item's own art, or a gift glyph when it has none to show. */
function ItemArt({
  card,
  size,
  progress,
  reduce,
  gold,
}: {
  card: GiftCard;
  size: number;
  progress: Animated.Value;
  reduce: boolean;
  gold: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const opacity = reduce ? progress : progress.interpolate({ inputRange: [0.5, 0.75], outputRange: [0, 1], extrapolate: 'clamp' });
  const scale = reduce
    ? 1
    : progress.interpolate({ inputRange: [0.5, 0.85, 1], outputRange: [0.4, 1.08, 1], extrapolate: 'clamp' });
  const uri = assetUrl(card.assetUrl);
  return (
    <Animated.View style={[styles.layer, { opacity, transform: [{ scale }] }]} pointerEvents="none">
      {uri ? (
        <Image
          source={{ uri }}
          style={[styles.itemImage, { width: size, height: size, borderRadius: card.category === 'icon' ? radii.pill : radii.lg }]}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={[styles.itemFallback, { width: size, height: size, backgroundColor: colors.controlTrack }]}>
          <Icon name="gift" size={size * 0.5} color={gold} />
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  backdropSheet: { justifyContent: 'flex-end', padding: 0 },
  card: { width: '100%', maxWidth: 340, borderRadius: radii.xl, padding: spacing.lg, alignItems: 'center' },
  sheet: {
    width: '100%',
    maxWidth: SHEET_MAX_WIDTH,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    alignItems: 'center',
  },
  fullStage: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  sky: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  stage: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  layer: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  itemImage: {},
  itemFallback: { borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center' },
  details: { width: '100%', alignItems: 'center', gap: spacing.sm, maxWidth: 420 },
  name: { ...display(typography.sizes.title), textAlign: 'center' },
  from: { fontSize: typography.sizes.text, textAlign: 'center' },
  actions: { width: '100%', gap: spacing.sm, marginTop: spacing.sm },
  // As wide as the buttons above it, in their column.
  notice: { alignSelf: 'stretch', marginHorizontal: 0, marginBottom: 0 },
  stretch: { alignSelf: 'stretch' },
  error: { fontSize: typography.sizes.text, textAlign: 'center' },
  close: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg },
  closeText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
});
