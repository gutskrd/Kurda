import { StyleSheet, Text } from 'react-native';
import { APP_VERSION, nativeBuildNumber } from '../feedback/appInfo';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeProvider';
import { layout, spacing, typography } from '../theme/tokens';

/**
 * Which Hevalo this is, in one quiet line at the very end of Settings: the
 * version, and the build number when the binary has one.
 *
 * It is what support asks first, and what a tester names when a build
 * misbehaves, so it can be selected and copied. It sits below every section
 * and is not a row: nothing happens when it is pressed.
 */
export function VersionLine({ build = nativeBuildNumber() }: { build?: string | null }): React.JSX.Element {
  const { t } = useI18n();
  const { colors } = useTheme();
  const text = build ? t('settings.versionBuild', { version: APP_VERSION, build }) : t('settings.version', { version: APP_VERSION });
  return (
    <Text selectable testID="settings-version" style={[styles.line, { color: colors.textSecondary }]}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  line: {
    fontSize: typography.sizes.xs,
    textAlign: 'center',
    paddingHorizontal: layout.gutter,
    paddingTop: spacing.xl,
  },
});
