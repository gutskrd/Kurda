import { StyleSheet, Text } from 'react-native';
import { APP_VERSION, nativeBuildNumber } from '../feedback/appInfo';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeProvider';
import { layout, spacing, typography } from '../theme/tokens';

/**
 * The app version, and build number when there is one, in a quiet line at the end of Settings. Support asks for
 * it first, so it is selectable; it is not a row and does nothing when pressed.
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
    fontSize: typography.sizes.text,
    textAlign: 'center',
    paddingHorizontal: layout.gutter,
    paddingTop: spacing.xl,
  },
});
