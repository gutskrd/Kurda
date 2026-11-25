import { useRef, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { STROKE_LOOK, paintColor, paperColors, type DrawTool, type Ink, type LetterPaper, type Paint, type PaperTone } from '@kurda/shared';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeProvider';
import { useDirection } from '../reports/direction';
import { PressableScale } from '../theme/MotionParts';
import { ReachGroup } from '../theme/Pressable';
import { Icon, type IconName } from '../theme/Icon';
import { fontScaleCap, radii, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { haptic } from '../feedback/haptics';
import { HIDDEN } from './PaperSheet';
import { PEN_WIDTHS, type PenSize } from './paperKit';

/**
 * The composer's tools (LetterComposer.tsx), kept quiet so the paper stays the focus: a bar of Write, Draw, Text and
 * Paper, and under it the chosen tool's controls. Each choice is a small live sample of itself rather than a word,
 * at least a fingertip wide, and named for screen readers.
 */

export type PaperTool = 'write' | 'draw' | 'text' | 'paper';
const TOOLS: readonly PaperTool[] = ['write', 'draw', 'text', 'paper'];

/** The four tools above the paper. On a first letter Draw stays in place, dimmed with a lock, and says why when touched. */
export function ToolBar({ tool, onTool, canDraw }: { tool: PaperTool; onTool: (tool: PaperTool) => void; canDraw: boolean }): React.JSX.Element {
  const { t } = useI18n();
  const { colors } = useTheme();
  const dir = useDirection();
  const name: Record<PaperTool, string> = {
    write: t('letters.paper.write'),
    draw: t('letters.paper.draw'),
    text: t('letters.paper.text'),
    paper: t('letters.paper.paper'),
  };
  const mirrored = dir.row === 'row-reverse';
  return (
    <View style={[styles.bar, { backgroundColor: colors.controlTrack, flexDirection: dir.row }]} accessibilityRole="tablist" accessibilityLabel={t('letters.paper.tools')}>
      {TOOLS.map((each, i) => {
        const active = each === tool;
        // Each tool takes half the gaps beside it, and the end ones reach the bar's own edge.
        const atLeft = mirrored ? i === TOOLS.length - 1 : i === 0;
        const atRight = mirrored ? i === 0 : i === TOOLS.length - 1;
        const reach = { top: BAR_PAD, bottom: BAR_PAD, left: atLeft ? BAR_PAD : BAR_GAP / 2, right: atRight ? BAR_PAD : BAR_GAP / 2 };
        const locked = each === 'draw' && !canDraw;
        // The active tool is solid ink, like the segmented controls.
        const tint = active ? colors.textOnPrimary : colors.textSecondary;
        return (
          <PressableScale
            key={each}
            onPress={() => {
              if (!active) haptic('select');
              onTool(each);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active, disabled: locked }}
            accessibilityLabel={name[each]}
            accessibilityHint={locked ? t('letters.paper.drawLocked') : undefined}
            testID={`letter-tool-${each}`}
            hitSlop={reach}
            style={[styles.barItem, active ? { backgroundColor: colors.primary } : null, locked ? styles.locked : null]}
          >
            {each === 'draw' ? locked ? <Icon name="lock" size={17} color={tint} /> : <Glyph kind="draw" color={tint} /> : <Icon name={TOOL_ICON[each]} size={17} color={tint} />}
            <Text maxFontSizeMultiplier={fontScaleCap.fixedBox} numberOfLines={1} style={[styles.barText, { color: tint }, active ? styles.barTextOn : null]}>
              {name[each]}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const TOOL_ICON: Record<Exclude<PaperTool, 'draw'>, IconName> = { write: 'pencil', text: 'text-t', paper: 'note' };

/** The tool bar's padding and the gap between its tools, as `styles.bar` draws them. */
const BAR_PAD = 3;
const BAR_GAP = 2;

/**
 * Choices sit 2pt apart and their rows at least 4pt apart; each answers taps in its half of the gaps around it, so
 * no gap is dead and none reaches into a neighbour.
 */
const ROW_GAP = 2;
const ROWS_APART = 4;

/** A named group of choices that scrolls sideways when wider than the phone, starting from the right in right-to-left languages. */
export function SwatchRow({ label, shown = false, children, testID }: { label: string; shown?: boolean; children: ReactNode; testID?: string }): React.JSX.Element {
  const dir = useDirection();
  const { colors } = useTheme();
  const mirrored = dir.row === 'row-reverse';
  const scroller = useRef<ScrollView>(null);
  return (
    <View style={styles.rowBlock}>
      {/* A visible label where rows of similar choices sit together; the row is a group by that name either way. */}
      {shown ? (
        <Text {...HIDDEN} style={[styles.rowLabel, dir.text, { color: colors.textSecondary }]}>
          {label}
        </Text>
      ) : null}
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          if (mirrored) scroller.current?.scrollToEnd({ animated: false });
        }}
        contentContainerStyle={[styles.row, { flexDirection: dir.row }]}
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        testID={testID}
      >
        {children}
      </ScrollView>
    </View>
  );
}

/** One choice in a row: a fingertip-wide round, ringed in the ink when chosen. */
export function Choice({
  label,
  checked,
  onPress,
  disabled = false,
  children,
  testID,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
  disabled?: boolean;
  children: ReactNode;
  testID?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <ReachGroup gap={ROW_GAP} rowGap={ROWS_APART}>
      <PressableScale
        reach="open"
        onPress={() => {
          if (!checked) haptic('select');
          onPress();
        }}
        disabled={disabled}
        accessibilityRole="radio"
        accessibilityState={{ checked, disabled }}
        accessibilityLabel={label}
        testID={testID}
        style={[styles.choice, { borderColor: checked ? colors.primary : 'transparent' }, disabled ? styles.locked : null]}
      >
        {children}
      </PressableScale>
    </ReachGroup>
  );
}

/** A square tool button for actions rather than choices: undo, redo, clear, delete. */
export function ToolAction({
  label,
  onPress,
  disabled = false,
  children,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  children: ReactNode;
  testID?: string;
}): React.JSX.Element {
  return (
    <ReachGroup gap={ROW_GAP} rowGap={ROWS_APART}>
      <PressableScale
        reach="open"
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityLabel={label}
        testID={testID}
        style={[styles.action, disabled ? styles.locked : null]}
      >
        {children}
      </PressableScale>
    </ReachGroup>
  );
}

/** A paint dot on a round of the paper it will go on, so white or sand paint shows on a pale screen. */
export function PaintDot({ paint, tone, size = 26 }: { paint: Paint; tone: PaperTone; size?: number }): React.JSX.Element {
  const { colors } = useTheme();
  const sheet = paperColors({ style: 'plain', tone, ink: 'navy' });
  return (
    <View {...HIDDEN} style={[styles.dotRound, { width: size + 6, height: size + 6, backgroundColor: sheet.sheet, borderColor: colors.separator }]}>
      <View style={[styles.dot, { width: size, height: size, backgroundColor: paintColor(paint, tone) }]} />
    </View>
  );
}

/** A tool as a sample stroke in the chosen colour on a square of the paper: fine pen, soft wide brush, translucent marker. */
export function ToolSample({ tool, paint, tone }: { tool: DrawTool; paint: Paint; tone: PaperTone }): React.JSX.Element {
  const sheet = paperColors({ style: 'plain', tone, ink: 'navy' });
  const color = paintColor(paint, tone);
  const look = STROKE_LOOK[tool];
  const width = { pen: 2.2, brush: 7, marker: 6 }[tool];
  const d = 'M6 22 C 10 10, 15 10, 18 17 S 26 25, 30 12';
  return (
    <View {...HIDDEN} style={[styles.sample, { backgroundColor: sheet.sheet, borderColor: sheet.edge }]}>
      <Svg width={36} height={34} viewBox="0 0 36 34">
        {look.halo ? <Path d={d} stroke={color} strokeWidth={width * look.halo.width} strokeOpacity={look.halo.opacity} fill="none" strokeLinecap="round" /> : null}
        <Path d={d} stroke={color} strokeWidth={width} strokeOpacity={look.opacity} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

/** A size as the dot it draws, relative to the tool's widest. */
export function SizeDot({ tool, size, paint, tone }: { tool: DrawTool; size: PenSize; paint: Paint; tone: PaperTone }): React.JSX.Element {
  const most = PEN_WIDTHS[tool].l;
  const across = 5 + (PEN_WIDTHS[tool][size] / most) * 15;
  return (
    <View {...HIDDEN} style={styles.sizeBox}>
      <View style={[styles.dot, { width: across, height: across, backgroundColor: paintColor(paint, tone), opacity: STROKE_LOOK[tool].opacity }]} />
    </View>
  );
}

/** A miniature sheet: its tone, its lines, and a stroke of its ink across the top. */
export function MiniSheet({ paper }: { paper: LetterPaper }): React.JSX.Element {
  const c = paperColors(paper);
  const rules = [14, 20, 26, 32, 38];
  let lines: React.JSX.Element | null = null;
  if (paper.style === 'lined' || paper.style === 'margin') {
    lines = <Path d={rules.map((y) => `M2 ${y}H28`).join('')} stroke={c.rule} strokeWidth={1} fill="none" />;
  } else if (paper.style === 'grid') {
    const at = [5, 10, 15, 20, 25];
    const across = [10, 15, 20, 25, 30, 35, 40].map((y) => `M0 ${y}H30`).join('');
    lines = <Path d={across + at.map((x) => `M${x} 0V42`).join('')} stroke={c.grid} strokeWidth={0.8} fill="none" />;
  } else if (paper.style === 'dotted') {
    lines = (
      <>
        {rules.flatMap((y) => [6, 12, 18, 24].map((x) => <Circle key={`${x}-${y}`} cx={x} cy={y} r={0.9} fill={c.dot} />))}
      </>
    );
  }
  return (
    <View {...HIDDEN}>
      <Svg width={30} height={42} viewBox="0 0 30 42">
        <Rect x={0.5} y={0.5} width={29} height={41} rx={2} fill={c.sheet} stroke={c.edge} strokeWidth={1} />
        {lines}
        {paper.style === 'margin' ? <Path d="M7 0V42" stroke={c.margin} strokeWidth={1} /> : null}
        <Path d="M9 9 q2 -3 4 0 t4 0 t4 0" stroke={c.ink} strokeWidth={1.3} fill="none" strokeLinecap="round" />
      </Svg>
    </View>
  );
}

/** An ink as a looped stroke on a round of the sheet: a stroke rather than letters, so it is the same in every script. */
export function InkSample({ ink, tone }: { ink: Ink; tone: PaperTone }): React.JSX.Element {
  const c = paperColors({ style: 'plain', tone, ink });
  return (
    <View {...HIDDEN} style={[styles.inkRound, { backgroundColor: c.sheet, borderColor: c.edge }]}>
      <Svg width={24} height={14} viewBox="0 0 24 14">
        <Path d="M1 10 C 3 2, 6 2, 6 7 S 9 12, 11 6 S 14 2, 15 8 S 19 12, 23 5" stroke={c.ink} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

/** Glyphs the icon set lacks, drawn in its style (fine round-ended lines): Draw's stroke, and undo and redo arrows. */
export function Glyph({ kind, color, size = 17 }: { kind: 'draw' | 'undo' | 'redo'; color: string; size?: number }): React.JSX.Element {
  const d =
    kind === 'draw'
      ? 'M3 17 C 6 8, 10 7, 11 12 S 16 19, 21 6'
      : kind === 'undo'
        ? 'M8 5 L4 9 L8 13 M4 9 H14.5 A5.5 5.5 0 0 1 14.5 20 H10'
        : 'M16 5 L20 9 L16 13 M20 9 H9.5 A5.5 5.5 0 0 0 9.5 20 H14';
  return (
    <View {...HIDDEN}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d={d} stroke={color} strokeWidth={1.9} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderRadius: radii.md, padding: BAR_PAD, gap: BAR_GAP },
  barItem: { flex: 1, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: radii.sm, paddingHorizontal: 2, paddingVertical: 4 },
  barText: { fontSize: typography.sizes.text, fontWeight: typography.weights.medium },
  barTextOn: { fontWeight: typography.weights.semibold },
  locked: { opacity: 0.45 },
  rowBlock: { gap: 2 },
  rowLabel: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  row: { alignItems: 'center', gap: 2, paddingVertical: 2 },
  choice: { minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center', padding: 2, borderWidth: 2, borderRadius: radii.md },
  action: { minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md },
  dotRound: { alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth },
  dot: { borderRadius: radii.pill },
  sample: { width: 36, height: 34, borderRadius: radii.xs, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  sizeBox: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  inkRound: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth },
});
