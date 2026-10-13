import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { specialKeys, type TypingDialect } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';

/**
 * The letters a keyboard may not have, as keys: ç ê î ş û for Kurmancî, the
 * Soranî letters for Soranî (`@kurda/shared` `specialKeys`, the same set the
 * lessons offer).
 *
 * Each key is a full 44pt target and the row wraps, so twelve Soranî letters
 * fit a narrow phone instead of running off its edge. A key never takes the
 * focus from the text box it types into: it is a plain pressable, not a field,
 * so the phone's keyboard stays up and the next key goes on where this one
 * left off.
 *
 * Kurmancî gets a shift key, because a race text starts its sentences with
 * capitals and Ş is not on an English keyboard either. It capitalises the next
 * letter only, the way a phone's own shift does.
 */
export function KeyBar({
  dialect,
  onKey,
  keys = specialKeys(dialect),
  withShift = true,
  disabled = false,
  style,
}: {
  dialect: TypingDialect;
  onKey: (letter: string) => void;
  /** the letters, when not the variety's usual set (the lessons keep their own order) */
  keys?: readonly string[];
  /** a shift key for Kurmancî capitals; a lesson answer is not case-sensitive */
  withShift?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [shift, setShift] = useState(false);
  const sorani = dialect === 'sorani';

  return (
    <View
      style={[styles.bar, sorani && styles.rtl, style]}
      accessibilityLabel={t('keyboard.bar.label')}
      accessibilityRole="toolbar"
    >
      {keys.map((key) => {
        const letter = shift ? key.toUpperCase() : key;
        return (
          <Pressable
            key={key}
            disabled={disabled}
            onPress={() => {
              onKey(letter);
              setShift(false);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('keyboard.bar.type', { letter })}
            style={({ pressed }) => [
              styles.key,
              { backgroundColor: pressed ? colors.glassBorder : colors.controlTrack },
              disabled && styles.off,
            ]}
          >
            <Text style={[styles.keyText, sorani && styles.soraniText, { color: colors.textPrimary }]}>{letter}</Text>
          </Pressable>
        );
      })}
      {!sorani && withShift ? (
        <Pressable
          disabled={disabled}
          onPress={() => setShift((s) => !s)}
          accessibilityRole="button"
          accessibilityLabel={t('keyboard.bar.shift')}
          accessibilityState={{ selected: shift, disabled }}
          style={[
            styles.key,
            { backgroundColor: shift ? colors.primary : colors.controlTrack },
            disabled && styles.off,
          ]}
        >
          <Text style={[styles.keyText, { color: shift ? colors.textOnPrimary : colors.textPrimary }]}>⇧</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.xs },
  // Soranî letters in the order a Soranî reader expects them: from the right
  rtl: { flexDirection: 'row-reverse' },
  key: {
    minWidth: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold },
  soraniText: { writingDirection: 'rtl' },
  off: { opacity: 0.5 },
});
