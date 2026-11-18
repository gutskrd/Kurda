import { Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { HeaderButton } from '../navigation/HeaderButton';
import type { RootNavigation } from '../navigation/rootStack';
import { useI18n } from '../i18n/I18nContext';

/**
 * The letters screen's header button to the letter widget's page: the widget-squares icon, labelled in words for
 * screen readers. Absent from the web build, which has no home screen.
 */
export function LetterWidgetButton(): React.JSX.Element | null {
  const navigation = useNavigation<RootNavigation>();
  const { t } = useI18n();
  if (Platform.OS === 'web') return null;
  return <HeaderButton icon="widget" label={t('letterWidget.title')} onPress={() => navigation.navigate('LetterWidget')} testID="letter-widget-button" />;
}
