import { StyleSheet, Text } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, typography } from '../../theme/tokens';
import { useI18n } from '../../i18n/I18nContext';
import type { AgeStopKind } from '../../auth/birthMonth';
import { AuthScreenShell } from './AuthForm';

/**
 * What someone under 13 sees instead of an account: who Hevalo is for, that nothing was kept (or that the account
 * was closed), and that they are welcome back at 13. There is deliberately no form or way back to one, which would
 * only invite a different year. It lasts while the app is open. Unlike the website it does not mention the
 * alphabet page, which the phone does not have.
 */
export function AgeStopScreen({ kind }: { kind: AgeStopKind }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <AuthScreenShell title={t('age.stop.title')}>
      <Text style={[styles.body, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
        {kind === 'closed' ? t('age.stop.closed') : t('age.stop.body')}
      </Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>{t('age.stop.welcomeBack')}</Text>
    </AuthScreenShell>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: typography.sizes.text, lineHeight: 22, marginTop: spacing.sm },
});
