import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type TextStyle } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { scriptDialect, type PromptToken } from '@kurda/shared';
import { useI18n } from '../../i18n/I18nContext';
import { MenuIn } from '../../theme/MotionParts';
import { useTheme } from '../../theme/ThemeProvider';
import { TILE_EDGE, tileTone } from '../../theme/tileTones';
import { layout, radii, spacing, typography } from '../../theme/tokens';

/** The dotted line under a word that can be asked about. */
const DOTS = 3;

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
 */
export function PromptWords({ prompt, tokens, style }: { prompt: string; tokens?: PromptToken[]; style?: StyleProp<TextStyle> }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const screen = useWindowDimensions();
  const words = useRef<Array<View | null>>([]);
  const [open, setOpen] = useState<Opened | null>(null);
  const [width, setWidth] = useState(0);
  // a prompt in Arabic script (Soranî) reads from the right
  const rtl = scriptDialect(prompt) === 'sorani';
  const direction: TextStyle = rtl ? styles.rtl : styles.ltr;
  const { face, edge } = tileTone(colors, 'idle');

  if (!tokens || !tokens.some((token) => token.meanings && token.meanings.length > 0)) {
    return <Text style={[style, direction]}>{prompt}</Text>;
  }

  const show = (index: number): void => {
    const word = words.current[index];
    if (!word) return;
    setWidth(0);
    word.measureInWindow((x, y, w, h) => setOpen({ index, x, y, w, h }));
  };
  const close = (): void => setOpen(null);

  const meanings = open ? (tokens[open.index]?.meanings ?? []) : [];
  // under the word and centred on it, kept inside the screen's margins; placed once its own width is known
  const left = open && width > 0 ? Math.max(layout.gutter, Math.min(screen.width - layout.gutter - width, open.x + open.w / 2 - width / 2)) : 0;
  const arrowAt = open ? open.x + open.w / 2 - left - ARROW / 2 : 0;

  return (
    <>
      <View style={[styles.words, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        {tokens.map((token, i) =>
          token.meanings && token.meanings.length > 0 ? (
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
            >
              <Text style={[style, direction]}>{token.text}</Text>
              {/* laid over the word's width rather than given one, so the word alone decides how wide it is */}
              <View style={styles.dots}>
                <Svg width="100%" height={DOTS} style={StyleSheet.absoluteFill}>
                  <Line x1="1" y1={DOTS / 2} x2="100%" y2={DOTS / 2} stroke={colors.textSecondary} strokeWidth={2} strokeDasharray="2 4" strokeLinecap="round" />
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
                    style={[styles.meaning, i > 0 && { borderTopWidth: TILE_EDGE, borderTopColor: edge }, { color: colors.textPrimary }]}
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
    borderLeftWidth: TILE_EDGE,
    borderTopWidth: TILE_EDGE,
    transform: [{ rotate: '45deg' }],
    zIndex: 1,
  },
  list: { borderWidth: TILE_EDGE, borderRadius: radii.md, overflow: 'hidden' },
  meaning: {
    fontSize: typography.sizes.md,
    textAlign: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
  },
});
