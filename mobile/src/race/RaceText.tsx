import { memo, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import type { TypingComparison, TypingDialect } from '@kurda/shared';
import { radii, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import type { Palette } from '../theme/palette';
import { caretWord, splitWords, wordView, type WordView } from './words';

/**
 * The race text, coloured as it is typed: right, an accent left out (and
 * forgiven), wrong, or still to come — with the caret on the next character
 * and anything typed that the text does not have shown, struck through, where
 * it was typed.
 *
 * Drawn a word at a time (see words.ts), and `onCaretLine` says where the
 * caret's line is whenever it moves to another one, so the screen can keep it
 * in sight above the phone's keyboard.
 */
export function RaceText({
  text,
  dialect,
  comparison,
  finished,
  onCaretLine,
}: {
  /** the text as shown (`displayTarget`), one character per `comparison.chars` entry */
  text: string;
  dialect: TypingDialect;
  comparison: TypingComparison | null;
  finished: boolean;
  /** the caret's line, as a distance from the top of this view */
  onCaretLine?: (y: number) => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const words = useMemo(() => splitWords(text), [text]);
  const rtl = dialect === 'sorani';
  const lineOf = useRef(new Map<number, number>());
  const caretAt = caretWord(words, comparison?.caret ?? 0);
  const lastY = useRef<number | null>(null);

  // tell the screen when the caret reaches another line, not on every key
  useEffect(() => {
    const y = lineOf.current.get(caretAt);
    if (y === undefined || y === lastY.current) return;
    lastY.current = y;
    onCaretLine?.(y);
  }, [caretAt, onCaretLine]);

  return (
    <View style={[styles.text, rtl && styles.rtl]}>
      {words.map((word, w) => (
        <Word
          key={word.start}
          chars={word.chars}
          view={wordView(word, comparison, finished, w === words.length - 1)}
          rtl={rtl}
          colors={colors}
          onLayout={(e: LayoutChangeEvent) => {
            lineOf.current.set(w, e.nativeEvent.layout.y);
            if (w === caretAt && lastY.current === null) {
              lastY.current = e.nativeEvent.layout.y;
            }
          }}
        />
      ))}
    </View>
  );
}

const Word = memo(
  function Word({
    chars,
    view,
    rtl,
    colors,
    onLayout,
  }: {
    chars: string[];
    view: WordView;
    rtl: boolean;
    colors: Palette;
    onLayout: (e: LayoutChangeEvent) => void;
  }): React.JSX.Element {
    const extraAt = (i: number): string | null => view.extra.find((x) => x.at === i)?.text ?? null;
    const after = extraAt(chars.length);
    return (
      <View onLayout={onLayout}>
        <Text style={[styles.word, rtl && styles.wordRtl]}>
          {chars.map((ch, i) => {
            const extra = extraAt(i);
            const state = view.states[i];
            const here = i === view.caret;
            return (
              <Text key={i}>
                {extra ? <Text style={[styles.extra, { color: colors.danger }]}>{extra}</Text> : null}
                <Text
                  style={[
                    { color: charColor(state, colors) },
                    state === 'w' ? { backgroundColor: colors.dangerFill } : null,
                    state === 'a' ? styles.accent : null,
                    here ? [styles.caret, { backgroundColor: colors.primary, color: colors.textOnPrimary }] : null,
                  ]}
                >
                  {ch}
                </Text>
              </Text>
            );
          })}
          {after ? <Text style={[styles.extra, { color: colors.danger }]}>{after}</Text> : null}
        </Text>
      </View>
    );
  },
  (a, b) =>
    a.chars === b.chars &&
    a.rtl === b.rtl &&
    a.colors === b.colors &&
    a.view.states === b.view.states &&
    a.view.caret === b.view.caret &&
    JSON.stringify(a.view.extra) === JSON.stringify(b.view.extra),
);

/** right, an accent forgiven, wrong, still to come */
function charColor(state: string | undefined, c: Palette): string {
  return state === 'o' ? c.success : state === 'a' ? c.gold : state === 'w' ? c.danger : c.textSecondary;
}

const styles = StyleSheet.create({
  text: { flexDirection: 'row', flexWrap: 'wrap' },
  rtl: { flexDirection: 'row-reverse' },
  word: { fontSize: typography.sizes.lg, lineHeight: 32, letterSpacing: 0.2 },
  wordRtl: { writingDirection: 'rtl' },
  // forgiven, not wrong: underlined in the gold the app uses for "nearly"
  accent: { textDecorationLine: 'underline' },
  caret: { borderRadius: radii.xs },
  extra: { fontSize: typography.sizes.md, textDecorationLine: 'line-through' },
});
