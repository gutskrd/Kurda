import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { MIN_TOUCH_TARGET } from '../../a11y/a11y';
import { useI18n } from '../../i18n/I18nContext';
import { useDirection } from '../../reports/direction';
import { Icon } from '../../theme/Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { radii, spacing, typography } from '../../theme/tokens';
import type { StepTools } from './StepFlow';
import { heldDim } from '../../theme/MotionParts';

/** iOS wants its own vocabulary for the same four things Android names plainly. */
const TEXT_CONTENT_TYPE = {
  email: 'emailAddress',
  username: 'username',
  'current-password': 'password',
  'new-password': 'newPassword',
  none: undefined,
} as const;

/**
 * The one field of a step.
 *
 * Large, since it is the only thing on the screen to type in, and ready: it
 * takes the focus as its step arrives, so the keyboard is up without a tap,
 * and the keyboard's return key goes on the way the Continue button does
 * (`tools.submit`). Typing takes away the line under it that refused the last
 * answer (`tools.edited`). The question over it is its visible label; the
 * `label` is what a screen reader calls it.
 *
 * A secure field gets the eye, because a password you cannot read is a
 * password you mistype on a phone keyboard. `complete` tells the keychain and
 * the password manager what they may offer. In Soranî and Arabic the typing
 * and the eye start on the right.
 */
export function GuideField({
  tools,
  value,
  onChangeText,
  label,
  secure = false,
  keyboardType = 'default',
  complete,
  placeholder,
  last = false,
  testID,
}: {
  tools: StepTools;
  value: string;
  onChangeText: (next: string) => void;
  label: string;
  secure?: boolean;
  keyboardType?: 'default' | 'email-address';
  complete?: 'email' | 'username' | 'current-password' | 'new-password';
  placeholder?: string;
  /** the last field of the flow: the return key says Done rather than Next */
  last?: boolean;
  testID?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const mirrored = dir.row === 'row-reverse';
  const [reveal, setReveal] = useState(false);
  const refused = tools.error !== null;
  return (
    <View>
      <TextInput
        style={[
          styles.input,
          mirrored && styles.inputMirrored,
          secure ? (mirrored ? styles.inputRoomStart : styles.inputRoomEnd) : null,
          { backgroundColor: colors.controlTrack, borderColor: refused ? colors.danger : 'transparent', color: colors.textPrimary },
        ]}
        value={value}
        onChangeText={(next) => {
          tools.edited();
          onChangeText(next);
        }}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        secureTextEntry={secure && !reveal}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={keyboardType}
        autoComplete={complete}
        textContentType={TEXT_CONTENT_TYPE[complete ?? 'none']}
        accessibilityLabel={label}
        autoFocus
        returnKeyType={last ? 'done' : 'next'}
        onSubmitEditing={tools.submit}
        // the keyboard stays up between one step and the next, rather than dropping and coming back
        submitBehavior={last ? 'blurAndSubmit' : 'submit'}
        editable={!tools.busy}
        testID={testID}
      />
      {secure ? (
        <Pressable
          onPress={() => setReveal((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={reveal ? t('auth.hidePassword') : t('auth.showPassword')}
          accessibilityState={{ selected: reveal }}
          hitSlop={8}
          style={({ pressed }) => [styles.eye, mirrored ? styles.eyeStart : styles.eyeEnd, pressed && heldDim]}
        >
          <Icon name={reveal ? 'eye-off' : 'eye'} size={22} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: MIN_TOUCH_TARGET + spacing.sm,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingVertical: spacing.sm + spacing.xs,
    paddingHorizontal: spacing.md,
    fontSize: typography.sizes.lg,
  },
  inputMirrored: { textAlign: 'right' },
  inputRoomEnd: { paddingRight: spacing.xl + spacing.md },
  inputRoomStart: { paddingLeft: spacing.xl + spacing.md },
  eye: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: spacing.sm, minWidth: MIN_TOUCH_TARGET },
  eyeEnd: { right: spacing.xs },
  eyeStart: { left: spacing.xs },
});
