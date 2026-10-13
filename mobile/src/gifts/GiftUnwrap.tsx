import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import type { EquippableCategory, GiftCard } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { assetUrl } from '../api/env';
import { describeError } from '../api/errors';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useI18n } from '../i18n/I18nContext';
import { DarkScheme, useTheme } from '../theme/ThemeProvider';
import { PALETTES } from '../theme/palette';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { display } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { useDirection } from '../reports/direction';
import { SHEET_MAX_WIDTH } from '../reports/sheet';
import { openGift, wearGift } from './api';
import { GiftBox, NewrozFlame, Seed, Spark } from './art';
import { unwrapPlan, type Particle } from './motion';

/** A gift to unwrap: the recipient's own gift id, the card to show, who sent it. */
export interface UnwrapTarget {
  giftId: string;
  card: GiftCard;
  fromName: string;
}

/** A light tick as the lid comes off — 15 ms, the lightest the platforms give. */
const HAPTIC_MS = 15;

/**
 * Unwrapping a present.
 *
 * Sized by the gift's tier (shared `GIFT_UNWRAP_MS`): a common gift bursts in
 * a small card at the bubble's scale, a rare one rises in a sheet with
 * pomegranate seeds thrown out of it, a legendary one takes the whole screen
 * with the Newroz flame behind it. Every one can be skipped with a tap; with
 * Reduce Motion it is a short fade to the item and nothing moves. A light
 * haptic tick marks the lid coming off (skipped with the rest).
 *
 * It runs on the native driver — one progress value, transforms and opacity
 * only — so a busy JS thread cannot make it stutter.
 *
 * Then the item, who it is from, and what you can do: **Wear it** (a
 * background or an icon, put on at once), **Say thanks** (the parent sends it
 * into the chat), **Close**. The gift is opened on the server as the animation
 * starts (`POST /gifts/:id/open`); `onOpened` hands back the fresh card so the
 * bubble shows it opened, and the sender's bubble learns it from the server.
 */
export function GiftUnwrap({
  target,
  onClose,
  onOpened,
  onThanks,
}: {
  target: UnwrapTarget;
  onClose: () => void;
  onOpened: (card: GiftCard) => void;
  /** send the thank-you into the chat; resolves to whether it went */
  onThanks: () => Promise<boolean>;
}): React.JSX.Element {
  const { client } = useAuth();
  const theme = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const card = target.card;
  const plan = useMemo(() => unwrapPlan(card.tier, reduce), [card.tier, reduce]);
  // the full-screen moment is staged on night-dark in either scheme
  const full = plan.stage === 'full';
  const colors = full ? PALETTES.dark : theme.colors;
  const progress = useRef(new Animated.Value(0)).current;
  const details = useRef(new Animated.Value(0)).current;
  const [revealed, setRevealed] = useState(false);
  const [equippable, setEquippable] = useState<EquippableCategory | null>(card.equippable);
  const [openError, setOpenError] = useState<string | null>(null);
  const [worn, setWorn] = useState<'idle' | 'busy' | 'done'>('idle');
  const [thanked, setThanked] = useState<'idle' | 'busy' | 'done'>('idle');
  const [actionError, setActionError] = useState<string | null>(null);
  const tick = useRef<ReturnType<typeof setTimeout> | null>(null);
  // held in a ref: a parent passing a fresh one on every render must not reopen the gift
  const opened = useRef(onOpened);
  opened.current = onOpened;

  // open it on the server as the moment starts, so "Opened ✓" reaches the sender
  useEffect(() => {
    let alive = true;
    void openGift(client, target.giftId).then((res) => {
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
    tick.current = setTimeout(() => Vibration.vibrate(HAPTIC_MS), plan.durationMs * plan.popAt);
    return () => {
      run.stop();
      if (tick.current) clearTimeout(tick.current);
    };
  }, [plan, progress, reduce]);

  useEffect(() => {
    if (!revealed) return;
    Animated.timing(details, { toValue: 1, duration: reduce ? 0 : 220, useNativeDriver: true }).start();
    AccessibilityInfo.announceForAccessibility?.(
      target.fromName ? t('gift.unwrap.announce', { item: card.name, name: target.fromName }) : card.name,
    );
  }, [revealed, details, reduce, t, card.name, target.fromName]);

  const wear = (): void => {
    if (!equippable || worn !== 'idle') return;
    setWorn('busy');
    setActionError(null);
    void wearGift(client, equippable, card.sku).then((res) => {
      if (res.ok) setWorn('done');
      else {
        setWorn('idle');
        setActionError(describeError(res.error, t));
      }
    });
  };

  const thank = (): void => {
    if (thanked !== 'idle') return;
    setThanked('busy');
    void onThanks().then((ok) => setThanked(ok ? 'done' : 'idle'));
  };

  const art = full ? 220 : plan.stage === 'sheet' ? 180 : 140;

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
      >
        <Pressable
          onPress={revealed ? undefined : reveal}
          disabled={revealed}
          accessibilityRole="button"
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

        <Animated.View style={[styles.details, { opacity: details }]} pointerEvents={revealed ? 'auto' : 'none'}>
          <Text style={[styles.name, { color: colors.textPrimary }]} accessibilityRole="header">
            {card.name}
          </Text>
          {/* unnamed only when the gift is older than the messages loaded, and its sender unknown here */}
          {target.fromName ? (
            <Text style={[styles.from, { color: colors.textSecondary }]}>{t('gift.unwrap.from', { name: target.fromName })}</Text>
          ) : null}
          {openError ? (
            <Text style={[styles.error, dir.text, { color: colors.danger }]} accessibilityRole="alert">
              {openError}
            </Text>
          ) : (
            <View style={styles.actions}>
              {equippable ? (
                <ClayButton
                  label={worn === 'done' ? t('gift.unwrap.wearing') : t('gift.unwrap.wear')}
                  icon={worn === 'done' ? 'check' : undefined}
                  tone="primary"
                  size="large"
                  busy={worn === 'busy'}
                  disabled={worn === 'done'}
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
            </View>
          )}
          {actionError ? (
            <Text style={[styles.error, { color: colors.danger }]} accessibilityRole="alert">
              {actionError}
            </Text>
          ) : null}
          <Pressable onPress={onClose} accessibilityRole="button" style={styles.close}>
            <Text style={[styles.closeText, { color: colors.textSecondary }]}>{t('social.close')}</Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );

  return (
    <Modal visible transparent animationType={reduce ? 'none' : 'fade'} onRequestClose={onClose}>
      {full ? <DarkScheme>{content}</DarkScheme> : content}
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
 * The Newroz fire, rising behind the item: its base sits level with the
 * item's, so the item stands in front of the fire rather than inside it, and
 * it settles to a glow once the item is out.
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
  stage: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  layer: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  itemImage: {},
  itemFallback: { borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center' },
  details: { width: '100%', alignItems: 'center', gap: spacing.sm, maxWidth: 420 },
  name: { ...display(typography.sizes.xl), textAlign: 'center' },
  from: { fontSize: typography.sizes.md, textAlign: 'center' },
  actions: { width: '100%', gap: spacing.sm, marginTop: spacing.sm },
  stretch: { alignSelf: 'stretch' },
  error: { fontSize: typography.sizes.sm, textAlign: 'center' },
  close: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg },
  closeText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
});
