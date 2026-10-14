import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { radii, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { Icon } from '../theme/Icon';
import { useKeyboardPrefs } from '../keyboard/prefs';
import { DEL, ENTER, keyboardRows, keyFeedback, type Feedback } from './board';
import { feedbackColor, feedbackWord } from './WordleBoard';

/** The gap between keys; half of it on either side is still the key's to tap. */
const GAP = 6;
/** Taller than the 44pt minimum: a key is tapped fast and often. */
const KEY_HEIGHT = 52;

/**
 * The Kurmancî keyboard, coloured by what each letter has scored so far.
 *
 * QWERTY with ç ê î ş û as full keys on a row of their own, or the alphabet
 * in order (Settings → Keyboard and accents) — the same layout the browser
 * draws. Every row stretches across the whole width, so a letter key is as
 * wide as the phone allows (about 33pt on a 390pt phone, the five Kurdish
 * letters twice that), and each key's touch area takes in half the gap beside
 * it, so there is nowhere between two keys that is neither.
 *
 * A key only ever upgrades — grey to yellow to green, never back — and a screen
 * reader hears the letter with how it scored: "ê, in the word, wrong place".
 */
export function WordleKeyboard({
  keyboard,
  onKey,
  disabled = false,
  style,
}: {
  keyboard: Record<string, Feedback>;
  onKey: (key: string) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [prefs] = useKeyboardPrefs();
  const rows = keyboardRows(prefs.wordleLayout);

  return (
    <View style={[styles.keyboard, style]} accessibilityLabel={t('games.wordle.keyboard')}>
      {rows.map((row, ri) => {
        // QWERTY's middle row sits half a key in, as on every phone; every
        // other row, the Kurdish letters' included, fills the width
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
                  accessibilityState={{ disabled }}
                  disabled={disabled}
                  hitSlop={GAP / 2}
                  style={({ pressed }) => [
                    styles.key,
                    { flex: weight(key) },
                    {
                      backgroundColor: fb ? feedbackColor(fb, colors) : control ? colors.glassBorder : colors.controlTrack,
                      opacity: disabled ? 0.55 : pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  {key === DEL ? (
                    <Icon name="backspace" size={22} color={colors.textPrimary} />
                  ) : key === ENTER ? (
                    <Icon name="key-return" size={22} color={colors.textPrimary} />
                  ) : (
                    <Text style={[styles.keyText, { color: fb ? colors.textOnPrimary : colors.textPrimary }]}>
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
