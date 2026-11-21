import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type TextStyle } from 'react-native';
import { Pressable, ReachReset } from '../../theme/Pressable';
import Svg, { Line } from 'react-native-svg';
import { scriptDialect, type NewWord, type PromptToken } from '@kurda/shared';
import { reachSlop, type HitSlop } from '../../a11y/a11y';
import { useI18n } from '../../i18n/I18nContext';
import { MenuIn, heldDim } from '../../theme/MotionParts';
import { useTheme } from '../../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../../theme/tokens';
import { useValley } from '../ValleyScope';
import { CARD } from '../valley';
import { aroundGap, glossTokens, type GlossToken } from '../asks';

/** The popover's edge and the rule between meanings: the lesson's hairline. */
const EDGE = CARD.edge;

/** The dotted underline's thickness, and its distance from the word. */
const DOTS = 3;
const DOTS_GAP = 1;

/** The dots under a new word: slightly heavier and closer set, in the gold of the "New word" badge. */
const FRESH_DOTS = { width: 2.5, dash: '3 3' } as const;
const DOTS_AS_EVER = { width: 2, dash: '2 4' } as const;

/** The popover's arrow: a rotated square, half showing. */
const ARROW = 12;

/**
 * How far a word answers past its text and dots. Words in a line touch and wrapped lines sit flush, so a word
 * reaches neither sideways nor up, only down by half of what 48 points lacks. Below another line that reach lies
 * under words that answer there themselves, so it only matters below the last line or beside a shorter one. None
 * when the line height is unknown.
 */
function wordReach(lineHeight: number | undefined): HitSlop | undefined {
  return lineHeight === undefined ? undefined : reachSlop(null, lineHeight + DOTS_GAP + DOTS, { limit: { top: 0 } });
}

interface Opened {
  index: number;
  /** The word's position on screen. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A prompt whose words can be looked up. A word with known meanings (`promptTokens`) has a dotted underline, and a
 * tap opens a popover under it listing them; tapping elsewhere closes it. For screen readers each such word is a
 * button whose hint reads the meanings. Soranî lines start from the right. New words (`newWords`) lead with the
 * item's meaning and have heavier gold dots. A 'missing' item draws `gap` in the gap's place.
 */
export function PromptWords({
  prompt,
  tokens,
  newWords,
  gap,
  style,
}: {
  prompt: string;
  tokens?: PromptToken[];
  newWords?: NewWord[];
  /** What stands in the line's gap (`GAP`): the slot for the chosen or typed word. */
  gap?: ReactNode;
  style?: StyleProp<TextStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const screen = useWindowDimensions();
  const words = useRef<Array<View | null>>([]);
  const [open, setOpen] = useState<Opened | null>(null);
  const [width, setWidth] = useState(0);
  // An Arabic-script prompt (Soranî) reads from the right.
  const rtl = scriptDialect(prompt) === 'sorani';
  const direction: TextStyle = rtl ? styles.rtl : styles.ltr;
  const valley = useValley();
  const face = valley.card;
  const edge = valley.line;
  const glossed = useMemo(() => glossTokens(prompt, tokens, newWords), [prompt, tokens, newWords]);
  // The line's words in order, with the gap among them where there is one and something to fill it.
  const pieces = useMemo<Array<GlossToken | null>>(() => {
    const around = gap !== undefined ? aroundGap(glossed) : null;
    return around ? [...around.before, null, ...around.after] : glossed;
  }, [glossed, gap]);
  const hasGap = pieces.includes(null);
  const reach = wordReach(StyleSheet.flatten(style)?.lineHeight);

  if (!hasGap && !glossed.some((token) => token.meanings && token.meanings.length > 0)) {
    return <Text style={[style, direction]}>{prompt}</Text>;
  }

  const show = (index: number): void => {
    const word = words.current[index];
    if (!word) return;
    setWidth(0);
    word.measureInWindow((x, y, w, h) => setOpen({ index, x, y, w, h }));
  };
  const close = (): void => setOpen(null);

  const meanings = open ? (pieces[open.index]?.meanings ?? []) : [];
  // Centred under the word and kept within the screen's margins; placed once its own width is known.
  const left = open && width > 0 ? Math.max(layout.gutter, Math.min(screen.width - layout.gutter - width, open.x + open.w / 2 - width / 2)) : 0;
  const arrowAt = open ? open.x + open.w / 2 - left - ARROW / 2 : 0;

  return (
    <>
      <View style={[styles.words, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        {pieces.map((token, i) =>
          token === null ? (
            <View key="gap">{gap}</View>
          ) : token.meanings && token.meanings.length > 0 ? (
            <Pressable
              key={i}
              ref={(el) => {
                words.current[i] = el;
              }}
              onPress={() => show(i)}
              accessibilityRole="button"
              accessibilityLabel={token.text}
              accessibilityHint={token.meanings.join(', ')}
              hitSlop={reach}
              style={({ pressed }) => pressed && heldDim}
            >
              <Text style={[style, direction]}>{token.text}</Text>
              {/* Laid over the word rather than sized, so the word alone decides the width. */}
              <View style={styles.dots}>
                <Svg width="100%" height={DOTS} style={StyleSheet.absoluteFill}>
                  <Line
                    x1="1"
                    y1={DOTS / 2}
                    x2="100%"
                    y2={DOTS / 2}
                    stroke={token.fresh ? colors.goldText : colors.textSecondary}
                    strokeWidth={(token.fresh ? FRESH_DOTS : DOTS_AS_EVER).width}
                    strokeDasharray={(token.fresh ? FRESH_DOTS : DOTS_AS_EVER).dash}
                    strokeLinecap="round"
                    testID={token.fresh ? 'fresh-word-dots' : undefined}
                  />
                </Svg>
              </View>
            </Pressable>
          ) : (
            <Text key={i} style={[style, direction]}>
              {token.text}
            </Text>
          ),
        )}
      </View>
      <Modal visible={open !== null} transparent animationType="none" onRequestClose={close}>
        {/* The popover covers the whole screen, so no reach group round the prompt caps it. */}
        <ReachReset>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel={t('common.close')} />
          {open ? (
            <View
              style={[styles.popover, { top: open.y + open.h + ARROW / 2 + 2, left, opacity: width > 0 ? 1 : 0 }]}
              onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
              testID="prompt-meanings"
            >
              <MenuIn>
                <View style={[styles.arrow, { left: arrowAt, backgroundColor: face, borderColor: edge }]} />
                <View style={[styles.list, { backgroundColor: face, borderColor: edge }]}>
                  {meanings.map((meaning, i) => (
                    <Text
                      key={meaning}
                      style={[styles.meaning, i > 0 && { borderTopWidth: EDGE, borderTopColor: edge }, { color: colors.textPrimary }]}
                    >
                      {meaning}
                    </Text>
                  ))}
                </View>
              </MenuIn>
            </View>
          ) : null}
        </ReachReset>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  words: { flexWrap: 'wrap', alignItems: 'flex-start' },
  dots: { height: DOTS, marginTop: DOTS_GAP },
  ltr: { writingDirection: 'ltr' },
  rtl: { writingDirection: 'rtl', textAlign: 'right' },
  popover: { position: 'absolute', maxWidth: 280, minWidth: 120 },
  arrow: {
    position: 'absolute',
    top: -ARROW / 2,
    width: ARROW,
    height: ARROW,
    borderLeftWidth: EDGE,
    borderTopWidth: EDGE,
    transform: [{ rotate: '45deg' }],
    zIndex: 1,
  },
  list: { borderWidth: EDGE, borderRadius: radii.md, overflow: 'hidden' },
  meaning: {
    fontSize: typography.sizes.text,
    textAlign: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
  },
});
