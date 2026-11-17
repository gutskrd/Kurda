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
 * What a word game teaches at its end, on the phone: the word it was about,
 * with what it means, and the rhymes a round left unfound. The website's
 * counterpart is web/src/components/WordAnswer.tsx, and the two say the same.
 *
 * The server sends a word's meanings in every interface language a word card
 * gives (api/src/game/word-meanings.ts), and the reader is shown their own,
 * falling back to English, as the riddles and proverbs do. A meaning nobody
 * has written is simply left out: the word is still the answer, and a guessed
 * translation, or the nearest dictionary hit for another word, would teach the
 * wrong thing.
 */

/** What a word means, by interface language; empty when nobody has written it yet. */
export type WordMeanings = Partial<Record<string, string>>;

/**
 * A finished Peyvok's answer as the server sends it (`word` on the game): its
 * meanings, the dictionary entry it can be saved as (null when the dictionary
 * has none spelt exactly so), and whether it is in the player's words already.
 */
export interface WordCard {
  entryId: string | null;
  meanings: WordMeanings;
  saved: boolean;
}

/** A rhyme the round could have found, with its meanings (`missed` on a round or on a match's results). */
export interface RhymeHint {
  word: string;
  meanings: WordMeanings;
}

/** The two varieties as the word games name them. */
export type WordGameDialect = 'kurmanci' | 'sorani';

/**
 * A word in its own letters: Soranî reads right to left whatever the screen
 * around it does, and Kurmancî left to right, so a Soranî word on an English
 * screen still begins at its own end.
 */
export function wordDirection(dialect: WordGameDialect | null | undefined): TextStyle {
  return { writingDirection: dialectDirection(dialect === 'sorani' ? 'ckb' : 'kmr').dir };
}

/** A spelling compared for sameness only: case, outer spaces and the shape of its letters set aside. */
function same(a: string, b: string): boolean {
  return a.normalize('NFC').trim().toLowerCase() === b.normalize('NFC').trim().toLowerCase();
}

/**
 * What to show under `word`: the reader's own meaning, else the English one,
 * and never the word itself again. A Kurmancî reader of a Kurmancî word would
 * otherwise read "zevî" under "zevî" wherever a card gives the word as its own
 * meaning; English, or nothing, says more than that.
 */
export function shownMeaning(meanings: WordMeanings | null | undefined, locale: string, word: string): string | null {
  const own = meaningIn(meanings, locale);
  if (own && !same(own, word)) return own;
  const en = meanings?.en?.trim();
  return en && !same(en, word) ? en : null;
}

/**
 * The answer of a finished Peyvok: the word, large, with its meaning under
 * it, and Save to vocabulary when the dictionary has the word to save it as.
 * Saving is the screen's to do (it knows the game); this only says how it
 * stands. Once the word is saved the line stays where it is, with a tick and
 * the words that say so, and takes no second press; a save that did not land
 * says why under it and can be tried again.
 */
export function WordAnswer({
  word,
  meanings,
  save,
}: {
  word: string;
  meanings: WordMeanings | null | undefined;
  save?: { saved: boolean; busy: boolean; onSave: () => void; error?: string | null };
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const meaning = shownMeaning(meanings, locale, word);
  return (
    <View style={[styles.answer, { backgroundColor: colors.controlTrack }]} testID="peyvok-answer">
      {/* Peyvok is Kurmancî only, so the word always reads left to right */}
      <Text style={[styles.word, wordDirection('kurmanci'), { color: colors.textPrimary }]}>{word}</Text>
      {meaning ? <Text style={[styles.meaning, dir.free, { color: colors.textSecondary }]}>{meaning}</Text> : null}
      {save ? (
        <Pressable
          onPress={save.onSave}
          accessibilityRole="button"
          accessibilityState={{ disabled: save.saved || save.busy, busy: save.busy }}
          disabled={save.saved || save.busy}
          // one 20-point line (its style says so), answered at a fingertip's reach above and below it
          style={({ pressed }) => [styles.saveRow, { flexDirection: dir.row }, pressed && heldDim]}
        >
          <Icon name={save.saved ? 'bookmark-fill' : 'bookmark'} size={16} color={colors.primary} />
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
 * What a word means, said in one quiet line under a sentence that already
 * names the word (a battle's "The word was …"). Nothing at all when nobody
 * has written a meaning for it.
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
 * The rhymes a round did not find, each with its meaning, under a heading of
 * its own: finding rhymes is half of the game, and seeing the ones that got
 * away, with what they mean, is how the next round goes better. Up to ten
 * come from the server, those with a meaning first; none, and there is no
 * list at all.
 */
export function MissedRhymes({
  hints,
  dialect,
  tone = 'page',
}: {
  hints: readonly RhymeHint[] | null | undefined;
  dialect: WordGameDialect;
  /** `page` on the screen's own ground; `card` inside a card, where the rows need no ground of their own */
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
  word: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, textAlign: 'center' },
  meaning: { fontSize: typography.sizes.md, lineHeight: 20, textAlign: 'center' },
  saveRow: { alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs, minHeight: SAVE_LINE },
  // a long label (German says it in three words) wraps under itself, centred, rather than running past the card
  saveText: { flexShrink: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.bold, textAlign: 'center' },
  error: { fontSize: typography.sizes.sm, lineHeight: 18, textAlign: 'center' },
  meaningLine: { fontSize: typography.sizes.md, lineHeight: 20, textAlign: 'center' },
  missed: { gap: spacing.xs, alignSelf: 'stretch', marginTop: spacing.sm },
  missedTitle: { ...sectionLabel, marginBottom: spacing.xs },
  missedRow: { alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, borderRadius: radii.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  // inside a card the rows are its lines, the card's own ground showing through
  missedRowCard: { paddingHorizontal: 0 },
  missedWord: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  missedMeaning: { flexShrink: 1, fontSize: typography.sizes.sm },
});
