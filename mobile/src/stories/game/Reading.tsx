import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { StoryDetail, StoryGameView, StoryGlossEntry } from '@kurda/shared';
import { useAuth } from '../../auth/AuthContext';
import { describeError } from '../../api/errors';
import type { ApiError, ApiResult } from '../../api/types';
import { ClayButton } from '../../theme/glass';
import { SkeletonLines } from '../../theme/Skeleton';
import { useTheme } from '../../theme/ThemeProvider';
import { display } from '../../theme/fonts';
import { spacing, typography } from '../../theme/tokens';
import { useI18n } from '../../i18n/I18nContext';
import { advanceGame, doneReading } from '../api';
import { useStoryPrefs } from '../prefs';
import { STORY_BODY_SIZE, StoryText } from '../StoryText';
import { storyTextProps, storyTextStyle } from '../storyText';
import { Card, Note } from '../ui';
import { readingNote, useTicker } from './clock';
import { ExtraTimeSwitch } from './ExtraTimeSwitch';

/**
 * Reading together (contract §A1 "Reading"): the story, then "I've finished
 * reading". Nobody is shown a countdown and nobody is named: only how many
 * have finished. Once the slowest reader has had time (the soft cap), the
 * host may start the questions, and everyone is told so with a "take the
 * time you need"; in the last minute before they start on their own, that
 * they start in about a minute. A solo reader starts the questions whenever.
 */
export function Reading({
  view,
  story,
  apply,
  serverNow,
  onGloss,
}: {
  view: StoryGameView;
  story: StoryDetail | null;
  apply: (res: ApiResult<StoryGameView>) => ApiError | null;
  serverNow: () => number;
  onGloss: (entry: StoryGlossEntry) => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const { prefs } = useStoryPrefs();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useTicker(5_000, view.mode !== 'solo');
  const note = readingNote(view, serverNow());
  const solo = view.mode === 'solo';

  const run = async (work: () => Promise<ApiResult<StoryGameView>>): Promise<void> => {
    setBusy(true);
    setError(null);
    const err = apply(await work());
    setBusy(false);
    if (err && err.status !== 409) setError(describeError(err, t));
  };

  return (
    <>
      {view.settings.textDuring === 'hidden' ? <Note icon="eye-off">{t('stories.fromMemoryWarning')}</Note> : null}
      {story ? (
        <>
          <Text {...storyTextProps(story.dialect)} style={[styles.title, { color: colors.textPrimary }, storyTextStyle(story.dialect)]} accessibilityRole="header">
            {story.title}
          </Text>
          <StoryText story={story} fontSize={Math.round(STORY_BODY_SIZE * prefs.textScale)} onGloss={onGloss} />
        </>
      ) : (
        <SkeletonLines count={8} />
      )}

      <Card style={styles.card}>
        {!solo ? (
          <Text style={[styles.count, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
            {t('stories.reading.finishedCount', { done: view.readingDoneCount, total: view.activeCount })}
          </Text>
        ) : null}
        {note === 'host-may-start' ? <Text style={[styles.note, { color: colors.textSecondary }]}>{t('stories.reading.hostMayStart')}</Text> : null}
        {note === 'starting-soon' ? (
          <Text style={[styles.note, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
            {t('stories.reading.startingSoon')}
          </Text>
        ) : null}
        {view.meDoneReading && !solo ? (
          <Text style={[styles.waiting, { color: colors.textPrimary }]}>{t('stories.reading.waiting')}</Text>
        ) : (
          <ClayButton
            label={solo ? t('stories.reading.startQuestions') : t('stories.reading.done')}
            tone="primary"
            size="large"
            busy={busy}
            onPress={() => void run(() => doneReading(client, view.id))}
          />
        )}
        {!solo && view.isHost && note !== null ? (
          <ClayButton
            label={t('stories.reading.hostStart')}
            variant="outline"
            tone="primary"
            busy={busy}
            onPress={() => void run(() => advanceGame(client, view.id, { status: 'reading', index: 0 }))}
          />
        ) : null}
        {error ? <Note tone="danger" icon="alert">{error}</Note> : null}
      </Card>
      <ExtraTimeSwitch view={view} apply={apply} />
    </>
  );
}

const styles = StyleSheet.create({
  title: { ...display(typography.sizes.xl) },
  card: { gap: spacing.sm },
  count: { fontSize: typography.sizes.sm, textAlign: 'center' },
  note: { fontSize: typography.sizes.sm, textAlign: 'center', lineHeight: 20 },
  waiting: { fontSize: typography.sizes.md, textAlign: 'center', fontWeight: typography.weights.semibold },
});
