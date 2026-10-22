import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View, type ReturnKeyTypeOptions, type StyleProp, type ViewStyle } from 'react-native';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { Icon } from './Icon';
import { useTheme } from './ThemeProvider';
import { radii, spacing, typography } from './tokens';

/**
 * A search field: a magnifier, the words, and a clear button once there are
 * words to clear.
 *
 * Messages filters its own list with one and Search asks the server with
 * another, and they looked different — one with a clear button and one
 * without, at two heights. Same field now, 44 tall, with the clear button a
 * fingertip wide.
 *
 * Clearing leaves the cursor in the field with the keyboard up, ready for the
 * next search, as a phone's own search fields do.
 */
export const SearchField = forwardRef<TextInput, {
  value: string;
  onChangeText: (text: string) => void;
  /** What the field is for, said to a screen reader and shown until something is typed. */
  label: string;
  placeholder?: string;
  onSubmit?: () => void;
  returnKeyType?: ReturnKeyTypeOptions;
  autoFocus?: boolean;
  /** where the field sits (a margin), not how it looks */
  style?: StyleProp<ViewStyle>;
}>(function SearchField({ value, onChangeText, label, placeholder, onSubmit, returnKeyType = 'search', autoFocus, style }, ref) {
  const { colors } = useTheme();
  const input = useRef<TextInput>(null);
  useImperativeHandle(ref, () => input.current as TextInput);
  const { t } = useI18n();
  const dir = useDirection();
  const clearable = value.length > 0;
  // the magnifier's side always has its inset; the other side has the clear
  // button's own 44pt, or an inset of its own when there is nothing to clear
  const lead = spacing.md - 4;
  const inset = dir.row === 'row-reverse'
    ? { paddingRight: lead, paddingLeft: clearable ? 0 : lead }
    : { paddingLeft: lead, paddingRight: clearable ? 0 : lead };
  return (
    <View style={[styles.field, inset, { backgroundColor: colors.controlTrack, flexDirection: dir.row }, style]}>
      <Icon name="search" size={18} color={colors.textSecondary} />
      <TextInput
        ref={input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? label}
        placeholderTextColor={colors.textSecondary}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmit}
        autoFocus={autoFocus}
        accessibilityLabel={label}
        style={[styles.input, dir.text, { color: colors.textPrimary }]}
      />
      {clearable ? (
        <Pressable
          onPress={() => {
            onChangeText('');
            input.current?.focus();
          }}
          accessibilityRole="button"
          accessibilityLabel={t('search.clear')}
          style={({ pressed }) => [styles.clear, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Icon name="clear-fill" size={18} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  field: {
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.md,
  },
  input: { flex: 1, fontSize: typography.sizes.md, minHeight: MIN_TOUCH_TARGET, paddingVertical: 0 },
  clear: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
});
