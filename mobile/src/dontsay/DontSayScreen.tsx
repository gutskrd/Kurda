import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { dontSayMode, dontSayStartProblem, type DontSayBoard, type DontSayOutcome } from '@kurda/shared';
import { leftResults } from '../feedback/gameFinished';
import { useI18n } from '../i18n/I18nContext';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { GameRoom } from '../play/GameRoom';
import { useGameView } from '../play/useGameView';
import { PARTY_DIALECT_NAME, PARTY_LEVEL_KEY, PartyStart } from '../party/PartyStart';
import { GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';
import { DontSayBoardView, DontSayEnding } from './DontSayBoard';

/**
 * Don't Say the Word! on the phone: without an id, the start; with one, the
 * room (play/GameRoom.tsx), where the lobby is the two teams to choose from
 * and the game is the card table. Only the describer's view holds the card.
 */
export function DontSayScreen({ id: initialId, onExit }: { id?: string; onExit: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const [id, setId] = useState<string | null>(initialId ?? null);
  useEffect(() => {
    if (initialId) setId(initialId);
  }, [initialId]);
  useEffect(() => () => leftResults(), [id]);
  return (
    <GradientBackground>
      <ScreenHeader title={t('games.dontSay.name')} onBack={onExit} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {id ? (
          <Room key={id} id={id} onNew={() => setId(null)} onOpen={setId} />
        ) : (
          <PartyStart
            game="dont-say"
            icon="block"
            introKey="games.dontSay.intro"
            steps={['games.dontSay.how.describe', 'games.dontSay.how.guess', 'games.dontSay.how.teams']}
            blurbKey="games.dontSay.withFriendsBlurb"
            notOfferedKey="games.dontSay.notOffered"
          />
        )}
      </ScrollView>
    </GradientBackground>
  );
}

function Room({ id, onNew, onOpen }: { id: string; onNew: () => void; onOpen: (id: string) => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const room = useGameView<DontSayBoard | null, DontSayOutcome>('dont-say', id, {
    // the moment to get ready ends on the board's own clock; the server's deadline is the turn's end
    deadlineOf: (v) => v.board?.turn?.endsAt ?? null,
  });
  return (
    <GameRoom
      game="dont-say"
      id={id}
      room={room}
      onNew={onNew}
      onOpen={onOpen}
      newLabel={t('games.dontSay.name')}
      lobbyNote={(v) => {
        const d = (v.settings as { difficulty?: keyof typeof PARTY_LEVEL_KEY }).difficulty;
        return (
          <Text style={[styles.note, { color: colors.textSecondary }]}>
            {PARTY_DIALECT_NAME[v.dialect]}
            {d && PARTY_LEVEL_KEY[d] ? ` · ${t(PARTY_LEVEL_KEY[d])}` : ''}
          </Text>
        );
      }}
      teamNote={(v) => {
        const present = v.players.filter((p) => !p.gone).length;
        return <Text style={[styles.note, { color: colors.textSecondary }]}>{dontSayMode(present) === 'coop' ? t('games.dontSay.coopNote') : t('games.dontSay.teamsNote')}</Text>;
      }}
      startProblem={(v) => (dontSayStartProblem(v.players.filter((p) => !p.gone).map((p) => ({ team: p.team }))) === 'teams-uneven' ? t('play.teams.uneven') : null)}
      playing={(v) => <DontSayBoardView view={v} skew={room.skew} move={room.move} />}
      ending={(v) => <DontSayEnding view={v} />}
      scoreOf={(r) => t('games.party.points', { count: r.score })}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  note: { fontSize: typography.sizes.sm, textAlign: 'center' },
});
