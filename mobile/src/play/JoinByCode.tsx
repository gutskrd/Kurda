import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Animated, Easing, StyleSheet, Text, TextInput, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { G, Path, Rect } from 'react-native-svg';
import {
  JOIN_CODE_LENGTH,
  TICKET_ART_OUTLINE,
  TICKET_ART_PERFORATION,
  TICKET_ART_STUB,
  TICKET_ART_TILES,
  parseInvite,
  type JoinedByCode,
  type PlayGame,
} from '@kurda/shared';
import { useAccountGate } from '../auth/AccountGate';
import { useAuth } from '../auth/AuthContext';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useScreenAwake } from '../a11y/useMotionAlive';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import type { RootNavigation } from '../navigation/rootStack';
import { useDirection } from '../reports/direction';
import { springTo, timing, useShake } from '../theme/animate';
import { ConfettiBurst } from '../theme/CelebrationParts';
import { display } from '../theme/fonts';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { PressableScale } from '../theme/MotionParts';
import { LIP, SHINE } from '../theme/Tile';
import { lipOf, tileTone, type TileState } from '../theme/tileTones';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { Sheet, useAnnouncer } from '../stories/ui';
import { joinByCode } from './api';
import { Face } from './CodeTicket';
import { joinCodeError, typedCode } from './joinCode';
import { lobbyRoute } from './routes';

/**
 * Join with a code: the way into any of the games for somebody a friend told
 * a code to — on the Games hub, in the Stories library, and where a game of
 * your own is set up.
 *
 * Six boxes and one real text field. The boxes are only a picture of what is
 * in the field (hidden from a screen reader); the field lies over them, so a
 * tap anywhere on them types into it, and paste, the keyboard's suggestions,
 * an input method and an Arabic-script keyboard's digits all work the way they
 * do in any field. What goes in is upper-cased and kept to what a code can
 * contain (joinCode.ts `typedCode`); a whole old invite link pasted in opens
 * its lobby straight away, as it always has.
 *
 * Each character pops into its box, the box it goes to next is lit with a
 * caret, and the sixth sends the code by itself (Join is there for whoever
 * waits for a button, and for trying again). While the server is asked a wave
 * runs along the boxes; a code that worked turns them green one after another,
 * with a small burst and the phone's success buzz, and the lobby opens. One
 * that did not shakes them in red, buzzes once, and says why — and typing
 * again clears it. Under Reduce Motion nothing moves: the colours and the
 * words say it all, and the lobby opens a beat after the green.
 */
export function JoinCodeSheet({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t, rtl } = useI18n();
  const reduce = useReducedMotion();
  const { announce, region } = useAnnouncer();
  const shake = useShake();
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<Phase>('typing');
  const [message, setMessage] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  // how many boxes have turned green; they turn one after another as the code is accepted
  const [flipped, setFlipped] = useState(0);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const busy = useRef(false);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (ms: number, run: () => void): void => {
    timers.current.push(setTimeout(run, ms));
  };

  const open = useCallback(
    (game: PlayGame, lobbyId: string) => {
      const route = lobbyRoute(game, lobbyId);
      onClose();
      navigation.navigate(route.name, route.params as never);
    },
    [navigation, onClose],
  );

  const joined = (to: JoinedByCode): void => {
    setPhase('success');
    haptic('correct');
    announce(t('play.join.success'));
    if (reduce) {
      setFlipped(JOIN_CODE_LENGTH);
      later(SUCCESS_REDUCED_MS, () => open(to.game, to.lobbyId));
      return;
    }
    for (let i = 0; i < JOIN_CODE_LENGTH; i++) later(i * FLIP_STAGGER_MS + FLIP_MS / 2, () => setFlipped(i + 1));
    later(SUCCESS_MS, () => open(to.game, to.lobbyId));
  };

  const submit = async (value: string): Promise<void> => {
    if (value.length !== JOIN_CODE_LENGTH || busy.current) return;
    busy.current = true;
    setPhase('joining');
    setMessage(null);
    const res = await joinByCode(client, value);
    busy.current = false;
    if (res.ok) {
      joined(res.data);
      return;
    }
    const why = joinCodeError(res.error, t);
    setPhase('error');
    setMessage(why);
    haptic('error');
    shake.run();
    announce(why);
  };

  const change = (text: string): void => {
    if (phase === 'joining' || phase === 'success') return;
    // an old invite link, pasted: its lobby, as the link always opened it
    const invite = parseInvite(text);
    if (invite) {
      open(invite.type, invite.id);
      return;
    }
    // any key after a refusal is typing again: the red and the words go, even when the code stays as it was
    if (phase === 'error' && text !== code) {
      setPhase('typing');
      setMessage(null);
    }
    const next = typedCode(text);
    if (next === code) return;
    setCode(next);
    if (next.length === JOIN_CODE_LENGTH) void submit(next);
  };

  const done = phase === 'success';
  return (
    <Sheet
      title={t('stories.join.open')}
      onClose={onClose}
      footer={
        <ClayButton
          label={t('stories.join.button')}
          tone="primary"
          size="large"
          busy={phase === 'joining'}
          disabled={code.length !== JOIN_CODE_LENGTH || done}
          onPress={() => void submit(code)}
        />
      }
    >
      <Text style={[styles.hint, { color: colors.textSecondary, writingDirection: rtl ? 'rtl' : 'ltr' }]}>{t('play.join.hint')}</Text>
      <Animated.View style={{ transform: [{ translateX: shake.translateX }] }}>
        <CodeBoxes code={code} phase={phase} focused={focused} flipped={flipped} />
        <TextInput
          value={code}
          onChangeText={change}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={() => void submit(code)}
          editable={phase !== 'joining' && !done}
          autoFocus
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          textContentType="none"
          returnKeyType="go"
          caretHidden
          accessibilityLabel={t('stories.lobby.code')}
          accessibilityHint={t('play.join.hint')}
          testID="join-code-input"
          style={styles.field}
        />
      </Animated.View>
      {/* said to a screen reader once, by the announcer, rather than by a live region here as well */}
      {message ? (
        <View style={[styles.message, { backgroundColor: colors.dangerFill, flexDirection: rtl ? 'row-reverse' : 'row' }]} testID="join-message">
          <Icon name="alert" size={16} color={colors.danger} />
          <Text style={[styles.messageText, { color: colors.danger, writingDirection: rtl ? 'rtl' : 'ltr' }]}>{message}</Text>
        </View>
      ) : null}
      {region}
    </Sheet>
  );
}

type Phase = 'typing' | 'joining' | 'error' | 'success';

/** Each box turns green this long after the one before it, taking this long to flip over. */
export const FLIP_STAGGER_MS = 80;
export const FLIP_MS = 300;
/** From the code being accepted to the lobby opening: the flips, then the burst. */
export const SUCCESS_MS = 1250;
export const SUCCESS_REDUCED_MS = 450;
/** The burst starts as the last box lands. */
const BURST_DELAY_MS = (JOIN_CODE_LENGTH - 1) * FLIP_STAGGER_MS + FLIP_MS;

const BOX_GAP = 8;
const BOX_SPLIT = 14;
const BOX_MAX = 48;
const BOX_TALL = 1.18;

/** The six boxes, drawn from the field's value. Never read by a screen reader: the field is. */
function CodeBoxes({ code, phase, focused, flipped }: { code: string; phase: Phase; focused: boolean; flipped: number }): React.JSX.Element {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const awake = useScreenAwake();
  const [width, setWidth] = useState(0);
  const size = width > 0 ? Math.max(36, Math.min(BOX_MAX, Math.floor((width - BOX_GAP * 4 - BOX_SPLIT) / JOIN_CODE_LENGTH))) : BOX_MAX;
  const height = Math.round(size * BOX_TALL);
  const active = focused && (phase === 'typing' || phase === 'error') ? Math.min(code.length, JOIN_CODE_LENGTH - 1) : -1;

  // a character popping into its box: from a little small to its size, on the bouncy spring
  const pops = useRef(Array.from({ length: JOIN_CODE_LENGTH }, () => new Animated.Value(1))).current;
  const before = useRef(code);
  useEffect(() => {
    const was = before.current;
    before.current = code;
    if (reduce) return;
    for (let i = was.length; i < code.length; i++) {
      const v = pops[i]!;
      v.stopAnimation();
      v.setValue(0.55);
      springTo(v, 1, 'bouncy').start();
    }
  }, [code, reduce, pops]);

  // the wave while the server is asked: a loading shimmer, the one loop the motion rules allow
  const wave = useRef(Array.from({ length: JOIN_CODE_LENGTH }, () => new Animated.Value(0))).current;
  useEffect(() => {
    if (phase !== 'joining' || reduce || !awake) return;
    const loop = Animated.loop(
      Animated.stagger(
        70,
        wave.map((v) => Animated.sequence([timing(v, 1, 220, { easing: Easing.out(Easing.quad) }), timing(v, 0, 260, { easing: Easing.in(Easing.quad) })])),
      ),
    );
    loop.start();
    return () => {
      loop.stop();
      for (const v of wave) v.setValue(0);
    };
  }, [phase, reduce, awake, wave]);

  // the flip as a box turns green: over on its edge and back, the colour changing as it is side-on
  const flips = useRef(Array.from({ length: JOIN_CODE_LENGTH }, () => new Animated.Value(0))).current;
  const burst = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (phase !== 'success' || reduce) return;
    const run = Animated.parallel([
      Animated.stagger(
        FLIP_STAGGER_MS,
        flips.map((v) => timing(v, 1, FLIP_MS, { easing: Easing.inOut(Easing.quad) })),
      ),
      Animated.timing(burst, { toValue: 1, duration: 820, delay: BURST_DELAY_MS, easing: Easing.linear, useNativeDriver: true }),
    ]);
    run.start();
    return () => run.stop();
  }, [phase, reduce, flips, burst]);

  // the caret in the box the next character goes to, blinking as a caret does; still under Reduce Motion
  const caret = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (active < 0 || reduce || !awake) {
      caret.setValue(1);
      return;
    }
    const blink = Animated.loop(Animated.sequence([Animated.delay(450), timing(caret, 0, 90), Animated.delay(380), timing(caret, 1, 90)]));
    blink.start();
    return () => blink.stop();
  }, [active, reduce, awake, caret]);

  const stateOf = (i: number): TileState => {
    if (phase === 'success') return i < flipped ? 'right' : 'idle';
    if (phase === 'error') return 'wrong';
    return i === active ? 'picked' : 'idle';
  };

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={styles.boxesWrap}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      {/* from behind the boxes, so the flecks fly out from under them */}
      {phase === 'success' && !reduce ? (
        <ConfettiBurst progress={burst} count={18} seed={7} colours={[colors.gold, colors.success]} reach={Math.min(150, width * 0.45)} testID="join-burst" />
      ) : null}
      <View style={[styles.boxes, { height: height + LIP }]}>
        {Array.from({ length: JOIN_CODE_LENGTH }, (_, i) => {
          const state = stateOf(i);
          const tone = tileTone(colors, state);
          const ch = code[i];
          const w = wave[i]!;
          const f = flips[i]!;
          return (
            <Animated.View
              key={i}
              testID={`code-box-${i}-${state}`}
              style={{
                width: size,
                height: height + LIP,
                marginLeft: i === 0 ? 0 : i === 3 ? BOX_SPLIT : BOX_GAP,
                transform: [
                  { perspective: 500 },
                  { translateY: w.interpolate({ inputRange: [0, 1], outputRange: [0, -7] }) },
                  { rotateX: f.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '90deg', '0deg'] }) },
                  { scale: pops[i]! },
                ],
              }}
            >
              <Face tone={tone} height={height}>
                {ch ? (
                  <Text style={[display(Math.round(size * 0.56)), styles.char, { color: tone.ink }]}>{ch}</Text>
                ) : i === active ? (
                  <Animated.View style={[styles.caret, { height: Math.round(height * 0.46), backgroundColor: tone.edge, opacity: caret }]} />
                ) : null}
                <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.shine, { opacity: w.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] }) }]} />
              </Face>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

/**
 * The way to the sheet from the Games hub and from setting up a game: a card
 * with two tickets on it, the front one in the sun's gold and one in green
 * behind it, a line saying what it is for, and the sheet on a tap. A guest is
 * offered an account first, as for every other way into a game with people.
 */
export function JoinCodeCard({ style }: { style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const gate = useAccountGate();
  const [open, setOpen] = useState(false);
  const title = t('stories.join.open');
  const line = t('play.join.line');
  return (
    <>
      <PressableScale
        onPress={() => {
          if (gate.require('play')) setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${line}`}
        testID="join-with-code"
        style={[styles.card, { backgroundColor: colors.surface, flexDirection: dir.row }, style]}
      >
        <TicketMotif size={60} />
        <View style={styles.cardText}>
          <Text style={[styles.cardTitle, dir.text, { color: colors.textPrimary }]} numberOfLines={2}>
            {title}
          </Text>
          <Text style={[styles.cardLine, dir.text, { color: colors.textSecondary }]} numberOfLines={3}>
            {line}
          </Text>
        </View>
        <Icon name="chevron-right" size={18} color={colors.textSecondary} style={dir.flip} />
      </PressableScale>
      {open ? <JoinCodeSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/**
 * Two tickets, one tucked behind the other: the outline the website draws
 * too (a stub, a tear line with a notch bitten from each edge where it meets
 * them, three tiles where the code goes), the front one in the sun's gold and
 * one in green behind it. Flat cut-outs: the stub a shade of the ticket's own
 * colour, the tear line and the tiles in the card's colour as if punched
 * through. A right-to-left reader sees it mirrored, stub first on the right.
 */
export function TicketMotif({ size }: { size: number }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const height = size * 0.8;
  const ticket = (fill: string, tiles: boolean): React.JSX.Element => (
    <>
      <Path d={TICKET_ART_OUTLINE} fill={fill} />
      <Path d={TICKET_ART_STUB} fill={lipOf(fill, colors)} />
      <Path d={TICKET_ART_PERFORATION} stroke={colors.surface} strokeWidth={1.6} strokeDasharray="2.4 2.6" strokeLinecap="round" />
      {tiles
        ? TICKET_ART_TILES.map((tile) => <Rect key={tile.x} x={tile.x} y={tile.y} width={tile.width} height={tile.height} rx={tile.r} fill={colors.surface} />)
        : null}
    </>
  );
  return (
    <View style={[{ width: size, height }, dir.flip]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={height} viewBox="-6 -13 72 57.6">
        <G transform="translate(4 -3) rotate(9 29 16)">{ticket(colors.success, false)}</G>
        <G transform="translate(-2 4) rotate(-7 29 16)">{ticket(colors.gold, true)}</G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: typography.sizes.sm, lineHeight: 20, textAlign: 'center' },
  boxesWrap: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm },
  boxes: { direction: 'ltr', flexDirection: 'row' },
  char: { writingDirection: 'ltr', textAlign: 'center', includeFontPadding: false },
  caret: { width: 3, borderRadius: radii.pill },
  shine: { backgroundColor: SHINE },
  // over the boxes, the size of them, so a tap anywhere on them is a tap in the field
  field: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: MIN_TOUCH_TARGET,
    opacity: 0.02,
    color: 'transparent',
    backgroundColor: 'transparent',
    borderWidth: 0,
    // the boxes show where typing goes; a browser's focus ring round the whole row would say it twice
    outlineWidth: 0,
    fontSize: 1,
  },
  message: { alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, paddingHorizontal: spacing.md - 4, paddingVertical: spacing.sm + 2 },
  messageText: { flex: 1, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, lineHeight: 20 },

  card: {
    alignItems: 'center',
    gap: spacing.md - 4,
    minHeight: MIN_TOUCH_TARGET + 28,
    borderRadius: radii.lg,
    paddingVertical: spacing.md - 4,
    paddingHorizontal: layout.gutter,
  },
  cardText: { flex: 1, gap: 2 },
  cardTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  cardLine: { fontSize: typography.sizes.xs, lineHeight: 18 },
});
