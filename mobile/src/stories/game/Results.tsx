import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StoryDetail, StoryGameStanding, StoryGameView } from '@kurda/shared';
import { useAuth } from '../../auth/AuthContext';
import { ClayButton } from '../../theme/glass';
import { Icon } from '../../theme/Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { display, statCaption, statValue } from '../../theme/fonts';
import { radii, spacing, typography } from '../../theme/tokens';
import { useI18n } from '../../i18n/I18nContext';
import { InviteSheet } from '../../play/InviteSheet';
import { RematchPanel } from '../../play/RematchPanel';
import { createGame } from '../api';
import { createErrorMessage } from '../SetupSheet';
import { evidenceText } from '../segments';
import { quoted, storyTextProps, storyTextStyle } from '../storyText';
import { Card, Note, SectionLabel, useFocusOn } from '../ui';
import { bySeat, duoTotals, reviewOrder, standingsLayout } from './results';

/** A standing's name as this viewer may see it. */
function nameOf(s: StoryGameStanding, t: (k: 'stories.player' | 'games.you', v?: Record<string, string | number>) => string): string {
  if (s.isMe) return t('games.you');
  return s.name ?? t('stories.player', { seat: s.seat });
}

/**
 * The end of a game (contract §A1 "Results"): how everyone did, laid out for
 * the number of players (no places for two; a podium only from four), what
 * this game earned you and whether it counted as a day of learning, every
 * question again with the missed ones first, and what next — play again with
 * the same people, read the story again, or go back to the stories.
 */
export function Results({
  view,
  story,
  onOpenGame,
  onRead,
  onBack,
}: {
  view: StoryGameView;
  story: StoryDetail | null;
  onOpenGame: (id: string) => void;
  onRead: () => void;
  onBack: () => void;
}): React.JSX.Element | null {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const headRef = useRef<Text>(null);
  const [again, setAgain] = useState(false);
  const [againError, setAgainError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  useFocusOn(headRef, view.results ? view.id : null);
  const results = view.results;
  if (!results) return null;
  const me = results.me;
  const layout = standingsLayout(view.mode, results.standings);
  const total = me?.total ?? view.settings.questionCount;
  const dialect = view.settings.dialect;
  const dir = storyTextStyle(dialect);
  const props = storyTextProps(dialect);
  const other = results.standings.find((s) => !s.isMe);

  /** Alone: the same story and settings again, straight to the questions. */
  const soloAgain = async (): Promise<void> => {
    setAgain(true);
    setAgainError(null);
    const s = view.settings;
    const res = await createGame(client, {
      mode: 'solo',
      storyId: s.storyId,
      questionCount: s.questionCount,
      timerSeconds: s.timerSeconds,
      textDuring: s.textDuring,
      access: 'friends',
      skipReading: true,
      extraTime: view.extraTime,
    });
    setAgain(false);
    if (res.ok) onOpenGame(res.data.id);
    else setAgainError(createErrorMessage(res.error, t));
  };

  return (
    <>
      <Text ref={headRef} style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
        {t('stories.results.title')}
      </Text>

      {me ? (
        <Card style={styles.meCard}>
          <View style={styles.stats}>
            <View style={styles.stat} accessible accessibilityLabel={t('stories.results.rightOf', { correct: me.correct, total })}>
              <Text style={[statValue, { color: colors.textPrimary }]}>
                {me.correct}/{total}
              </Text>
              <Text style={[statCaption, { color: colors.textSecondary }]}>{t('stories.results.right')}</Text>
            </View>
            <View style={styles.stat} accessible accessibilityLabel={t('stories.results.xpLabel', { xp: me.xp })}>
              <Text style={[statValue, { color: colors.gold }]}>+{me.xp}</Text>
              <Text style={[statCaption, { color: colors.textSecondary }]}>XP</Text>
            </View>
          </View>
          {me.learningCounted ? (
            <View style={styles.counted}>
              <Icon name="flame" size={16} color={colors.success} />
              <Text style={[styles.countedText, { color: colors.success }]}>{t('stories.results.counted')}</Text>
            </View>
          ) : (
            <Text style={[styles.notCounted, { color: colors.textSecondary }]}>{t('stories.results.notCounted')}</Text>
          )}
        </Card>
      ) : null}

      {layout === 'duo' ? (
        <Card style={styles.card}>
          <Text style={[styles.duo, { color: colors.textPrimary }]}>
            {/* you first, then the other: two people need no places */}
            {[...results.standings]
              .sort((a, b) => Number(b.isMe) - Number(a.isMe))
              .map((s) => `${nameOf(s, t)} ${s.correct}/${total}`)
              .join(' · ')}
          </Text>
          <Text style={[styles.together, { color: colors.textSecondary }]}>
            {t('stories.results.together', duoTotals(results.standings, total))}
          </Text>
        </Card>
      ) : layout === 'seats' ? (
        <Card style={styles.card}>
          {bySeat(results.standings).map((s) => (
            <View key={s.seat} style={styles.standing}>
              <Text style={[styles.standingName, { color: colors.textPrimary }]} numberOfLines={1}>
                {nameOf(s, t)}
              </Text>
              <Text style={[styles.standingScore, { color: colors.textSecondary }]}>
                {s.correct}/{total}
                {s.isMe ? ` · ${t('stories.results.place', { place: s.place })}` : ''}
              </Text>
            </View>
          ))}
        </Card>
      ) : layout === 'podium' ? (
        <Card style={styles.card}>
          {results.standings.map((s) => (
            <View key={s.seat} style={styles.standing}>
              <View style={[styles.place, { backgroundColor: s.place <= 3 ? colors.gold : colors.controlTrack }]}>
                <Text style={[styles.placeText, { color: s.place <= 3 ? colors.textOnPrimary : colors.textPrimary }]}>{s.place}</Text>
              </View>
              <Text style={[styles.standingName, { color: colors.textPrimary }, s.isMe && styles.bold]} numberOfLines={1}>
                {nameOf(s, t)}
              </Text>
              <Text style={[styles.standingScore, { color: colors.textSecondary }]}>
                {s.correct}/{total}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      <View style={styles.actions}>
        {view.mode === 'solo' ? (
          <ClayButton label={t('stories.results.again')} icon="repost" tone="primary" size="large" busy={again} onPress={() => void soloAgain()} />
        ) : (
          <RematchPanel
            game="stories"
            lobbyId={view.id}
            other={other ? nameOf(other, t) : t('stories.player', { seat: 2 })}
            onOpen={onOpenGame}
            onInviteOthers={() => setInviting(true)}
          />
        )}
        {againError ? <Note tone="danger" icon="alert">{againError}</Note> : null}
        <ClayButton label={t('stories.results.readAgain')} icon="story" onPress={onRead} />
        <ClayButton label={t('stories.results.back')} variant="outline" onPress={onBack} />
      </View>

      {results.review.length > 0 ? (
        <View style={styles.review}>
          <SectionLabel>{t('stories.results.review')}</SectionLabel>
          {reviewOrder(results.review).map((item) => {
            const right = item.myChoice === item.correctIndex;
            const quote = story ? evidenceText(story.paragraphs, item.evidenceParagraph, item.evidenceSentence) : null;
            return (
              <Card key={item.index} style={styles.card} padding="tight">
                <View style={styles.reviewHead}>
                  <Icon name={right ? 'check' : 'close'} size={16} color={right ? colors.success : colors.danger} />
                  <Text style={[styles.reviewIndex, { color: right ? colors.success : colors.danger }]}>
                    {t('stories.questionOf', { index: item.index + 1, total })} · {right ? t('stories.reveal.right') : item.myChoice === null ? t('stories.reveal.noAnswer') : t('stories.reveal.wrong')}
                  </Text>
                </View>
                <Text {...props} style={[styles.reviewPrompt, { color: colors.textPrimary }, dir]}>
                  {item.prompt}
                </Text>
                <Text style={[styles.reviewLabel, { color: colors.success }]}>{t('stories.reveal.rightAnswer')}</Text>
                <Text {...props} style={[styles.reviewText, { color: colors.textPrimary }, dir]}>
                  {item.options[item.correctIndex]}
                </Text>
                {!right && item.myChoice !== null ? (
                  <>
                    <Text style={[styles.reviewLabel, { color: colors.danger }]}>{t('stories.reveal.yourAnswer')}</Text>
                    <Text {...props} style={[styles.reviewText, { color: colors.textPrimary }, dir]}>
                      {item.options[item.myChoice]}
                    </Text>
                  </>
                ) : null}
                {item.explanation ? (
                  <Text {...props} style={[styles.reviewText, { color: colors.textSecondary }, dir]}>
                    {item.explanation}
                  </Text>
                ) : null}
                {quote ? (
                  <Text {...props} style={[styles.reviewQuote, { color: colors.textSecondary }, dir]}>
                    {quoted(quote, dialect)}
                  </Text>
                ) : null}
              </Card>
            );
          })}
        </View>
      ) : null}

      {inviting ? <InviteSheet target={{ kind: 'new', game: 'stories' }} onClose={() => setInviting(false)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  title: { ...display(typography.sizes.xl), textAlign: 'center' },
  meCard: { gap: spacing.md, alignItems: 'center' },
  stats: { flexDirection: 'row', gap: spacing.xl },
  stat: { alignItems: 'center', gap: 2 },
  counted: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  countedText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  notCounted: { fontSize: typography.sizes.sm, textAlign: 'center', lineHeight: 20 },
  card: { gap: spacing.sm },
  duo: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, textAlign: 'center' },
  together: { fontSize: typography.sizes.sm, textAlign: 'center' },
  standing: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 36 },
  standingName: { flex: 1, fontSize: typography.sizes.md },
  standingScore: { fontSize: typography.sizes.sm },
  bold: { fontWeight: typography.weights.bold },
  place: { width: 28, height: 28, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  placeText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  actions: { gap: spacing.sm },
  review: { gap: spacing.sm },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  reviewIndex: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
  reviewPrompt: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, lineHeight: 22 },
  reviewLabel: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, marginTop: spacing.xs },
  reviewText: { fontSize: typography.sizes.sm, lineHeight: 20 },
  reviewQuote: { fontSize: typography.sizes.sm, lineHeight: 20, fontStyle: 'italic' },
});
