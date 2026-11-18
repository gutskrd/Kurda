import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { fontScaleCap, radii, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { Icon } from '../theme/Icon';
import { useKeyboardPrefs } from '../keyboard/prefs';
import { DEL, ENTER, keyboardRows, keyFeedback, type Feedback } from './board';
import { feedbackColor, feedbackInk, feedbackWord } from './WordleBoard';
import { pressedDim } from '../theme/motion';

/** The gap between keys; half of it on either side is still the key's to tap. */
const GAP = 6;
/** Taller than the 44pt minimum: a key is tapped fast and often. */
const KEY_HEIGHT = 52;

/**
 * The Kurmancî keyboard, coloured by each letter's best score so far. QWERTY with ç ê î ş û as full keys on their
 * own row, or alphabetical (Settings → Keyboard and accents), as on the web. Every row spans the width, so keys
 * are as wide as possible (about 33 pt on a 390 pt phone, the Kurdish letters twice that), and each key's touch
 * area takes half the gap beside it, leaving no dead space.
 *
 * A key's colour only upgrades (grey, yellow, green), and screen readers hear the letter with its score ("ê, in
 * the word, wrong place"). While a guess is checking (`checking`) keys ignore presses and Enter shows a spinner
 * in place of its arrow; `disabled` is for a board no longer in play (a finished battle), and that fades.
 */
export function WordleKeyboard({
  keyboard,
  onKey,
  disabled = false,
  checking = false,
  style,
}: {
  keyboard: Record<string, Feedback>;
  onKey: (key: string) => void;
  disabled?: boolean;
  /** A guess is being scored: no key is taken, and Enter says so. */
  checking?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [prefs] = useKeyboardPrefs();
  const rows = keyboardRows(prefs.wordleLayout);

  return (
    <View style={[styles.keyboard, style]} accessibilityLabel={t('games.wordle.keyboard')}>
      {rows.map((row, ri) => {
        // QWERTY's middle row sits half a key in, as on every phone; every other row, the Kurdish letters'
        // included, fills the width.
        const inset = prefs.wordleLayout === 'qwerty' && ri === 1 ? 0.5 : 0;
        return (
          <View key={ri} style={styles.keyRow}>
            {inset > 0 ? <View style={{ flex: inset }} /> : null}
            {row.map((key) => {
              const fb = keyFeedback(keyboard, key);
              const control = key === ENTER || key === DEL;
              const label = control
                ? key === ENTER
                  ? t('games.wordle.enter')
                  : t('games.wordle.backspace')
                : fb
                  ? `${key}, ${feedbackWord(fb, t)}`
                  : key;
              return (
                <Pressable
                  key={key}
                  onPress={() => onKey(key)}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ disabled, busy: checking && key === ENTER }}
                  disabled={disabled || checking}
                  hitSlop={GAP / 2}
                  style={({ pressed }) => [
                    styles.key,
                    { flex: weight(key) },
                    {
                      backgroundColor: fb ? feedbackColor(fb, colors) : control ? colors.glassBorder : colors.controlTrack,
                      opacity: disabled ? 0.55 : pressed ? pressedDim : 1,
                    },
                  ]}
                >
                  {key === DEL ? (
                    <Icon name="backspace" size={22} color={colors.textPrimary} />
                  ) : key === ENTER ? (
                    checking ? (
                      <ActivityIndicator color={colors.textPrimary} testID="peyvok-checking" />
                    ) : (
                      <Icon name="key-return" size={22} color={colors.textPrimary} />
                    )
                  ) : (
                    // A key is as wide as a tenth of the row: its letter grows only as far as still fits it.
                    <Text style={[styles.keyText, { color: feedbackInk(fb ?? null, colors) }]} maxFontSizeMultiplier={fontScaleCap.fixedBox}>
                      {key.toUpperCase()}
                    </Text>
                  )}
                </Pressable>
              );
            })}
            {inset > 0 ? <View style={{ flex: inset }} /> : null}
          </View>
        );
      })}
    </View>
  );
}

/** How many letter widths a key takes: Enter and Delete one and a half. */
function weight(key: string): number {
  return key === ENTER || key === DEL ? 1.5 : 1;
}

const styles = StyleSheet.create({
  keyboard: { gap: GAP, alignSelf: 'stretch', width: '100%', maxWidth: 560 },
  keyRow: { flexDirection: 'row', gap: GAP },
  key: {
    height: KEY_HEIGHT,
    minWidth: 0,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
});
