import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { PAIRING_CODE_LENGTH, formatPairingCode, normalizePairingCode } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { AuthScreenShell } from '../screens/auth/AuthForm';
import { ClayButton } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { FormError } from './parts';

/**
 * "My parent gave me a code": a child's own phone signing in with the eight digits their parent's phone shows, shown in
 * two groups of four as on that phone; a pasted code's space or hyphen is ignored. Nothing else is asked: no name,
 * address or password. A wrong or old code says to ask for a new one.
 */
export function ChildCodeScreen({ onBack }: { onBack: () => void }): React.JSX.Element {
  const { childSignIn } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const code = normalizePairingCode(typed);

  const go = async (): Promise<void> => {
    if (!code) return;
    setBusy(true);
    setError(null);
    const failed = await childSignIn(code);
    setBusy(false);
    if (failed) {
      haptic('error');
      setError(failed.code === 'PAIRING_CODE_INVALID' ? t('child.code.invalid') : failed.message);
    }
  };

  return (
    <AuthScreenShell title={t('child.code.title')} subtitle={t('child.code.lead')} onBack={onBack} hero="link">
      <View style={styles.body}>
        <TextInput
          value={formatPairingCode(typed)}
          onChangeText={(text) => setTyped(text.replace(/\D/g, '').slice(0, PAIRING_CODE_LENGTH))}
          onSubmitEditing={() => void go()}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          autoFocus
          // room for a pasted code with its space or hyphen, which the digits are read out of
          maxLength={PAIRING_CODE_LENGTH * 2}
          accessibilityLabel={t('child.code.label')}
          testID="child-code-input"
          style={[styles.field, { color: colors.textPrimary, backgroundColor: colors.glassFill, borderColor: error ? colors.danger : 'transparent' }]}
        />
        {error ? <FormError text={error} testID="child-code-error" /> : <Text style={[styles.hint, dir.text, { color: colors.textSecondary }]}>{t('child.code.hint')}</Text>}
        <ClayButton label={t('child.code.go')} tone="primary" size="large" busy={busy} disabled={!code} onPress={() => void go()} testID="child-code-go" />
      </View>
    </AuthScreenShell>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md },
  field: {
    minHeight: MIN_TOUCH_TARGET + 20,
    borderRadius: radii.lg,
    borderWidth: 2,
    paddingHorizontal: spacing.md,
    fontSize: typography.sizes.title,
    fontWeight: typography.weights.semibold,
    letterSpacing: 8,
    textAlign: 'center',
  },
  hint: { fontSize: typography.sizes.text, lineHeight: 22 },
});
