import type { ReactNode } from 'react';
import { useNavigation } from '@react-navigation/native';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ParentalSwitch } from '@kurda/shared';
import { useI18n } from '../i18n/I18nContext';
import type { RootNavigation } from '../navigation/rootStack';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { TabHeader } from '../navigation/TopBar';
import { useDirection } from '../reports/direction';
import { ClayButton, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { useParentalOff } from './supervision';

/**
 * What a supervised teen sees in place of something a parent switched off (writing a message, a letter or a post,
 * adding a friend, an online game): one calm line with the parental icon, never an error. Placed where the held-account
 * notice goes, and shaped like it, so the two read as the same kind of thing.
 */
export function ParentalNote({ style, testID = 'parental-note' }: { style?: StyleProp<ViewStyle>; testID?: string }): React.JSX.Element {
  const { t } = useI18n();
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <View style={[styles.note, { backgroundColor: colors.controlTrack, flexDirection: dir.row }, style]} testID={testID} accessibilityRole="text">
      <Icon name="parental" size={20} color={colors.textSecondary} />
      <Text style={[styles.text, dir.text, { color: colors.textPrimary }]}>{t('parental.off')}</Text>
    </View>
  );
}

/**
 * A whole place a parent switched off (chat or letters, which the server then refuses to read as well as write): one
 * calm page in its place, never an error to retry, and the way to see what was set. The screen behind it is not drawn,
 * so nothing it would load is asked for. A tab keeps its name at the top; a pushed page keeps its way back.
 */
export function ParentalWall({
  part,
  tabTitle,
  onBack,
  children,
}: {
  part: ParentalSwitch;
  /** On a tab: its name, where the tab's header puts it. */
  tabTitle?: string;
  onBack?: () => void;
  children: ReactNode;
}): React.JSX.Element {
  const off = useParentalOff(part);
  const navigation = useNavigation<RootNavigation>();
  const { t } = useI18n();
  const { colors } = useTheme();
  if (!off) return <>{children}</>;
  return (
    <GradientBackground>
      {tabTitle ? <TabHeader title={tabTitle} /> : <ScreenHeader onBack={onBack} />}
      <View style={styles.wall} testID={`parental-wall-${part}`}>
        <View style={[styles.mark, { backgroundColor: colors.controlTrack }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon name="parental" size={36} color={colors.textPrimary} />
        </View>
        <Text style={[styles.wallText, { color: colors.textPrimary }]} accessibilityRole="header">
          {t('parental.off')}
        </Text>
        <ClayButton label={t('parental.title')} icon="parental" variant="outline" onPress={() => navigation.navigate('SettingsPage', { page: 'parental' })} />
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  note: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm + 4, paddingHorizontal: spacing.md, borderRadius: radii.md },
  text: { flex: 1, fontSize: typography.sizes.text, lineHeight: 20 },
  wall: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: layout.gutter, paddingBottom: spacing.xxl },
  mark: { width: 88, height: 88, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  wallText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, textAlign: 'center' },
});
