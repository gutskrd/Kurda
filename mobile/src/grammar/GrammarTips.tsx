import { ScrollView, StyleSheet, View } from 'react-native';
import { spacing } from '../theme/tokens';
import { GradientBackground } from '../theme/glass';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { MarkdownView } from './MarkdownView';
import { useI18n } from '../i18n/I18nContext';

/**
 * Grammar "Tips" sheet (KUR-038). Rendered inside a Modal so opening it
 * mid-lesson never unmounts the player — session state is untouched.
 */
export function GrammarTips({ source, onClose }: { source: string; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <GradientBackground>
      <View style={styles.screen}>
        <ScreenHeader title={t('grammar.title')} onBack={onClose} leading="close" hairline />
        <ScrollView contentContainerStyle={styles.body}>
          <MarkdownView source={source} />
        </ScrollView>
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: spacing.lg },
});
