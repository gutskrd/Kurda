import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, TextInput, View, type ReturnKeyTypeOptions, type StyleProp, type ViewStyle } from 'react-native';
import { Pressable } from './Pressable';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { Icon } from './Icon';
import { useTheme } from './ThemeProvider';
import { radii, spacing, typography } from './tokens';
import { pressedDim } from './motion';
import { floating } from './floating';

/**
 * A search field: a magnifier, the text, and a clear button once there is text. The one field for every search
 * (Messages, Search, the shop, the gift picker, profile items, the stories library), 44 tall with a fingertip-wide
 * clear button. Clearing keeps the cursor and keyboard, ready for the next search, as system search fields do.
 */
export const SearchField = forwardRef<TextInput, {
  value: string;
  onChangeText: (text: string) => void;
  /** What the field is for, read to screen readers and shown until something is typed. */
  label: string;
  placeholder?: string;
  onSubmit?: () => void;
  returnKeyType?: ReturnKeyTypeOptions;
  autoFocus?: boolean;
  /** The most that can be typed, where the search has a limit. */
  maxLength?: number;
  /** The search page's own field: rounded in the bar's fill and floating slightly off the page like the back button beside it. */
  floating?: boolean;
  /** Where the field sits (a margin), not how it looks. */
  style?: StyleProp<ViewStyle>;
}>(function SearchField({ value, onChangeText, label, placeholder, onSubmit, returnKeyType = 'search', autoFocus, maxLength, floating: lifted = false, style }, ref) {
  const { colors } = useTheme();
  const input = useRef<TextInput>(null);
  useImperativeHandle(ref, () => input.current as TextInput);
  const { t } = useI18n();
  const dir = useDirection();
  const clearable = value.length > 0;
  // The magnifier side always has its inset; the other side has the clear button's 44 points, or its own inset when
  // there is nothing to clear.
  const lead = spacing.md - 4;
  const inset = dir.row === 'row-reverse'
    ? { paddingRight: lead, paddingLeft: clearable ? 0 : lead }
    : { paddingLeft: lead, paddingRight: clearable ? 0 : lead };
  return (
    <View
      style={[
        styles.field,
        inset,
        { backgroundColor: colors.controlTrack, flexDirection: dir.row },
        lifted && [styles.lifted, floating.control, { backgroundColor: colors.barFill, shadowColor: colors.softShadow }],
        style,
      ]}
    >
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
        maxLength={maxLength}
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
          style={({ pressed }) => [styles.clear, { opacity: pressed ? pressedDim : 1 }]}
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
  lifted: { borderRadius: radii.pill },
  input: { flex: 1, fontSize: typography.sizes.md, minHeight: MIN_TOUCH_TARGET, paddingVertical: 0 },
  clear: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
});
