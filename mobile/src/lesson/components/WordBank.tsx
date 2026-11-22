import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';
import { Pressable } from '../../theme/Pressable';
import { liftTile, placeTile, scriptDialect, tileAnswer } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../../a11y/a11y';
import { useReducedMotion } from '../../a11y/useReducedMotion';
import { haptic } from '../../feedback/haptics';
import { useI18n } from '../../i18n/I18nContext';
import { springTo } from '../../theme/animate';
import { Icon } from '../../theme/Icon';
import { AnswerMotion } from '../../theme/MotionParts';
import { LIP, Tile } from '../../theme/Tile';
import { useTheme } from '../../theme/ThemeProvider';
import { display } from '../../theme/fonts';
import { radii, spacing, typography } from '../../theme/tokens';
import type { AnswerMode } from '../answerModePref';
import { pressedDim } from '../../theme/motion';
import { useValley } from '../ValleyScope';
import { CARD } from '../valley';

/** A tile's height before measurement: a fingertip and its lip. */
const TILE_HEIGHT = MIN_TOUCH_TARGET + LIP;

/** The gap between tiles, across and between lines. */
const GAP = spacing.sm;

interface Rect {
  x: number;
  y: number;
  w: number;
}

/** A tile in flight: from the bank to the end of the line, or back to its place in the bank. */
interface Flight {
  id: number;
  index: number;
  /** Its start and end relative to the bank's corner; null until both are measured. */
  from: Rect | null;
  to: Rect | null;
}

interface Props {
  bank: string[];
  /** The bank's tiles on the line, by bank index, in the order laid. */
  placed: number[];
  onChange: (placed: number[]) => void;
  disabled: boolean;
  /** How the answer was graded, once it has been; the line's tiles turn its colour. */
  verdict?: 'right' | 'wrong' | null;
  /** The line's screen-reader name: "Your translation", "What you heard". */
  lineLabel: string;
}

/**
 * An answer built from word tiles: two ruled lines over a bank of small cream cards in the display face. A tapped
 * bank tile flies on a spring to the end of the line, leaving a same-size ghost so the bank never shuffles; a line
 * tile flies back to its ghost. Under Reduce Motion it moves instantly. It lands with a light haptic and screen
 * readers hear the new answer. Soranî tiles read from the right. The line is sent as a typed answer (shared
 * `tileAnswer`).
 */
export function WordBank({ bank, placed, onChange, disabled, verdict = null, lineLabel }: Props): React.JSX.Element {
  const valley = useValley();
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const root = useRef<View>(null);
  const slots = useRef(new Map<number, View | null>());
  const onLine = useRef(new Map<number, View | null>());
  const [flights, setFlights] = useState<Flight[]>([]);
  const nextId = useRef(0);
  const [tileHeight, setTileHeight] = useState(TILE_HEIGHT);
  const [lineHeight, setLineHeight] = useState(0);
  // Arabic-script words (Soranî) read from the right: the line fills from there, and the bank starts there.
  const rtl = scriptDialect(bank.join(' ')) === 'sorani';
  const flow = rtl ? 'row-reverse' : 'row';

  const say = useCallback(
    (line: number[]) => {
      const answer = tileAnswer(bank, line);
      AccessibilityInfo.announceForAccessibility(answer ? t('lesson.tiles.answer', { answer }) : t('lesson.tiles.empty'));
    },
    [bank, t],
  );

  // What is on the line now, for a flight that lands after something else was laid or removed.
  const latest = useRef(placed);
  latest.current = placed;

  /** A view's position relative to the bank's corner; null when it is not on screen to measure. */
  const where = useCallback((view: View | null | undefined, then: (rect: Rect | null) => void): void => {
    const box = root.current;
    if (!view || !box) {
      then(null);
      return;
    }
    box.measureInWindow((rx, ry) => view.measureInWindow((x, y, w) => then({ x: x - rx, y: y - ry, w })));
  }, []);

  const land = useCallback((id: number) => {
    setFlights((all) => all.filter((f) => f.id !== id));
    haptic('tap');
  }, []);

  // A tile laid on the line is measured there and in its bank place, then flies between them; one that cannot be
  // measured simply appears.
  useEffect(() => {
    for (const f of flights) {
      if (f.from && f.to) continue;
      where(slots.current.get(f.index), (from) =>
        where(onLine.current.get(f.index), (to) =>
          setFlights((all) => (from && to ? all.map((g) => (g.id === f.id ? { ...g, from, to } : g)) : all.filter((g) => g.id !== f.id))),
        ),
      );
    }
  }, [flights, where]);

  const place = (index: number): void => {
    const next = placeTile(placed, index);
    say(next);
    onChange(next);
    if (reduce) haptic('tap');
    else setFlights((all) => [...all, { id: nextId.current++, index, from: null, to: null }]);
  };

  const lift = (index: number): void => {
    say(liftTile(placed, index));
    if (reduce) {
      onChange(liftTile(placed, index));
      haptic('tap');
      return;
    }
    // Measured on the line before it leaves; it lands on its ghost, which never moves.
    where(onLine.current.get(index), (from) =>
      where(slots.current.get(index), (to) => {
        if (from && to) setFlights((all) => [...all, { id: nextId.current++, index, from, to }]);
        onChange(liftTile(latest.current, index));
      }),
    );
  };

  const flying = (index: number): boolean => flights.some((f) => f.index === index);
  const rows = Math.max(2, Math.round((lineHeight + GAP) / (tileHeight + GAP)));
  const lineState = verdict ?? 'idle';
  const rule = valley.line;
  const words = rtl ? [styles.word, styles.rtl] : styles.word;

  return (
    <View ref={root} style={styles.wrap}>
      <AnswerMotion verdict={verdict}>
        <View style={{ minHeight: rows * (tileHeight + GAP) }} accessibilityLabel={lineLabel}>
          {Array.from({ length: rows }, (_, r) => (
            <View key={r} style={[styles.rule, { top: r * (tileHeight + GAP) + tileHeight + GAP / 2 - 1, backgroundColor: rule }]} />
          ))}
          <View style={[styles.flow, { flexDirection: flow }]} onLayout={(e) => setLineHeight(e.nativeEvent.layout.height)} testID="word-line">
            {placed.map((index) => (
              <Tile
                key={index}
                ref={(el: View | null) => {
                  onLine.current.set(index, el);
                }}
                label={bank[index]}
                state={lineState}
                disabled={disabled || flying(index)}
                onPress={() => lift(index)}
                accessibilityHint={t('lesson.tiles.removeHint')}
                faceStyle={styles.face}
                textStyle={words}
                style={flying(index) ? styles.hidden : null}
              />
            ))}
          </View>
        </View>
      </AnswerMotion>

      <View style={[styles.flow, styles.bank, { flexDirection: flow }]} testID="word-bank">
        {bank.map((word, index) => {
          const gone = placed.includes(index) || flying(index);
          return (
            <View
              key={index}
              ref={(el) => {
                slots.current.set(index, el);
              }}
              onLayout={index === 0 ? (e) => setTileHeight(e.nativeEvent.layout.height) : undefined}
            >
              {gone ? <View style={[styles.ghost, { backgroundColor: valley.track }]} /> : null}
              <View aria-hidden={gone} style={gone ? styles.hidden : null}>
                <Tile
                  label={word}
                  state={disabled ? 'disabled' : 'idle'}
                  disabled={gone}
                  onPress={() => place(index)}
                  accessibilityHint={t('lesson.tiles.addHint')}
                  faceStyle={styles.face}
                  textStyle={words}
                />
              </View>
            </View>
          );
        })}
      </View>

      {flights.map((f) =>
        f.from && f.to ? <FlyingTile key={f.id} word={bank[f.index] ?? ''} from={f.from} to={f.to} rtl={rtl} onLand={() => land(f.id)} /> : null,
      )}
    </View>
  );
}

/** A copy of a tile carried on a spring from where it was to where it goes, over everything. */
function FlyingTile({ word, from, to, rtl, onLand }: { word: string; from: Rect; to: Rect; rtl: boolean; onLand: () => void }): React.JSX.Element {
  const x = useRef(new Animated.Value(from.x)).current;
  const y = useRef(new Animated.Value(from.y)).current;
  const landed = useRef(onLand);
  landed.current = onLand;
  useEffect(() => {
    const run = Animated.parallel([springTo(x, to.x, 'release'), springTo(y, to.y, 'release')]);
    run.start(({ finished }) => {
      if (finished) landed.current();
    });
    return () => run.stop();
  }, [x, y, to.x, to.y]);
  return (
    <Animated.View pointerEvents="none" aria-hidden style={[styles.flying, { width: from.w, transform: [{ translateX: x }, { translateY: y }] }]}>
      <Tile label={word} faceStyle={styles.face} textStyle={rtl ? [styles.word, styles.rtl] : styles.word} />
    </Animated.View>
  );
}

/** "Use keyboard" / "Use word tiles": a small round button swapping one for the other. */
export function AnswerModeSwitch({ mode, onChange, end }: { mode: AnswerMode; onChange: (mode: AnswerMode) => void; end: 'left' | 'right' }): React.JSX.Element {
  const { colors } = useTheme();
  const valley = useValley();
  const { t } = useI18n();
  const tiles = mode === 'tiles';
  return (
    <Pressable
      onPress={() => onChange(tiles ? 'keyboard' : 'tiles')}
      accessibilityRole="button"
      accessibilityLabel={t(tiles ? 'lesson.tiles.useKeyboard' : 'lesson.tiles.useTiles')}
      style={({ pressed }) => [
        styles.switch,
        { alignSelf: end === 'right' ? 'flex-end' : 'flex-start', backgroundColor: valley.card, borderColor: valley.line },
        pressed && styles.pressed,
      ]}
    >
      <Icon name={tiles ? 'keyboard' : 'tiles'} size={22} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xl },
  rule: { position: 'absolute', left: 0, right: 0, height: CARD.edge, borderRadius: radii.pill },
  flow: { flexWrap: 'wrap', gap: GAP },
  bank: { justifyContent: 'center' },
  // A word tile: a smaller card than an answer, on the app's tile edge.
  face: { borderRadius: radii.md + 2 },
  // The Kurdish words in the headings' display face.
  word: { ...display(typography.sizes.text) },
  ghost: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radii.md + 2 },
  hidden: { opacity: 0 },
  rtl: { writingDirection: 'rtl' },
  flying: { position: 'absolute', left: 0, top: 0, zIndex: 2 },
  switch: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: radii.pill,
    borderWidth: CARD.edge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: pressedDim },
});
