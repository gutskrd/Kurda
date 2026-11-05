import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import type { ImpostorBoard, ImpostorOutcome } from '@kurda/shared';
import { leftResults } from '../feedback/gameFinished';
import { useI18n } from '../i18n/I18nContext';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { GameRoom } from '../play/GameRoom';
import { useGameView } from '../play/useGameView';
import { PARTY_DIALECT_NAME, PARTY_LEVEL_KEY, PartyStart } from '../party/PartyStart';
import { GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';
import { ImpostorBoardView, ImpostorReveal } from './ImpostorBoard';

/**
 * Kurdish Impostor on the phone: without an id, the start (how to play, a game
 * with friends, a code), offered only where approved word cards are; with one,
 * the room (play/GameRoom.tsx) with the table inside. A code, an invite, a
 * card or the next round opens a room here as new params on the same screen.
 */
export function ImpostorScreen({ id: initialId, onExit }: { id?: string; onExit: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const [id, setId] = useState<string | null>(initialId ?? null);
  useEffect(() => {
    if (initialId) setId(initialId);
  }, [initialId]);
  useEffect(() => () => leftResults(), [id]);
  return (
    <GradientBackground>
      <ScreenHeader title={t('games.impostor.name')} onBack={onExit} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {id ? (
          <Room key={id} id={id} onNew={() => setId(null)} onOpen={setId} />
        ) : (
          <PartyStart
            game="impostor"
            icon="people"
            introKey="games.impostor.intro"
            steps={['games.impostor.how.card', 'games.impostor.how.clues', 'games.impostor.how.vote']}
            blurbKey="games.impostor.withFriendsBlurb"
            notOfferedKey="games.impostor.notOffered"
          />
        )}
      </ScrollView>
    </GradientBackground>
  );
}

function Room({ id, onNew, onOpen }: { id: string; onNew: () => void; onOpen: (id: string) => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const room = useGameView<ImpostorBoard | null, ImpostorOutcome>('impostor', id, {
    deadlineOf: (v) => v.board?.turn?.endsAt ?? v.board?.vote?.endsAt ?? v.board?.guess?.endsAt ?? null,
  });
  return (
    <GameRoom
      game="impostor"
      id={id}
      room={room}
      onNew={onNew}
      onOpen={onOpen}
      newLabel={t('games.impostor.name')}
      lobbyNote={(v) => {
        const s = v.settings as { difficulty?: keyof typeof PARTY_LEVEL_KEY; clueSeconds?: number };
        const level = s.difficulty && PARTY_LEVEL_KEY[s.difficulty] ? ` · ${t(PARTY_LEVEL_KEY[s.difficulty])}` : '';
        return (
          <Text style={[styles.note, { color: colors.textSecondary }]}>
            {PARTY_DIALECT_NAME[v.dialect]}
            {level}
            {s.clueSeconds ? ` · ${t('games.party.seconds', { count: s.clueSeconds })}` : ''}
          </Text>
        );
      }}
      playing={(v) => <ImpostorBoardView view={v} skew={room.skew} move={room.move} />}
      ending={(v) => <ImpostorReveal view={v} />}
      scoreOf={(r) => t('games.party.points', { count: r.score })}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  note: { fontSize: typography.sizes.sm, textAlign: 'center' },
});
