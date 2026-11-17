import { Linking, StyleSheet, Text, View } from 'react-native';
import type { StoryDetail, StorySourceType } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { textIn } from '../lore/labels';
import { openableSourceUrl } from '../lore/sourceLink';
import { useDirection } from '../reports/direction';
import { Icon } from '../theme/Icon';
import { heldDim } from '../theme/MotionParts';
import { Pressable } from '../theme/Pressable';
import { useTheme } from '../theme/ThemeProvider';
import { displayFont, sectionLabel } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { noteIn, reflectionIn } from './legend';
import { storyTextProps, storyTextStyle } from './storyText';

/**
 * What follows a legend once it is read, under the check: questions to
 * think about, what is known about the story, and where it comes from. One
 * column with room between the parts, each under a quiet label — not a wall
 * of cards — and every Kurdish text in the story's own direction with the
 * reader's translation under it (English where theirs has none yet).
 *
 * "Think about it" is the story's reflections: open questions, nothing to
 * answer here, nothing scored and no XP. "Behind the story" is its notes —
 * what is history and what is legend, how the versions differ, what a custom
 * in it means. The sources say what each one is (a historical record, a
 * legend as collected, an oral telling, a literary work, an adaptation) and
 * open the ones that are online in the browser.
 */

export const SOURCE_TYPE_KEY: Record<StorySourceType, TranslationKey> = {
  historical: 'stories.source.historical',
  legendary: 'stories.source.legendary',
  oral: 'stories.source.oral',
  literary: 'stories.source.literary',
  adapted: 'stories.source.adapted',
};

type Story = Pick<StoryDetail, 'dialect' | 'reflections' | 'notes' | 'sources'>;

function Label({ children }: { children: string }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <Text style={[sectionLabel, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
      {children}
    </Text>
  );
}

/** Think about it: the reflections, numbered, each with its translation. Nothing to submit. */
export function Reflections({ story }: { story: Story }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  if (story.reflections.length === 0) return null;
  const ku = { style: storyTextStyle(story.dialect), props: storyTextProps(story.dialect) };
  return (
    <View style={styles.part} testID="story-reflections">
      <Label>{t('stories.after.think')}</Label>
      <Text style={[styles.line, dir.text, { color: colors.textSecondary }]}>{t('stories.after.thinkLine')}</Text>
      <View style={styles.list}>
        {story.reflections.map((r, i) => {
          const said = reflectionIn(r, story, locale);
          return (
            <View key={i} style={[styles.reflection, { flexDirection: dir.row }]}>
              <View style={[styles.number, { backgroundColor: colors.controlTrack }]}>
                <Text style={[styles.numberText, { color: colors.textSecondary }]}>{i + 1}</Text>
              </View>
              <View style={styles.flex}>
                <Text {...ku.props} style={[styles.reflectionText, { color: colors.textPrimary }, ku.style]}>
                  {r.text}
                </Text>
                {said ? (
                  <Text {...textIn(said.lang).props} style={[styles.translation, { color: colors.textSecondary }, textIn(said.lang).style]}>
                    {said.text}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Behind the story: each note under its own title, in Kurdish and in the reader’s language. */
export function AboutStory({ story }: { story: Story }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  if (story.notes.length === 0) return null;
  const ku = { style: storyTextStyle(story.dialect), props: storyTextProps(story.dialect) };
  return (
    <View style={styles.part} testID="story-notes">
      <Label>{t('stories.after.about')}</Label>
      {story.notes.map((n, i) => {
        const said = noteIn(n, story, locale);
        const tr = said ? textIn(said.lang) : null;
        return (
          <View key={`${n.kind}-${i}`} style={styles.note}>
            <Text {...ku.props} style={[styles.noteTitle, { color: colors.textPrimary }, ku.style]}>
              {n.title}
            </Text>
            {said && tr && said.title !== n.title ? (
              <Text {...tr.props} style={[styles.noteTitleTr, { color: colors.textSecondary }, tr.style]}>
                {said.title}
              </Text>
            ) : null}
            <Text {...ku.props} style={[styles.body, { color: colors.textPrimary }, ku.style]}>
              {n.body}
            </Text>
            {said && tr ? (
              <Text {...tr.props} style={[styles.translation, { color: colors.textSecondary }, tr.style]}>
                {said.body}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** The sources a telling draws on: what kind each is, its title and author, and a link where it is online. */
export function StorySources({ story }: { story: Story }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  if (story.sources.length === 0) return null;
  return (
    <View style={styles.part} testID="story-sources">
      <Label>{t('lore.sources')}</Label>
      <View style={styles.sources}>
        {story.sources.map((s, i) => {
          // only an https address is a link (lore/sourceLink.ts); any other source reads as plain text
          const url = openableSourceUrl(s.url);
          const body = (
            <View style={styles.flex}>
              <Text style={[styles.sourceType, dir.text, { color: colors.textSecondary }]}>{t(SOURCE_TYPE_KEY[s.type])}</Text>
              <Text style={[styles.sourceTitle, dir.free, { color: url ? colors.primary : colors.textPrimary }]}>{s.title}</Text>
              {s.author ? <Text style={[styles.sourceMeta, dir.free, { color: colors.textSecondary }]}>{s.author}</Text> : null}
              {s.note ? <Text style={[styles.sourceMeta, dir.free, { color: colors.textSecondary }]}>{s.note}</Text> : null}
            </View>
          );
          return url ? (
            <Pressable
              key={`${s.title}-${i}`}
              onPress={() => void Linking.openURL(url).catch(() => undefined)}
              accessibilityRole="link"
              accessibilityLabel={`${s.title}, ${t(SOURCE_TYPE_KEY[s.type])}`}
              accessibilityHint={t('lore.source.open')}
              style={({ pressed }) => [styles.source, { flexDirection: dir.row }, pressed && heldDim]}
            >
              {body}
              <Icon name="link" size={16} color={colors.primary} />
            </Pressable>
          ) : (
            <View key={`${s.title}-${i}`} style={[styles.source, { flexDirection: dir.row }]}>
              {body}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  part: { gap: spacing.sm },
  line: { fontSize: typography.sizes.sm, lineHeight: 20 },
  list: { gap: spacing.md, marginTop: spacing.xs },
  reflection: { alignItems: 'flex-start', gap: spacing.md },
  number: { width: 28, height: 28, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  numberText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  flex: { flex: 1, gap: 2 },
  // the story's own serif at book weight, as its text is set: a question to think over, not a heading
  reflectionText: { fontFamily: displayFont, fontWeight: typography.weights.regular, fontSize: typography.sizes.md, lineHeight: Math.round(typography.sizes.md * 1.5) },
  translation: { fontSize: typography.sizes.sm, lineHeight: 21 },
  note: { gap: spacing.xs, marginTop: spacing.xs },
  noteTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  noteTitleTr: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  body: { fontSize: typography.sizes.md, lineHeight: 25 },
  sources: { gap: spacing.xs },
  source: { alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET, paddingVertical: spacing.xs },
  sourceType: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 0.6, textTransform: 'uppercase' },
  sourceTitle: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, lineHeight: 20 },
  sourceMeta: { fontSize: typography.sizes.xs, lineHeight: 18 },
});
