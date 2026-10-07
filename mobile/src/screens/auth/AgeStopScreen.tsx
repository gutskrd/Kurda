import { StyleSheet, Text } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, typography } from '../../theme/tokens';
import { useI18n } from '../../i18n/I18nContext';
import type { AgeStopKind } from '../../auth/birthMonth';
import { AuthScreenShell } from './AuthForm';

/**
 * What somebody under 13 sees instead of an account.
 *
 * Polite and plain, and never a reason to try again: it says who Hevalo is for,
 * that nothing was kept (or, for an account that existed, that it has been
 * closed), and that they are welcome back at 13. There is no form underneath
 * and no button back to one — handing back an empty form would only invite a
 * different year. It lasts for as long as the app is open.
 *
 * The browser's version also points at the alphabet page, which needs no
 * account; the phone has no page like that, so it does not promise one.
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
  body: { fontSize: typography.sizes.md, lineHeight: 22, marginTop: spacing.sm },
});
