import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, View } from 'react-native';
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
import { tileTone } from '../../theme/tileTones';
import { radii, spacing } from '../../theme/tokens';
import type { AnswerMode } from '../answerModePref';

/** A tile's height before one has been measured: a fingertip and its lip. */
const TILE_HEIGHT = MIN_TOUCH_TARGET + LIP;

/** Between tiles, along a line and from one line to the next. */
const GAP = spacing.sm;

interface Rect {
  x: number;
  y: number;
  w: number;
}

/** A tile on its way: from the bank to the end of the line, or back to its place in the bank. */
interface Flight {
  id: number;
  index: number;
  /** where it leaves from and where it lands, relative to the bank's own corner; null until both have been measured */
  from: Rect | null;
  to: Rect | null;
}

interface Props {
  bank: string[];
  /** the bank's tiles on the line, by their places in the bank, in the order laid */
  placed: number[];
  onChange: (placed: number[]) => void;
  disabled: boolean;
  /** how the answer was graded, once it has been: the tiles on the line turn its colour */
  verdict?: 'right' | 'wrong' | null;
  /** what the line is, for a screen reader: "Your translation", "What you heard" */
  lineLabel: string;
}

/**
 * An answer built from word tiles: two ruled lines, and the bank of tiles
 * under them.
 *
 * A tile tapped in the bank flies from its place there to the end of the line
 * — both measured, and a copy of it carried between them on a spring — and
 * leaves a grey ghost of its own size behind, so the bank never shuffles; a
 * tile tapped on the line flies back to its ghost. Under Reduce Motion it is
 * simply there. It lands with a light knock, and a screen reader hears the
 * answer as it now reads. Soranî tiles, on the line and in the bank, read from
 * the right.
 *
 * What the line says is sent as a typed answer is (shared `tileAnswer`).
 */
export function WordBank({ bank, placed, onChange, disabled, verdict = null, lineLabel }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const root = useRef<View>(null);
  const slots = useRef(new Map<number, View | null>());
  const onLine = useRef(new Map<number, View | null>());
  const [flights, setFlights] = useState<Flight[]>([]);
  const nextId = useRef(0);
  const [tileHeight, setTileHeight] = useState(TILE_HEIGHT);
  const [lineHeight, setLineHeight] = useState(0);
  // words in Arabic script (Soranî) read from the right: the line fills from there, and the bank starts there
  const rtl = scriptDialect(bank.join(' ')) === 'sorani';
  const flow = rtl ? 'row-reverse' : 'row';

  const say = useCallback(
    (line: number[]) => {
      const answer = tileAnswer(bank, line);
      AccessibilityInfo.announceForAccessibility(answer ? t('lesson.tiles.answer', { answer }) : t('lesson.tiles.empty'));
    },
    [bank, t],
  );

  // what is on the line now, for a flight that lands after something else was laid or taken off
  const latest = useRef(placed);
  latest.current = placed;

  /** Where a view is, relative to the bank's own corner; null when it is not on screen to be measured. */
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

  // a tile laid on the line is measured there once it is on screen, and in its place in the bank, and its flight
  // set off between the two; one that cannot be measured simply appears
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
    // measured on the line before it leaves it; where it lands is its ghost, which never moves
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
  const rule = tileTone(colors, 'idle').edge;

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
                textStyle={rtl ? styles.rtl : null}
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
              {gone ? <View style={[styles.ghost, { backgroundColor: colors.controlTrack }]} /> : null}
              <View aria-hidden={gone} style={gone ? styles.hidden : null}>
                <Tile
                  label={word}
                  state={disabled ? 'disabled' : 'idle'}
                  disabled={gone}
                  onPress={() => place(index)}
                  accessibilityHint={t('lesson.tiles.addHint')}
                  textStyle={rtl ? styles.rtl : null}
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

/** A copy of a tile carried from where it was to where it goes, on a spring, over everything else. */
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
      <Tile label={word} textStyle={rtl ? styles.rtl : null} />
    </Animated.View>
  );
}

/** "Use keyboard" / "Use word tiles": a small round button that swaps the one for the other. */
export function AnswerModeSwitch({ mode, onChange, end }: { mode: AnswerMode; onChange: (mode: AnswerMode) => void; end: 'left' | 'right' }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const tiles = mode === 'tiles';
  return (
    <Pressable
      onPress={() => onChange(tiles ? 'keyboard' : 'tiles')}
      accessibilityRole="button"
      accessibilityLabel={t(tiles ? 'lesson.tiles.useKeyboard' : 'lesson.tiles.useTiles')}
      style={({ pressed }) => [styles.switch, { alignSelf: end === 'right' ? 'flex-end' : 'flex-start', backgroundColor: colors.controlTrack }, pressed && styles.pressed]}
    >
      <Icon name={tiles ? 'keyboard' : 'tiles'} size={22} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xl },
  rule: { position: 'absolute', left: 0, right: 0, height: 2, borderRadius: radii.pill },
  flow: { flexWrap: 'wrap', gap: GAP },
  bank: { justifyContent: 'center' },
  ghost: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radii.lg },
  hidden: { opacity: 0 },
  rtl: { writingDirection: 'rtl' },
  flying: { position: 'absolute', left: 0, top: 0, zIndex: 2 },
  switch: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
});
