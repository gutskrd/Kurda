import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Share, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Pressable } from '../theme/Pressable';
import * as Clipboard from 'expo-clipboard';
import { buildJoinLink, formatJoinCode, type PlayGame } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useMotionAlive } from '../a11y/useMotionAlive';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { springTo, timing, usePressScale } from '../theme/animate';
import { display, sectionLabel } from '../theme/fonts';
import { ClayButton, GlassCard } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { HeartBurst } from '../theme/MotionParts';
import { LIP, SHINE } from '../theme/Tile';
import type { TileTone } from '../theme/tileTones';
import { pressedDim } from '../theme/motion';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { useAnnouncer } from '../stories/ui';
import { InviteSheet } from './InviteSheet';
import { GAME_NAME_KEY } from './labels';
import { codePath, codeTone, shareMessage, spelledCode } from './joinCode';
import { TicketTear } from './Ticket';

/**
 * A lobby's join code as a ticket, the way in for anyone the host tells in person or elsewhere ("Invite friends"
 * beside it is for friends on Hevalo). Six tiles in the game's colour, split as read aloud ("ABC 234") and large
 * enough to read across a table. Tapping the code or Copy copies it; Share sends a message saying where to type it.
 *
 * The tiles flip in one after another on first show, then a shine crosses them every few seconds while the screen
 * is in front (useMotionAlive). Under Reduce Motion the ticket simply appears, and a copy only changes colour. The
 * code always reads left to right; the words round it follow the language. Its tear line and notches match every
 * invitation ticket (Ticket.tsx).
 */
export function CodeTicket({
  game,
  code,
  note,
  storyTitle,
  children,
}: {
  game: PlayGame;
  code: string;
  /** Who may use this code, where the game's settings decide it (a story game's access). */
  note?: string;
  /** A story game is shared by its story's title rather than the game's name. */
  storyTitle?: string;
  /** Content under the code's own actions: Invite friends. */
  children?: ReactNode;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, rtl } = useI18n();
  const { user } = useAuth();
  const dir = useDirection();
  const { announce, region } = useAnnouncer();
  const [copied, setCopied] = useState(false);
  const [fired, setFired] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = (): void => {
    void Clipboard.setStringAsync(code).catch(() => undefined);
    haptic('tap');
    announce(t('play.code.copiedAnnounce'));
    setCopied(true);
    setFired((n) => n + 1);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  const share = (): void => {
    // The code as a link too, naming the sender, so someone not yet a friend can ask to be one.
    const link = buildJoinLink(game, code, { from: user?.id });
    const message = shareMessage({ game: t(GAME_NAME_KEY[game]), code, storyTitle, link }, t, rtl, formatJoinCode);
    // Dismissing the sheet is not a failure.
    void Share.share({ message }).catch(() => undefined);
  };

  const words = { writingDirection: rtl ? 'rtl' : 'ltr', textAlign: 'center' } as const;
  return (
    <GlassCard>
      <View style={styles.top}>
        <View style={[styles.heading, { flexDirection: dir.row }]}>
          <Icon name="ticket" size={16} color={codeTone(colors, game).face} />
          <Text style={[sectionLabel, { color: colors.textSecondary }]} accessibilityRole="header">
            {t('stories.lobby.code')}
          </Text>
        </View>
        <CodeTiles game={game} code={code} onPress={copy} />
      </View>
      <TicketTear />
      <View style={styles.bottom}>
        <View style={[styles.actions, { flexDirection: dir.row }]}>
          <CopyButton copied={copied} fired={fired} onPress={copy} />
          <ClayButton label={t('share.title')} icon="share" onPress={share} style={styles.action} />
        </View>
        {note ? <Text style={[styles.note, words, { color: colors.textPrimary }]}>{note}</Text> : null}
        <Text style={[styles.hint, words, { color: colors.textSecondary }]}>{t('play.code.hint', { path: codePath(t, rtl) })}</Text>
        {children}
      </View>
      {region}
    </GlassCard>
  );
}

/** How long Copy reads "Copied" before reverting. */
const COPIED_MS = 1800;

/** The gap between tiles, and the wider gap where the code splits when read aloud. */
const GAP = 6;
const SPLIT = 14;
const MAX_TILE = 54;
const MIN_TILE = 34;
/** Tiles are a little taller than wide, like letters on a board. */
const TALL = 1.2;

/** The delay between one tile's arrival and the next. */
const ARRIVE_STAGGER_MS = 55;
/** How often the shine crosses the tiles, and how long it takes. */
const GLINT_EVERY_MS = 4200;
const GLINT_MS = 900;

/** As wide as the ticket allows, within what still reads as a tile. */
function tileSizeFor(width: number): number {
  return Math.max(MIN_TILE, Math.min(MAX_TILE, Math.floor((width - GAP * 4 - SPLIT) / 6)));
}

/** Tile `i`'s left edge within the row. */
function tileX(i: number, size: number): number {
  return i < 3 ? i * (size + GAP) : 3 * size + 2 * GAP + SPLIT + (i - 3) * (size + GAP);
}

/** The six tiles, tappable as one: spelled out to screen readers, copied on a tap. */
function CodeTiles({ game, code, onPress }: { game: PlayGame; code: string; onPress: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const alive = useMotionAlive();
  const [width, setWidth] = useState(0);
  const size = width > 0 ? tileSizeFor(width) : MAX_TILE;
  const rowWidth = tileX(5, size) + size;
  const tone = codeTone(colors, game);
  const chars = code.split('');

  // One value per tile, 0 to 1 as it arrives; played once, on first show.
  const arrive = useRef(chars.map(() => new Animated.Value(reduce ? 1 : 0))).current;
  const [arrived, setArrived] = useState(reduce);
  useEffect(() => {
    if (reduce) {
      for (const v of arrive) {
        v.stopAnimation();
        v.setValue(1);
      }
      setArrived(true);
      return;
    }
    if (arrived) return;
    const run = Animated.stagger(
      ARRIVE_STAGGER_MS,
      arrive.map((v) => springTo(v, 1, 'bouncy')),
    );
    run.start(({ finished }) => {
      if (finished) setArrived(true);
    });
    return () => run.stop();
    // Only once: a later render is the same ticket, already shown.
  }, [reduce]);

  // The shine, every few seconds once the tiles are in, and only while the screen is in front.
  const glint = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!alive || !arrived || width === 0) return;
    const loop = Animated.loop(Animated.sequence([Animated.delay(GLINT_EVERY_MS), timing(glint, 1, GLINT_MS, { easing: Easing.inOut(Easing.quad) })]));
    loop.start();
    return () => {
      loop.stop();
      glint.setValue(0);
    };
  }, [alive, arrived, width, glint]);

  const band = Math.round(size * 0.45);
  const faceHeight = Math.round(size * TALL);
  return (
    <Pressable
      onPress={onPress}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="button"
      accessibilityLabel={t('stories.lobby.codeSpelled', { code: spelledCode(code) })}
      accessibilityHint={t('play.code.copyHint')}
      testID="code-tiles"
      style={({ pressed }) => [styles.tilesPress, pressed && styles.pressed]}
    >
      {/* A code reads left to right on every screen. */}
      <View
        style={[styles.tiles, { width: rowWidth, height: faceHeight + LIP }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
      >
        {chars.map((ch, i) => {
          const v = arrive[i]!;
          const x = tileX(i, size);
          return (
            <Animated.View
              key={i}
              style={[
                styles.tile,
                {
                  left: x,
                  width: size,
                  height: faceHeight + LIP,
                  opacity: v.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
                  transform: [
                    { perspective: 500 },
                    { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }) },
                    { rotateX: v.interpolate({ inputRange: [0, 1], outputRange: ['-80deg', '0deg'] }) },
                  ],
                },
              ]}
            >
              <Face tone={tone} height={faceHeight}>
                <Text style={[display(Math.round(size * 0.58)), styles.char, { color: tone.ink }]}>{ch}</Text>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.glint,
                    {
                      width: band,
                      opacity: glint.interpolate({ inputRange: [0, 0.1, 0.9, 1], outputRange: [0, 0.35, 0.35, 0] }),
                      transform: [
                        { translateX: glint.interpolate({ inputRange: [0, 1], outputRange: [-band * 1.5 - x, rowWidth + band - x] }) },
                        { skewX: '-20deg' },
                      ],
                    },
                  ]}
                />
              </Face>
            </Animated.View>
          );
        })}
      </View>
    </Pressable>
  );
}

/** A tile's face on its lip, drawn like the lesson's tiles (theme/Tile). */
export function Face({ tone, height, children }: { tone: TileTone; height: number; children: ReactNode }): React.JSX.Element {
  return (
    <>
      {tone.lip ? <View style={[styles.lip, { backgroundColor: tone.lip }]} /> : null}
      <View style={[styles.face, { height, backgroundColor: tone.face, borderColor: tone.edge }]}>{children}</View>
    </>
  );
}

/**
 * Copy, which answers: its glyph pops into a check with a small burst and its word turns to "Copied" in the success
 * green, for a moment. The burst is MotionParts' HeartBurst, which stays still under Reduce Motion.
 */
function CopyButton({ copied, fired, onPress }: { copied: boolean; fired: number; onPress: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const press = usePressScale();
  const label = copied ? t('play.code.copied') : t('play.code.copy');
  const ink = copied ? colors.success : colors.textPrimary;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={label}
      // It shrinks under the finger; under Reduce Motion it fades instead.
      style={({ pressed }) => [styles.action, { opacity: pressed && press.scale === 1 ? pressedDim : 1 }]}
    >
      <Animated.View style={[styles.copy, { backgroundColor: copied ? colors.successFill : colors.controlTrack, transform: [{ scale: press.scale }] }]}>
        <HeartBurst fired={fired} color={colors.success} size={20}>
          <Icon name={copied ? 'check' : 'copy'} size={20} color={ink} />
        </HeartBurst>
        <Text style={[styles.copyText, { color: ink }]} numberOfLines={2}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Everything a lobby offers for bringing people in: the code ticket, with Invite friends for the host (the server
 * takes invites from no one else), and the friend picker it opens. Nothing once the code is gone, which the server
 * clears as soon as the game can no longer be joined.
 */
export function LobbyShare({
  game,
  lobbyId,
  code,
  canInvite,
  mode,
  note,
  storyTitle,
}: {
  game: PlayGame;
  lobbyId: string;
  code: string | null | undefined;
  /** The viewer hosts and a seat is still free. */
  canInvite: boolean;
  mode: 'duo' | 'group';
  note?: string;
  storyTitle?: string;
}): React.JSX.Element | null {
  const { t } = useI18n();
  const [inviting, setInviting] = useState(false);
  if (!code) return null;
  return (
    <>
      <CodeTicket game={game} code={code} note={note} storyTitle={storyTitle}>
        {canInvite ? <ClayButton label={t('stories.lobby.invite')} icon="user-plus" tone="primary" variant="outline" onPress={() => setInviting(true)} /> : null}
      </CodeTicket>
      {inviting ? <InviteSheet target={{ kind: 'lobby', game, lobbyId, mode }} onClose={() => setInviting(false)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'center', gap: spacing.md, paddingBottom: spacing.md },
  heading: { alignItems: 'center', gap: spacing.xs + 2 },
  tilesPress: { alignSelf: 'stretch', alignItems: 'center', borderRadius: radii.md },
  pressed: { opacity: pressedDim },
  tiles: { direction: 'ltr', flexDirection: 'row' },
  tile: { position: 'absolute', top: 0 },
  lip: { position: 'absolute', top: LIP, left: 0, right: 0, bottom: 0, borderRadius: radii.md },
  face: { borderWidth: 2, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  char: { writingDirection: 'ltr', textAlign: 'center', includeFontPadding: false },
  glint: { position: 'absolute', top: -8, bottom: -8, left: 0, backgroundColor: SHINE },
  bottom: { gap: spacing.sm, paddingTop: spacing.md },
  actions: { gap: spacing.sm },
  action: { flex: 1 },
  copy: {
    borderRadius: radii.pill,
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  // A long "Copy code" wraps inside the button rather than being cut.
  copyText: { flexShrink: 1, textAlign: 'center', fontSize: typography.ios.button, fontWeight: typography.weights.semibold },
  note: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  hint: { fontSize: typography.sizes.sm, lineHeight: 20 },
});
