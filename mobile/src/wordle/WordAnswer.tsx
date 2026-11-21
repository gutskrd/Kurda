import { StyleSheet, Text, View, type TextStyle } from 'react-native';
import { dialectDirection, meaningIn } from '@kurda/shared';
import { Pressable } from '../theme/Pressable';
import { Icon } from '../theme/Icon';
import { heldDim } from '../theme/MotionParts';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { sectionLabel } from '../theme/fonts';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';

/**
 * What a word game teaches at its end: the word with its meaning, and the rhymes a round left unfound. The web
 * counterpart is web/src/components/WordAnswer.tsx, and the two say the same. The server sends a word's meanings
 * in every interface language a word card gives (api/src/game/word-meanings.ts); the reader sees their own,
 * falling back to English. A missing meaning is left out rather than guessed, since a wrong translation would
 * teach the wrong thing.
 */

/** What a word means, by interface language; empty when nobody has written it yet. */
export type WordMeanings = Partial<Record<string, string>>;

/**
 * A finished Peyvok's answer as the server sends it (`word` on the game): its meanings, the dictionary entry to
 * save it as (null without an exact match), and whether it is already in the player's words.
 */
export interface WordCard {
  entryId: string | null;
  meanings: WordMeanings;
  saved: boolean;
}

/** A rhyme the round could have found, with its meanings (`missed` on a round or a match's results). */
export interface RhymeHint {
  word: string;
  meanings: WordMeanings;
}

/** The two varieties as the word games name them. */
export type WordGameDialect = 'kurmanci' | 'sorani';

/** A word in its own direction: Soranî right to left and Kurmancî left to right, whatever the screen around it does. */
export function wordDirection(dialect: WordGameDialect | null | undefined): TextStyle {
  return { writingDirection: dialectDirection(dialect === 'sorani' ? 'ckb' : 'kmr').dir };
}

/** A spelling compared for sameness only, ignoring case, outer spaces and letter forms. */
function same(a: string, b: string): boolean {
  return a.normalize('NFC').trim().toLowerCase() === b.normalize('NFC').trim().toLowerCase();
}

/**
 * What to show under `word`: the reader's meaning, else English, never the word itself again (a Kurmancî reader
 * would otherwise see "zevî" under "zevî").
 */
export function shownMeaning(meanings: WordMeanings | null | undefined, locale: string, word: string): string | null {
  const own = meaningIn(meanings, locale);
  if (own && !same(own, word)) return own;
  const en = meanings?.en?.trim();
  return en && !same(en, word) ? en : null;
}

/**
 * A finished Peyvok's answer: the word, large, with its meaning, and Save to vocabulary when the dictionary has
 * it. The screen does the saving; this shows its state. A saved word keeps its line with a tick and takes no
 * second press; a failed save says why and can be retried.
 */
export function WordAnswer({
  word,
  meanings,
  save,
}: {
  word: string;
  meanings: WordMeanings | null | undefined;
  save?: { saved: boolean; onSave: () => void; error?: string | null };
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const meaning = shownMeaning(meanings, locale, word);
  return (
    <View style={[styles.answer, { backgroundColor: colors.controlTrack }]} testID="peyvok-answer">
      {/* Peyvok is Kurmancî only, so the word always reads left to right. */}
      <Text style={[styles.word, wordDirection('kurmanci'), { color: colors.textPrimary }]}>{word}</Text>
      {meaning ? <Text style={[styles.meaning, dir.free, { color: colors.textSecondary }]}>{meaning}</Text> : null}
      {save ? (
        <Pressable
          onPress={save.onSave}
          accessibilityRole="button"
          accessibilityState={{ disabled: save.saved }}
          disabled={save.saved}
          // One 20-point line (its style says so), answered at a fingertip's reach above and below it.
          style={({ pressed }) => [styles.saveRow, { flexDirection: dir.row }, pressed && heldDim]}
        >
          <Icon name={save.saved ? 'bookmark-fill' : 'bookmark'} size={16} color={save.saved ? colors.saved : colors.primary} edge={save.saved ? colors.savedEdge : undefined} />
          <Text style={[styles.saveText, { color: colors.primary }]}>{save.saved ? t('dictionary.savedWord') : t('dictionary.saveWord')}</Text>
        </Pressable>
      ) : null}
      {save?.error ? (
        <Text style={[styles.error, dir.free, { color: colors.danger }]} accessibilityLiveRegion="polite">
          {save.error}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A word's meaning in one quiet line under a sentence that already names the word (a battle's "The word was …");
 * nothing when no meaning exists.
 */
export function WordMeaningLine({ word, meanings }: { word: string; meanings: WordMeanings | null | undefined }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { locale } = useI18n();
  const dir = useDirection();
  const meaning = shownMeaning(meanings, locale, word);
  if (!meaning) return null;
  return (
    <Text style={[styles.meaningLine, dir.free, { color: colors.textSecondary }]} testID="word-meaning-line">
      {meaning}
    </Text>
  );
}

/**
 * The rhymes a round did not find, each with its meaning, under their own heading, so the next round goes better.
 * Up to ten come from the server, those with meanings first; with none there is no list.
 */
export function MissedRhymes({
  hints,
  dialect,
  tone = 'page',
}: {
  hints: readonly RhymeHint[] | null | undefined;
  dialect: WordGameDialect;
  /** `page` on the screen's own ground; `card` inside a card, where rows need no ground of their own. */
  tone?: 'page' | 'card';
}): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  if (!hints || hints.length === 0) return null;
  const title = t('games.rhyme.missed');
  return (
    <View style={styles.missed} accessibilityLabel={title} testID="missed-rhymes">
      <Text style={[styles.missedTitle, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
        {title}
      </Text>
      {hints.map((h) => {
        const meaning = shownMeaning(h.meanings, locale, h.word);
        return (
          <View
            key={h.word}
            style={[styles.missedRow, { flexDirection: dir.row }, tone === 'page' ? { backgroundColor: colors.controlTrack } : styles.missedRowCard]}
          >
            <Text style={[styles.missedWord, wordDirection(dialect), { color: colors.textPrimary }]}>{h.word}</Text>
            {meaning ? (
              <Text style={[styles.missedMeaning, dir.free, { color: colors.textSecondary }]} numberOfLines={2}>
                {meaning}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** The save line's drawn height: the Pressable works its reach out from it. */
const SAVE_LINE = 20;

const styles = StyleSheet.create({
  answer: { borderRadius: radii.md, padding: spacing.md, gap: spacing.xs, marginTop: spacing.sm, alignItems: 'center' },
  word: { fontSize: typography.sizes.title, fontWeight: typography.weights.bold, textAlign: 'center' },
  meaning: { fontSize: typography.sizes.text, lineHeight: 20, textAlign: 'center' },
  saveRow: { alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs, minHeight: SAVE_LINE },
  // A long label wraps under itself, centred, rather than running past the card.
  saveText: { flexShrink: 1, fontSize: typography.sizes.text, fontWeight: typography.weights.bold, textAlign: 'center' },
  error: { fontSize: typography.sizes.text, lineHeight: 22, textAlign: 'center' },
  meaningLine: { fontSize: typography.sizes.text, lineHeight: 20, textAlign: 'center' },
  missed: { gap: spacing.xs, alignSelf: 'stretch', marginTop: spacing.sm },
  missedTitle: { ...sectionLabel, marginBottom: spacing.xs },
  missedRow: { alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, borderRadius: radii.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  // Inside a card the rows are its lines, the card's own ground showing through.
  missedRowCard: { paddingHorizontal: 0 },
  missedWord: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  missedMeaning: { flexShrink: 1, fontSize: typography.sizes.text },
});
