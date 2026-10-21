import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CHARACTER_NAMES, type DictionaryAudio, type RecordingVoice } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { useAudio } from '../lesson/useAudio';
import { CHARACTER_SIZE, SpeakingCharacter, knownVoice } from '../characters/SpeakingCharacter';
import { radii, spacing, typography } from '../theme/tokens';
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
import { useI18n } from '../i18n/I18nContext';

/** A pronunciation's speaker and timeline, which the entry sends beside its URL rather than as one voice. */
function voiceOf(recording: DictionaryAudio): RecordingVoice | null {
  if (!recording.speaker) return null;
  return knownVoice(recording.lipsync ? { speaker: recording.speaker, lipsync: recording.lipsync } : { speaker: recording.speaker });
}

/** Senses beyond this start collapsed so long entries stay scannable (KUR-045). */
const COLLAPSE_AFTER = 8;

export function EntryDetail({ entryId, onBack }: { entryId: string; onBack: () => void }) {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const tabBarInset = useTabBarInset();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [saved, setSaved] = useState(false);
  // with a character to say any of them, each pronunciation gets its own row; else the one button, as before
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

  const toggleSave = () => {
    const next = !saved;
    setSaved(next); // optimistic
    if (next) void client.put(`/dictionary/entries/${entryId}/save`);
    else void client.delete(`/dictionary/entries/${entryId}/save`);
  };

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
              {entry.audio.length > 0 && !voiced && audio.supported ? (
                <Pressable
                  onPress={() => audio.play(1)}
                  accessibilityRole="button"
                  accessibilityLabel={t('dictionary.playPronunciation')}
                  style={[styles.audioBtn, { backgroundColor: colors.controlTrack }]}
                >
                  <Icon name="speaker" size={22} tone="primary" />
                </Pressable>
              ) : null}
              <Pressable
                onPress={toggleSave}
                accessibilityRole="button"
                accessibilityLabel={saved ? t('dictionary.removeBookmark') : t('dictionary.bookmark')}
                accessibilityState={{ selected: saved }}
                style={[styles.audioBtn, { backgroundColor: colors.controlTrack }]}
              >
                <Icon name={saved ? 'bookmark-fill' : 'bookmark'} size={22} color={saved ? colors.gold : colors.textSecondary} />
              </Pressable>
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

/**
 * One pronunciation: who says it and in which variety, beside its own play
 * button. The character says the word as it plays. Laid out as the headword's
 * row above it is, in every interface language.
 */
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
        />
      ) : null}
      <View style={styles.flex}>
        {voice ? <Text style={[styles.speakerName, { color: colors.textPrimary }]}>{CHARACTER_NAMES[voice.speaker]}</Text> : null}
        <Text style={[styles.dialect, { color: colors.textSecondary }]}>{recording.dialect}</Text>
      </View>
      <Pressable
        onPress={() => audio.play(1)}
        accessibilityRole="button"
        accessibilityLabel={t('dictionary.playPronunciation')}
        style={[styles.audioBtn, { backgroundColor: colors.controlTrack }]}
      >
        <Icon name="speaker" size={22} tone="primary" />
      </Pressable>
    </View>
  );
}

/**
 * The entry while it loads: the word with its two round buttons, the variety,
 * and its senses — the part of speech in its column and the meaning beside it.
 */
function EntrySkeleton(): React.JSX.Element {
  const { t } = useI18n();
  return (
    <View style={styles.body} accessibilityLabel={t('common.loading')}>
      <View style={styles.headwordRow}>
        <SkeletonText size={typography.sizes.xxl} lineHeight={HEADWORD_LINE} width={120} />
        <Skeleton width={44} height={44} radius={radii.pill} />
      </View>
      <SkeletonText size={typography.sizes.sm} width={72} />
      <View style={styles.senses}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.senseSkeleton}>
            <View style={styles.senseHead}>
              <SkeletonText size={typography.sizes.xs} width={32} style={styles.posSkeleton} />
              <SkeletonText size={typography.sizes.md} width={i === 1 ? '50%' : '70%'} style={styles.flex} />
            </View>
            <SkeletonText size={typography.sizes.sm} width="46%" style={styles.underPos} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** display(34) sets 1.12 */
const HEADWORD_LINE = Math.round(typography.sizes.xxl * typography.displayLineHeight);
/** the part of speech's column in a sense (SenseSection.tsx) */
const POS_COLUMN = 64;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  senseSkeleton: { paddingVertical: spacing.sm, gap: 4 },
  senseHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  posSkeleton: { minWidth: POS_COLUMN },
  underPos: { marginLeft: POS_COLUMN + spacing.sm },

  body: { padding: spacing.lg, gap: spacing.sm },
  headwordRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headword: { ...display(typography.sizes.xxl) },
  audioBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialect: { fontSize: typography.sizes.sm, textTransform: 'capitalize' },
  pronunciations: { marginTop: spacing.sm, gap: spacing.sm },
  pronunciation: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  speakerName: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  senses: { marginTop: spacing.md },
  xrefs: { marginTop: spacing.lg, gap: spacing.xs },
  xrefsTitle: { ...sectionLabel },
  xrefsList: { fontSize: typography.sizes.md },
});
