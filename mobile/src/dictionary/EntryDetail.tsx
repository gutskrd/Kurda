import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '../theme/MotionParts';
import { ReachGroup } from '../theme/Pressable';
import { CHARACTER_NAMES, type DictionaryAudio, type RecordingVoice } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { useAudio } from '../lesson/useAudio';
import { CHARACTER_SIZE, SpeakingCharacter, knownVoice } from '../characters/SpeakingCharacter';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { sectionLabel, display } from '../theme/fonts';
import { GradientBackground } from '../theme/glass';
import { useTabBarInset } from '../navigation/tabBarLayout';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { SenseSection } from './SenseSection';
import { SourceLine } from './SourceLine';
import type { Entry } from './types';
import { useHardwareBack } from '../navigation/hardwareBack';
import { useI18n } from '../i18n/I18nContext';
import { useIntents } from '../api/optimistic';

/** A pronunciation's speaker and timeline, sent beside its URL. */
function voiceOf(recording: DictionaryAudio): RecordingVoice | null {
  if (!recording.speaker) return null;
  return knownVoice(recording.lipsync ? { speaker: recording.speaker, lipsync: recording.lipsync } : { speaker: recording.speaker });
}

/** Senses beyond this start collapsed so long entries stay scannable. */
const COLLAPSE_AFTER = 8;

/**
 * One word, opened from search results. It replaces the results rather than being pushed over them
 * (search/SearchScreen says why), so the navigator does not know about it: Android's back is routed to the
 * chevron's exit, which returns to the results.
 */
export function EntryDetail({ entryId, onBack }: { entryId: string; onBack: () => void }) {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const tabBarInset = useTabBarInset();
  useHardwareBack(onBack);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [saved, setSaved] = useState(false);
  // With a character to say them, each pronunciation gets its own row; otherwise a single play button.
  const voiced = !!entry?.audio.some((a) => voiceOf(a) !== null);
  const audio = useAudio(voiced ? undefined : entry?.audio[0]?.url);

  useEffect(() => {
    let active = true;
    void client.get<Entry>(`/dictionary/entries/${entryId}`).then((res) => {
      if (active && res.ok) {
        setEntry(res.data);
        setSaved(!!res.data.saved);
      }
    });
    return () => {
      active = false;
    };
  }, [client, entryId]);

  // Shown at once and sent in the background; a refusal puts it back and says why, a full vocabulary included.
  const saving = useIntents<'saved', boolean>(async (_key, on) => {
    const res = await (on ? client.put(`/dictionary/entries/${entryId}/save`) : client.delete(`/dictionary/entries/${entryId}/save`));
    if (res.ok) setSaved(on);
    return res;
  });
  const shownSaved = saving.shown('saved', saved);
  const toggleSave = () => saving.want('saved', !shownSaved, saved);

  return (
    <GradientBackground>
      <View style={styles.screen}>
        <ScreenHeader onBack={onBack} backLabel={t('dictionary.backToSearch')} />

        {!entry ? (
          <EntrySkeleton />
        ) : (
          <ScrollView contentContainerStyle={[styles.body, { paddingBottom: tabBarInset }]}>
            <View style={styles.headwordRow}>
              <Text style={[styles.headword, { color: colors.textPrimary }]}>{entry.headword}</Text>
              {/* The two round buttons have the row to themselves: each reaches 8 past its edges, sharing the gap between them. */}
              <ReachGroup gap={spacing.md}>
                {entry.audio.length > 0 && !voiced && audio.supported ? (
                  <PressableScale
                    onPress={() => audio.play(1)}
                    accessibilityRole="button"
                    accessibilityLabel={t('dictionary.playPronunciation')}
                    reach="open"
                    style={[styles.audioBtn, { backgroundColor: colors.controlTrack }]}
                  >
                    <Icon name="speaker" size={22} tone="primary" />
                  </PressableScale>
                ) : null}
                <PressableScale
                  onPress={toggleSave}
                  accessibilityRole="button"
                  accessibilityLabel={shownSaved ? t('dictionary.removeBookmark') : t('dictionary.bookmark')}
                  accessibilityState={{ selected: shownSaved }}
                  reach="open"
                  style={[styles.audioBtn, { backgroundColor: colors.controlTrack }]}
                >
                  {/* A saved word's bookmark is yellow, as a saved story's is. */}
                  <Icon name={shownSaved ? 'bookmark-fill' : 'bookmark'} size={22} color={shownSaved ? colors.saved : colors.textSecondary} edge={shownSaved ? colors.savedEdge : undefined} />
                </PressableScale>
              </ReachGroup>
            </View>
            <Text style={[styles.dialect, { color: colors.textSecondary }]}>{entry.dialect}</Text>

            {voiced ? (
              <View style={styles.pronunciations}>
                {entry.audio.map((recording) => (
                  <Pronunciation key={recording.id} recording={recording} word={entry.headword} />
                ))}
              </View>
            ) : null}

            <View style={styles.senses}>
              {entry.senses.map((sense, i) => (
                <SenseSection key={sense.id} sense={sense} startCollapsed={entry.senses.length > COLLAPSE_AFTER && i >= 3} />
              ))}
            </View>

            {entry.xrefs.length > 0 ? (
              <View style={styles.xrefs}>
                <Text style={[styles.xrefsTitle, { color: colors.textSecondary }]}>{t('dictionary.related')}</Text>
                <Text style={[styles.xrefsList, { color: colors.primary }]}>
                  {entry.xrefs.map((x) => `${x.headword} (${x.relation})`).join(' · ')}
                </Text>
              </View>
            ) : null}

            <SourceLine />
          </ScrollView>
        )}
      </View>
    </GradientBackground>
  );
}

/** One pronunciation: speaker and variety beside its play button; the character says the word as it plays. */
function Pronunciation({ recording, word }: { recording: DictionaryAudio; word: string }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  const audio = useAudio(recording.url);
  const voice = voiceOf(recording);
  if (!audio.supported) return null;
  return (
    <View style={styles.pronunciation}>
      {voice ? (
        <SpeakingCharacter
          speaker={voice.speaker}
          voice={voice}
          text={word}
          player={audio.clock}
          playing={audio.playing}
          source={recording.url}
          size={CHARACTER_SIZE.row}
          onPress={() => audio.play(1)}
        />
      ) : null}
      <View style={styles.flex}>
        {voice ? <Text style={[styles.speakerName, { color: colors.textPrimary }]}>{CHARACTER_NAMES[voice.speaker]}</Text> : null}
        <Text style={[styles.dialect, { color: colors.textSecondary }]}>{recording.dialect}</Text>
      </View>
      <PressableScale
        onPress={() => audio.play(1)}
        accessibilityRole="button"
        accessibilityLabel={t('dictionary.playPronunciation')}
        style={[styles.audioBtn, { backgroundColor: colors.controlTrack }]}
      >
        <Icon name="speaker" size={22} tone="primary" />
      </PressableScale>
    </View>
  );
}

/** The loading placeholder: the word with its two round buttons, the variety, and senses with part of speech and meaning. */
function EntrySkeleton(): React.JSX.Element {
  const { t } = useI18n();
  return (
    <View style={styles.body} accessibilityLabel={t('common.loading')}>
      <View style={styles.headwordRow}>
        <SkeletonText size={typography.sizes.title} lineHeight={HEADWORD_LINE} width={120} />
        <Skeleton width={44} height={44} radius={radii.pill} />
      </View>
      <SkeletonText size={typography.sizes.text} width={72} />
      <View style={styles.senses}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.senseSkeleton}>
            <View style={styles.senseHead}>
              <SkeletonText size={typography.sizes.text} width={32} style={styles.posSkeleton} />
              <SkeletonText size={typography.sizes.text} width={i === 1 ? '50%' : '70%'} style={styles.flex} />
            </View>
            <SkeletonText size={typography.sizes.text} width="46%" style={styles.underPos} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** display(34) sets 1.12. */
const HEADWORD_LINE = Math.round(typography.sizes.title * typography.displayLineHeight);
/** The part of speech's column in a sense (SenseSection.tsx). */
const POS_COLUMN = 64;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  senseSkeleton: { paddingVertical: spacing.sm, gap: 4 },
  senseHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  posSkeleton: { minWidth: POS_COLUMN },
  underPos: { marginLeft: POS_COLUMN + spacing.sm },

  body: { paddingHorizontal: layout.gutter, paddingVertical: spacing.lg, gap: spacing.sm },
  headwordRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headword: { ...display(typography.sizes.title) },
  audioBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialect: { fontSize: typography.sizes.text, textTransform: 'capitalize' },
  pronunciations: { marginTop: spacing.sm, gap: spacing.sm },
  pronunciation: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  speakerName: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  senses: { marginTop: spacing.md },
  xrefs: { marginTop: spacing.lg, gap: spacing.xs },
  xrefsTitle: { ...sectionLabel },
  xrefsList: { fontSize: typography.sizes.text },
});
