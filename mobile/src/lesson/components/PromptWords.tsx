import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type TextStyle } from 'react-native';
import { Pressable } from '../../theme/Pressable';
import Svg, { Line } from 'react-native-svg';
import { scriptDialect, type NewWord, type PromptToken } from '@kurda/shared';
import { useI18n } from '../../i18n/I18nContext';
import { MenuIn, heldDim } from '../../theme/MotionParts';
import { useTheme } from '../../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../../theme/tokens';
import { useValley } from '../ValleyScope';
import { CARD } from '../valley';
import { aroundGap, glossTokens, type GlossToken } from '../asks';

/** The popover's edge, and the rule between two meanings in it: the lesson's hairline. */
const EDGE = CARD.edge;

/** The dotted line under a word that can be asked about. */
const DOTS = 3;

/** The dots under a word the item brings in for the first time: a little heavier, closer set, in the gold of the badge that says so. */
const FRESH_DOTS = { width: 2.5, dash: '3 3' } as const;
const DOTS_AS_EVER = { width: 2, dash: '2 4' } as const;

/** The popover's arrow: a square turned to a point, half of it showing. */
const ARROW = 12;

interface Opened {
  index: number;
  /** the word's place on the screen */
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A prompt whose words can be asked about. When the course knows what a word
 * means (`promptTokens`), the word is underlined with dots, and a tap opens a
 * small popover under it listing its meanings, with an arrow pointing at the
 * word; a tap anywhere else closes it. For a screen reader each such word is a
 * button whose hint reads the meanings. A prompt with no meanings is just its
 * text, as it always was.
 *
 * Soranî reads from the right: its words, and the lines they wrap onto, start
 * there.
 *
 * The words an item brings in for the first time (`newWords`) lead with the
 * meaning the item gives them, and their dots are a little heavier and in
 * gold, the colour of the badge over the question that says there is a new
 * word in it. A line with a gap in it (a 'missing' item) has `gap` drawn in
 * the gap's place, between the words either side.
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
  /** what stands in the line's gap (`GAP`): the slot the chosen or typed word goes in */
  gap?: ReactNode;
  style?: StyleProp<TextStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const screen = useWindowDimensions();
  const words = useRef<Array<View | null>>([]);
  const [open, setOpen] = useState<Opened | null>(null);
  const [width, setWidth] = useState(0);
  // a prompt in Arabic script (Soranî) reads from the right
  const rtl = scriptDialect(prompt) === 'sorani';
  const direction: TextStyle = rtl ? styles.rtl : styles.ltr;
  const valley = useValley();
  const face = valley.card;
  const edge = valley.line;
  const glossed = useMemo(() => glossTokens(prompt, tokens, newWords), [prompt, tokens, newWords]);
  // the line's words in order, and the gap among them where it has one and something is to stand in it
  const pieces = useMemo<Array<GlossToken | null>>(() => {
    const around = gap !== undefined ? aroundGap(glossed) : null;
    return around ? [...around.before, null, ...around.after] : glossed;
  }, [glossed, gap]);
  const hasGap = pieces.includes(null);

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
  // under the word and centred on it, kept inside the screen's margins; placed once its own width is known
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
              hitSlop={{ top: 8, bottom: 8 }}
              style={({ pressed }) => pressed && heldDim}
            >
              <Text style={[style, direction]}>{token.text}</Text>
              {/* laid over the word's width rather than given one, so the word alone decides how wide it is */}
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
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  words: { flexWrap: 'wrap', alignItems: 'flex-start' },
  dots: { height: DOTS, marginTop: 1 },
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
    fontSize: typography.sizes.md,
    textAlign: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
  },
});
