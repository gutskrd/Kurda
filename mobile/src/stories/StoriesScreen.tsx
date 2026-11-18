import { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { RootNavigation } from '../navigation/rootStack';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { GradientBackground } from '../theme/glass';
import { useI18n } from '../i18n/I18nContext';
import { StoriesView } from './StoriesView';

/**
 * The Stories route: Learn's Stories library as its own screen with a way back, for places that still open it by
 * name (a finished game's "Another story", an old link). An invite link's `id` hands straight over to that game,
 * which joins it if allowed.
 */
export function StoriesScreen({ id, onExit }: { id?: string; onExit: () => void }): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { t } = useI18n();

  useEffect(() => {
    if (id) navigation.replace('StoryGame', { id });
  }, [id, navigation]);

  return (
    <GradientBackground>
      <ScreenHeader title={t('stories.title')} onBack={onExit} browse />
      <StoriesView />
    </GradientBackground>
  );
}
