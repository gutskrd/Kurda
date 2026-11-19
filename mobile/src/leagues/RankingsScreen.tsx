import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StyleSheet, View } from 'react-native';
import type { LeagueView } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { GradientBackground } from '../theme/glass';
import { useI18n } from '../i18n/I18nContext';
import { getLeague } from '../ranks/api';
import { LeagueCard } from './LeagueCard';
import { LeagueMoment } from './LeagueMoment';
import { Leaderboard, type RankKind, type Scope, type XpSpan } from './Leaderboard';

/**
 * Rankings: by XP, Zêr or Gewher. XP is this week's by default, with your league first as a card that opens the whole
 * league (LeagueScreen), or all time's. A link may name what to open on (`board`, `span`); the old league address
 * opens on XP this week.
 */
export function RankingsScreen({ board, span, onExit }: { board?: RankKind; span?: XpSpan; onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { t } = useI18n();
  const navigation = useNavigation<RootNavigation>();
  const [kind, setKind] = useState<RankKind>(board ?? 'xp');
  const [xpSpan, setXpSpan] = useState<XpSpan>(span ?? 'week');
  const [scope, setScope] = useState<Scope>('global');
  // Opened again with a choice named, as from the league's old address, the screen turns to it.
  useEffect(() => {
    if (board) setKind(board);
    if (span) setXpSpan(span);
  }, [board, span]);

  const [league, setLeague] = useState<LeagueView | null>(null);
  const [leagueFailed, setLeagueFailed] = useState(false);
  const loadLeague = useCallback(
    () =>
      getLeague(client).then((res) => {
        if (res.ok) setLeague(res.data);
        setLeagueFailed(!res.ok);
      }),
    [client],
  );
  useFocusEffect(
    useCallback(() => {
      void loadLeague();
    }, [loadLeague]),
  );

  // This week's XP is the league's: the reader's own group comes first, unless it could not be read.
  const week = kind === 'xp' && xpSpan === 'week';
  return (
    <GradientBackground>
      <View style={styles.screen}>
        <ScreenHeader title={t('rankings.title')} onBack={onExit} leading="close" />
        {/* The week that closed: its ceremony, once, the first time the rankings are opened after. */}
        <LeagueMoment league={league} />
        <Leaderboard
          kind={kind}
          span={xpSpan}
          scope={scope}
          onKind={setKind}
          onSpan={setXpSpan}
          onScope={setScope}
          header={week && !leagueFailed ? <LeagueCard league={league} onOpen={() => navigation.navigate('LeagueTable')} /> : null}
        />
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
});
