import { StyleSheet, Text, View } from 'react-native';
import { SHIELD_GAMES } from '@kurda/shared';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';

/** The shield's games left, as pips — three, filled for each game it still covers — and the word. */
export function ShieldPips({ count }: { count: number }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.shield} accessible accessibilityLabel={t('ranks.shieldA11y', { count })}>
      {Array.from({ length: SHIELD_GAMES }, (_, i) => (
        <Icon key={i} name={i < count ? 'shield-fill' : 'shield'} size={13} color={i < count ? colors.textPrimary : colors.textSecondary} />
      ))}
      <Text style={[styles.fact, { color: colors.textSecondary }]}>{t('ranks.shield')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fact: { fontSize: typography.sizes.xs },
  shield: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});
