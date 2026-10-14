import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  STORY_GAME_MODES,
  TEXT_DURING_OPTIONS,
  TIMER_PRESETS,
  type GameAccess,
  type StoryDialect,
  type StoryGameMode,
  type StoryGameView,
  type StoryLength,
  type StoryListItem,
  type TextDuring,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { ClayButton, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import type { Translate } from '../api/errors';
import { createGame, gameOptions } from './api';
import { ACCESS_KEY, LENGTH_KEY, MODE_KEY, TEXT_DURING_KEY, lengthWithMinutes, timerLabel } from './labels';
import { useStoryPrefs } from './prefs';
import { availableLengths, changeSetup, createInput, initialSetup, questionCountsFor, type SetupState } from './setup';
import { storyTextProps, storyTextStyle } from './storyText';
import { ChoiceChips, Note, SectionLabel, Sheet } from './ui';

/** What a refusal to create a game means, in the player's language. */
export function createErrorMessage(error: ApiError, t: Translate): string {
  switch (error.code) {
    case 'NO_STORY':
      return t('stories.error.noStory');
    case 'STORY_UNAVAILABLE':
      return t('stories.error.storyUnavailable');
    case 'IN_GAME':
      return t('stories.error.inGame');
    case 'TOO_MANY_GAMES':
      return t('stories.error.tooManyGames');
    case 'OPEN_NOT_ALLOWED':
      return t('stories.error.openNotAllowed');
    default:
      return describeError(error, t);
  }
}

/** Whether this account may open a game to adults who are not its friends; false until known. */
export function useCanHostOpen(): boolean {
  const { client } = useAuth();
  const [can, setCan] = useState(false);
  useEffect(() => {
    let live = true;
    void gameOptions(client).then((res) => {
      if (live && res.ok) setCan(res.data.canHostOpen);
    });
    return () => {
      live = false;
    };
  }, [client]);
  return can;
}

/**
 * The presets a host picks after the mode: the story (or a length and
 * "Surprise me"), how many questions, the timer, whether the text stays on
 * screen, and who may join. Every group is a radio group under its own label
 * (contract §A1). The invite sheet shows the same fields for a Stories game.
 */
export function StoryPresetFields({
  state,
  onChange,
  stories,
  fixedStory,
  canHostOpen,
  noSurprise = false,
}: {
  state: SetupState;
  onChange: (next: SetupState) => void;
  /** the variety's published stories, for the lengths and the pick list */
  stories: readonly StoryListItem[];
  fixedStory?: StoryListItem | null;
  canHostOpen: boolean;
  /** a game that exists already has its story: no "Surprise me" to pick (the lobby's settings) */
  noSurprise?: boolean;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const set = (patch: Parameters<typeof changeSetup>[1]) => onChange(changeSetup(state, patch));
  const lengths = availableLengths(stories, state.dialect);
  const ofLength = stories.filter((s) => s.dialect === state.dialect && s.length === state.length);
  const counts = questionCountsFor(state.length);

  return (
    <>
      {fixedStory ? (
        <View style={styles.field}>
          <SectionLabel>{t('stories.setup.story')}</SectionLabel>
          <View style={[styles.fixed, { backgroundColor: colors.controlTrack }]}>
            <Icon name="story" size={20} color={colors.primary} />
            <View style={styles.fixedText}>
              <Text {...storyTextProps(fixedStory.dialect)} style={[styles.fixedTitle, { color: colors.textPrimary }, storyTextStyle(fixedStory.dialect)]} numberOfLines={2}>
                {fixedStory.title}
              </Text>
              <Text style={[styles.fixedMeta, { color: colors.textSecondary }]}>{lengthWithMinutes(fixedStory.dialect, fixedStory.length, t)}</Text>
            </View>
          </View>
        </View>
      ) : (
        <>
          {lengths.length > 0 ? (
            <View style={styles.field}>
              <SectionLabel>{t('stories.setup.length')}</SectionLabel>
              <Segmented<StoryLength>
                groupLabel={t('stories.setup.length')}
                options={lengths}
                value={lengths.includes(state.length) ? state.length : lengths[0]!}
                onChange={(length) => set({ length })}
                labelOf={(l) => t(LENGTH_KEY[l])}
              />
            </View>
          ) : null}
          <View style={styles.field}>
            <SectionLabel>{t('stories.setup.story')}</SectionLabel>
            <View accessibilityRole="radiogroup" accessibilityLabel={t('stories.setup.story')} style={styles.pickList}>
              {[...(noSurprise ? [] : [null]), ...ofLength].map((s) => {
                const on = (s?.id ?? null) === state.storyId;
                return (
                  <Pressable
                    key={s?.id ?? 'surprise'}
                    onPress={() => set({ storyId: s?.id ?? null })}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={s ? s.title : t('stories.setup.surprise')}
                    {...(s ? storyTextProps(s.dialect) : null)}
                    style={({ pressed }) => [
                      styles.pickRow,
                      { backgroundColor: on ? colors.successFill : colors.controlTrack, opacity: pressed ? 0.8 : 1 },
                    ]}
                  >
                    <View style={[styles.radio, { borderColor: on ? colors.primary : colors.textSecondary }]}>
                      {on ? <View style={[styles.radioDot, { backgroundColor: colors.primary }]} /> : null}
                    </View>
                    {s ? (
                      <Text {...storyTextProps(s.dialect)} style={[styles.pickText, { color: colors.textPrimary }, storyTextStyle(s.dialect)]} numberOfLines={1}>
                        {s.title}
                      </Text>
                    ) : (
                      <Text style={[styles.pickText, { color: colors.textPrimary }]}>{t('stories.setup.surprise')}</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </>
      )}

      <View style={styles.field}>
        <SectionLabel>{t('stories.setup.questions')}</SectionLabel>
        <Segmented<string>
          groupLabel={t('stories.setup.questions')}
          options={counts.map(String)}
          value={String(state.questionCount)}
          onChange={(v) => set({ questionCount: Number(v) as SetupState['questionCount'] })}
          labelOf={(v) => v}
        />
      </View>

      <View style={styles.field}>
        <SectionLabel>{t('stories.setup.timer')}</SectionLabel>
        <ChoiceChips<string>
          label={t('stories.setup.timer')}
          options={TIMER_PRESETS.map(String)}
          value={String(state.timerSeconds)}
          onChange={(v) => set({ timerSeconds: Number(v) as SetupState['timerSeconds'] })}
          labelOf={(v) => timerLabel(Number(v) as SetupState['timerSeconds'], t)}
        />
      </View>

      <View style={styles.field}>
        <SectionLabel>{t('stories.setup.text')}</SectionLabel>
        <ChoiceChips<TextDuring>
          label={t('stories.setup.text')}
          options={TEXT_DURING_OPTIONS}
          value={state.textDuring}
          onChange={(textDuring) => set({ textDuring })}
          labelOf={(v) => t(TEXT_DURING_KEY[v])}
        />
        {state.textDuring === 'hidden' ? (
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('stories.fromMemoryHint')}</Text>
        ) : null}
      </View>

      {state.mode !== 'solo' && canHostOpen ? (
        <View style={styles.field}>
          <SectionLabel>{t('stories.setup.access')}</SectionLabel>
          <Segmented<GameAccess>
            groupLabel={t('stories.setup.access')}
            options={['friends', 'open']}
            value={state.access}
            onChange={(access) => set({ access })}
            labelOf={(v) => t(ACCESS_KEY[v])}
          />
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            {state.access === 'open' ? t('stories.access.openHint') : t('stories.access.friendsHint')}
          </Text>
        </View>
      ) : null}
    </>
  );
}

/**
 * Setting up a story game: alone, with a friend, or with a group.
 *
 * From the hub nothing is chosen yet (a length and "Surprise me", or a story
 * from the list); from the reader the story is the one just read and its
 * length is fixed. The sheet makes the game and hands its first view back —
 * a solo game is already reading (or, from the reader, already asking), a duo
 * or group is a lobby with the host in it.
 */
export function SetupSheet({
  dialect,
  stories,
  story,
  initialMode,
  skipReading = false,
  onClose,
  onCreated,
}: {
  dialect: StoryDialect;
  stories: readonly StoryListItem[];
  story?: StoryListItem | null;
  initialMode: StoryGameMode;
  /** solo from the reader: the story was just read, so straight to the questions */
  skipReading?: boolean;
  onClose: () => void;
  onCreated: (view: StoryGameView) => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { t } = useI18n();
  const { prefs, update } = useStoryPrefs();
  const canHostOpen = useCanHostOpen();
  const firstLength = story?.length ?? availableLengths(stories, dialect)[0] ?? 'short';
  const [state, setState] = useState<SetupState>(() =>
    initialSetup({ mode: initialMode, dialect, story, length: firstLength, solo: initialMode === 'solo' ? prefs.quiz : undefined }),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const res = await createGame(
      client,
      createInput(state, { skipReading: state.mode === 'solo' && skipReading, extraTime: prefs.extraTime }),
    );
    setBusy(false);
    if (!res.ok) {
      setError(createErrorMessage(res.error, t));
      return;
    }
    if (state.mode === 'solo') {
      // "Quiz yourself" starts from these next time, on this phone
      update({
        quiz: {
          questionCount: { ...prefs.quiz.questionCount, [state.length]: state.questionCount },
          timerSeconds: state.timerSeconds,
          textDuring: state.textDuring,
        },
      });
    }
    onCreated(res.data);
  };

  return (
    <Sheet
      title={story ? t('stories.setup.titleFor') : t('stories.setup.title')}
      onClose={onClose}
      footer={
        <>
          {error ? <Note tone="danger" icon="alert">{error}</Note> : null}
          <ClayButton
            label={state.mode === 'solo' ? t('stories.setup.start') : t('stories.setup.create')}
            tone="primary"
            size="large"
            busy={busy}
            onPress={() => void create()}
          />
        </>
      }
    >
      {/*
        Choices named in words are chips, which wrap to a second row; a
        segmented control cuts "Mit einem Freund" or larger text to an
        ellipsis, and the words are the only way to tell the modes apart.
        Short ones (lengths, counts, access) stay segmented.
      */}
      <View style={styles.field}>
        <SectionLabel>{t('stories.setup.mode')}</SectionLabel>
        <ChoiceChips<StoryGameMode>
          label={t('stories.setup.mode')}
          options={STORY_GAME_MODES}
          value={state.mode}
          onChange={(mode) => setState((s) => changeSetup(s, { mode }))}
          labelOf={(m) => t(MODE_KEY[m])}
        />
      </View>
      <StoryPresetFields state={state} onChange={setState} stories={stories} fixedStory={story} canHostOpen={canHostOpen} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.sm },
  hint: { fontSize: typography.sizes.sm, lineHeight: 19 },
  fixed: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radii.md, padding: spacing.md },
  fixedText: { flex: 1, gap: 2 },
  fixedTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  fixedMeta: { fontSize: typography.sizes.sm },
  pickList: { gap: spacing.xs },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
  },
  pickText: { flex: 1, fontSize: typography.sizes.md },
  radio: { width: 20, height: 20, borderRadius: radii.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: radii.pill },
});
