import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, Share, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
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
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { useAnnouncer } from '../stories/ui';
import { InviteSheet } from './InviteSheet';
import { GAME_NAME_KEY } from './labels';
import { codePath, codeTone, shareMessage, spelledCode } from './joinCode';
import { TicketTear } from './Ticket';

/**
 * A lobby's join code, as a ticket: the way in for anyone the host tells — in
 * person, on the phone, in another app — where "Invite friends" beside it is
 * the way in for friends on Hevalo.
 *
 * The code is the ticket's face, six tiles in the game's own colour split as
 * it is read out ("ABC 234"), in the display serif and large enough to read
 * across a table. Tapping it copies it, and so does Copy, whose label turns
 * into "Copied" with a check that pops in a small burst; Share hands the
 * system sheet a message that says where to type the code. There is no link:
 * a code reaches a friend whichever app they open, and wherever a link cannot
 * go. Under it, one line on where a friend types it.
 *
 * As it first appears the tiles drop in one after another, flipping up onto
 * their lips with a little overshoot; after that a light crosses them every
 * few seconds — only while the screen is in front and the person has not
 * asked for less motion (useMotionAlive). Under Reduce Motion the ticket is
 * simply there, and a copy changes colour without the burst.
 *
 * A code always reads left to right, on a Soranî or an Arabic screen too; the
 * words round it follow the language.
 *
 * Its tear line, notches and rule are the ones every invitation's ticket is
 * cut with (Ticket.tsx), so an invite in a chat, on the banner or in the
 * lobby's list reads as the same kind of ticket as this one.
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
  /** who may use this code, where that depends on the game's settings (a story game's access) */
  note?: string;
  /** a story game is shared by its story's title rather than by the game's name */
  storyTitle?: string;
  /** what sits on the ticket under the code's own actions: Invite friends */
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
    // the code as a link too, saying who is asking, so a friend who is not one yet can ask to be
    const link = buildJoinLink(game, code, { from: user?.id });
    const message = shareMessage({ game: t(GAME_NAME_KEY[game]), code, storyTitle, link }, t, rtl, formatJoinCode);
    // the sheet's own dismissal is not a failure, and has nothing to report
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

/** How long Copy says "Copied" before it is Copy again. */
const COPIED_MS = 1800;

/** Between two tiles, and the wider space where the code is split as it is read out. */
const GAP = 6;
const SPLIT = 14;
const MAX_TILE = 54;
const MIN_TILE = 34;
/** A tile is a little taller than it is wide, like a letter on a board. */
const TALL = 1.2;

/** How the tiles arrive: one after another, each this long after the one before. */
const ARRIVE_STAGGER_MS = 55;
/** The light that crosses the tiles: how often, and how long it takes to cross. */
const GLINT_EVERY_MS = 4200;
const GLINT_MS = 900;

/** As wide as the ticket lets them be, within what still reads as a tile. */
export function tileSizeFor(width: number): number {
  return Math.max(MIN_TILE, Math.min(MAX_TILE, Math.floor((width - GAP * 4 - SPLIT) / 6)));
}

/** Where tile `i` starts, from the row's own left edge. */
function tileX(i: number, size: number): number {
  return i < 3 ? i * (size + GAP) : 3 * size + 2 * GAP + SPLIT + (i - 3) * (size + GAP);
}

/** The six tiles, tappable as one: the code spelled out to a screen reader, copied on a tap. */
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

  // one value per tile, 0 → 1 as it arrives; played once, as the ticket first shows
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
    // once: a later render is the same ticket, already there
  }, [reduce]);

  // the light, every few seconds once the tiles are in, and only while anybody can see it
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
      {/* a code reads left to right on every screen */}
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

/** A tile's face on its lip, as the lesson's tiles are drawn (theme/Tile). */
export function Face({ tone, height, children }: { tone: TileTone; height: number; children: ReactNode }): React.JSX.Element {
  return (
    <>
      {tone.lip ? <View style={[styles.lip, { backgroundColor: tone.lip }]} /> : null}
      <View style={[styles.face, { height, backgroundColor: tone.face, borderColor: tone.edge }]}>{children}</View>
    </>
  );
}

/**
 * Copy, which answers: its glyph becomes a check that pops with a small burst
 * and its word becomes "Copied", on the green of something done, for a moment.
 * The burst is the like's (MotionParts HeartBurst), so it is still under
 * Reduce Motion and the colour says it alone.
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
      style={({ pressed }) => [styles.action, { opacity: pressed ? 0.92 : 1 }]}
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
 * Everything a lobby offers for bringing people in: the ticket while the game
 * has a code, with Invite friends on it for the host (the server takes invites
 * from no one else), and the friend picker that button opens.
 *
 * Nothing at all once the code is gone: the server clears it the moment the
 * game can no longer be joined, so there is nobody left to invite either.
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
  /** the host, with a seat still free */
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
  pressed: { opacity: 0.85 },
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
  // a long word for "Copy code" wraps inside the button rather than being cut short
  copyText: { flexShrink: 1, textAlign: 'center', fontSize: typography.ios.button, fontWeight: typography.weights.semibold },
  note: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  hint: { fontSize: typography.sizes.sm, lineHeight: 20 },
});
