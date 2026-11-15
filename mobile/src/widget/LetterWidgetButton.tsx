import { Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { HeaderButton } from '../navigation/HeaderButton';
import type { RootNavigation } from '../navigation/rootStack';
import { useI18n } from '../i18n/I18nContext';

/**
 * The way to the letter widget's page from the letters screen's header: the
 * squares a phone shows for its widgets, named in words for a screen reader.
 * Not on the website build of the phone app, which has no home screen.
 */
export function LetterWidgetButton(): React.JSX.Element | null {
  const navigation = useNavigation<RootNavigation>();
  const { t } = useI18n();
  if (Platform.OS === 'web') return null;
  return <HeaderButton icon="widget" label={t('letterWidget.title')} onPress={() => navigation.navigate('LetterWidget')} edge="end" testID="letter-widget-button" />;
}
