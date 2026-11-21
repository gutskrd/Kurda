import { useNavigation } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n/I18nContext';
import type { RootNavigation } from '../navigation/rootStack';
import { useDirection } from '../reports/direction';
import { display } from '../theme/fonts';
import { Icon, type IconName } from '../theme/Icon';
import { PressableScale } from '../theme/MotionParts';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { PROVERBS_NAME, RIDDLES_NAME, collectionName } from './labels';

/**
 * The library's two companions at the top of the Stories shelves: the riddles (Metelok) and the proverbs (Gotinên
 * pêşiyan), each by its Kurdish name with the reader's word under it, in one calm row rather than a new tab.
 */
export function LoreEntry(): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { t } = useI18n();
  const dir = useDirection();
  return (
    <View style={[styles.row, { flexDirection: dir.row }]}>
      <Shelf icon="question" kurmanci={RIDDLES_NAME} localized={t('lore.riddles.name')} onPress={() => navigation.navigate('Riddles')} testID="lore-riddles" />
      <Shelf icon="quotes" kurmanci={PROVERBS_NAME} localized={t('lore.proverbs.name')} onPress={() => navigation.navigate('Proverbs')} testID="lore-proverbs" />
    </View>
  );
}

function Shelf({ icon, kurmanci, localized, onPress, testID }: { icon: IconName; kurmanci: string; localized: string; onPress: () => void; testID: string }): React.JSX.Element {
  const { colors } = useTheme();
  const { locale } = useI18n();
  const dir = useDirection();
  const { name, beside, lang } = collectionName(kurmanci, localized, locale);
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={beside ? `${name}, ${beside}` : name}
      style={[styles.shelf, { backgroundColor: colors.surface }]}
      testID={testID}
    >
      <View style={[styles.head, { flexDirection: dir.row }]}>
        <View style={[styles.icon, { backgroundColor: colors.controlTrack }]}>
          <Icon name={icon} size={18} color={colors.primary} />
        </View>
        <Icon name="chevron-right" size={14} color={colors.textSecondary} style={dir.flip ?? undefined} />
      </View>
      <Text style={[styles.name, dir.text, { color: colors.textPrimary }]} accessibilityLanguage={lang} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
        {name}
      </Text>
      {beside ? (
        <Text style={[styles.beside, dir.text, { color: colors.textSecondary }]} numberOfLines={1}>
          {beside}
        </Text>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { gap: layout.rowGap },
  shelf: { flex: 1, borderRadius: radii.lg, padding: spacing.md - 4, gap: 2, minHeight: 92 },
  head: { alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  icon: { width: 32, height: 32, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  name: { ...display(typography.sizes.text), lineHeight: Math.round(typography.sizes.text * 1.25) },
  beside: { fontSize: typography.sizes.text, lineHeight: 22 },
});
