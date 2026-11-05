import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { dialectDirection, type BluffBoard, type BluffOutcome } from '@kurda/shared';
import { leftResults } from '../feedback/gameFinished';
import { useI18n } from '../i18n/I18nContext';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { GameRoom, multiSeatName } from '../play/GameRoom';
import { InviteSheet } from '../play/InviteSheet';
import { JoinCodeCard } from '../play/JoinByCode';
import { useGameView } from '../play/useGameView';
import { ClayButton, GlassCard, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { groupDialects, useMpAvailability } from '../games/mpAvailability';
import { languageName } from '../games/partyChoices';
import { BluffTableView, RevealPhase } from './BluffTable';

/** A dialect is called by its own name in every language, the way a language is. */
const DIALECT_NAME = { kmr: 'Kurmancî', ckb: 'Soranî' } as const;

/**
 * Kurdish Bluff on the phone: three to eight friends, one rare Kurdish word a
 * round, everyone's made-up meaning against the real one. Without an id, the
 * start: how it is played, and a game with friends through the invite sheet
 * (the language the meanings are written in, the words, the time to write),
 * offered only where reviewed cards allow. With one, the room
 * (play/GameRoom.tsx) with the table inside. A code, an invite, a card or a
 * rematch opens a room here as new params, and the room follows them.
 */
export function BluffScreen({ id: initialId, onExit }: { id?: string; onExit: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const [id, setId] = useState<string | null>(initialId ?? null);
  useEffect(() => {
    if (initialId) setId(initialId);
  }, [initialId]);
  useEffect(() => () => leftResults(), [id]);
  return (
    <GradientBackground>
      <ScreenHeader title={t('games.bluff.name')} onBack={onExit} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {id ? <Room key={id} id={id} onNew={() => setId(null)} onOpen={setId} /> : <Start />}
      </ScrollView>
    </GradientBackground>
  );
}

function Start(): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const offers = useMpAvailability('bluff');
  const [inviting, setInviting] = useState(false);
  if (offers === null) return <ActivityIndicator color={colors.primary} style={styles.loading} />;
  if (groupDialects(offers).length === 0) {
    return (
      <GlassCard style={styles.card}>
        <Icon name="quotes" size={40} tone="primary" />
        <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t('games.bluff.notOffered')}</Text>
      </GlassCard>
    );
  }
  return (
    <>
      <GlassCard style={styles.card}>
        <Icon name="quotes" size={40} tone="primary" />
        <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t('games.bluff.intro')}</Text>
      </GlassCard>
      <GlassCard style={styles.card}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>
          {t('games.lastLetter.withFriends')}
        </Text>
        <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t('games.bluff.withFriendsBlurb')}</Text>
        <ClayButton label={t('games.lastLetter.withFriends')} icon="people" tone="primary" onPress={() => setInviting(true)} style={styles.stretch} />
      </GlassCard>
      <JoinCodeCard />
      {inviting ? <InviteSheet target={{ kind: 'new', game: 'bluff' }} onClose={() => setInviting(false)} /> : null}
    </>
  );
}

function Room({ id, onNew, onOpen }: { id: string; onNew: () => void; onOpen: (id: string) => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const room = useGameView<BluffBoard | null, BluffOutcome>('bluff', id, { deadlineOf: (v) => v.board?.phaseEndsAt ?? null });
  return (
    <GameRoom
      game="bluff"
      id={id}
      room={room}
      onNew={onNew}
      onOpen={onOpen}
      newLabel={t('games.bluff.name')}
      lobbyNote={(v) => {
        const s = v.settings as { language?: string; rounds?: number };
        return (
          <Text style={[styles.note, { color: colors.textSecondary }]}>
            {DIALECT_NAME[v.dialect]}
            {s.language ? ` · ${languageName(s.language)}` : ''}
            {s.rounds ? ` · ${t('games.bluff.roundsCount', { count: s.rounds })}` : ''}
          </Text>
        );
      }}
      playing={(v) => <BluffTableView view={v} skew={room.skew} move={room.move} />}
      ending={(v) => {
        const history = v.board?.history ?? [];
        if (history.length === 0) return null;
        const name = (seat: number): string => {
          const p = v.players.find((x) => x.seat === seat);
          return p ? multiSeatName(p, t) : t('stories.player', { seat });
        };
        const dir = dialectDirection(v.dialect);
        return (
          <View style={styles.words}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>
              {t('games.bluff.wordsPlayed')}
            </Text>
            {history.map((r) => (
              <View key={r.round} style={styles.word}>
                <Text style={[styles.wordText, { color: colors.textPrimary, writingDirection: dir.dir }]}>
                  {r.word}
                </Text>
                <Text style={[styles.blurb, { color: colors.textSecondary }]}>{r.real}</Text>
              </View>
            ))}
            {history.length > 0 ? (
              <View style={styles.lastReveal}>
                <RevealPhase reveal={history[history.length - 1]!} mySeat={v.me?.seat ?? null} name={name} dialect={v.dialect} />
              </View>
            ) : null}
          </View>
        );
      }}
      scoreOf={(r) => t('games.bluff.points', { count: r.score })}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  card: { alignItems: 'center', gap: spacing.sm },
  stretch: { alignSelf: 'stretch', marginTop: spacing.sm },
  loading: { marginTop: spacing.xl },
  title: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, textAlign: 'center' },
  blurb: { fontSize: typography.sizes.md, textAlign: 'center', lineHeight: 22 },
  note: { fontSize: typography.sizes.sm, textAlign: 'center' },
  words: { alignSelf: 'stretch', gap: spacing.sm },
  word: { gap: 2 },
  wordText: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, textAlign: 'center' },
  lastReveal: { borderRadius: radii.lg, padding: spacing.sm, backgroundColor: '#2f4a33' },
});
