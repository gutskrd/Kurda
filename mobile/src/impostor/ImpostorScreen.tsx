import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { GameDialect, ImpostorBoard, ImpostorOutcome } from '@kurda/shared';
import { leftResults } from '../feedback/gameFinished';
import { useI18n } from '../i18n/I18nContext';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { GameRoom } from '../play/GameRoom';
import { useGameView } from '../play/useGameView';
import { PARTY_DIALECT_NAME, PARTY_LEVEL_KEY, PartyStart } from '../party/PartyStart';
import { ClayButton, GlassCard, GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';
import { categoriesAt, useImpostorCategories } from './categories';
import { CouchGame } from './CouchGame';
import { ImpostorBoardView, ImpostorReveal } from './ImpostorBoard';

/**
 * Kurdish Impostor on the phone: without an id, the start (how to play, a game
 * with friends, a code), offered only where approved word cards are; with one,
 * the room (play/GameRoom.tsx) with the table inside. A code, an invite, a
 * card or the next round opens a room here as new params on the same screen.
 * From the start, "Play on this phone" opens the game for people in one room
 * (CouchGame.tsx); the back arrow there returns to the start.
 */
export function ImpostorScreen({ id: initialId, onExit }: { id?: string; onExit: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const [id, setId] = useState<string | null>(initialId ?? null);
  const [couch, setCouch] = useState(false);
  useEffect(() => {
    if (initialId) setId(initialId);
  }, [initialId]);
  const onOnePhone = couch && !id;
  useEffect(() => () => leftResults(), [id]);
  return (
    <GradientBackground>
      <ScreenHeader title={t(onOnePhone ? 'games.couch.title' : 'games.impostor.name')} onBack={onOnePhone ? () => setCouch(false) : onExit} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {id ? (
          <Room key={id} id={id} onNew={() => setId(null)} onOpen={setId} />
        ) : couch ? (
          <CouchGame onLeave={() => setCouch(false)} />
        ) : (
          <PartyStart
            game="impostor"
            icon="people"
            introKey="games.impostor.intro"
            steps={['games.impostor.how.card', 'games.impostor.how.clues', 'games.impostor.how.vote']}
            blurbKey="games.impostor.withFriendsBlurb"
            notOfferedKey="games.impostor.notOffered"
            also={<CouchWay onOpen={() => setCouch(true)} />}
          />
        )}
      </ScrollView>
    </GradientBackground>
  );
}

/** The other way to play, for people sitting together: this one phone, passed round. */
function CouchWay({ onOpen }: { onOpen: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <GlassCard style={styles.way}>
      <Text accessibilityRole="header" style={[styles.wayTitle, { color: colors.textPrimary }]}>
        {t('games.couch.title')}
      </Text>
      <Text style={[styles.wayBlurb, { color: colors.textSecondary }]}>{t('games.couch.blurb')}</Text>
      <View style={styles.stretch}>
        <ClayButton label={t('games.couch.open')} icon="device-phone" onPress={onOpen} />
      </View>
    </GlassCard>
  );
}

type LobbySettings = { difficulty?: keyof typeof PARTY_LEVEL_KEY; clueSeconds?: number; category?: string | null };

/**
 * What a lobby plays with, for the people waiting in it: the variety, the
 * level, the category when the host chose one (by its Kurdish name, read from
 * the list the host chose in) and the time for a clue.
 */
function LobbyNote({ dialect, settings }: { dialect: GameDialect; settings: LobbySettings }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const offer = useImpostorCategories(settings.category ? dialect : null);
  const category = categoriesAt(offer, settings.difficulty).find((c) => c.slug === settings.category);
  const level = settings.difficulty && PARTY_LEVEL_KEY[settings.difficulty] ? ` · ${t(PARTY_LEVEL_KEY[settings.difficulty])}` : '';
  return (
    <Text style={[styles.note, { color: colors.textSecondary }]}>
      {PARTY_DIALECT_NAME[dialect]}
      {level}
      {category ? ` · ${category.ku}` : ''}
      {settings.clueSeconds ? ` · ${t('games.party.seconds', { count: settings.clueSeconds })}` : ''}
    </Text>
  );
}

function Room({ id, onNew, onOpen }: { id: string; onNew: () => void; onOpen: (id: string) => void }): React.JSX.Element {
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
      lobbyNote={(v) => <LobbyNote dialect={v.dialect} settings={v.settings as LobbySettings} />}
      playing={(v) => <ImpostorBoardView view={v} skew={room.skew} move={room.move} />}
      ending={(v) => <ImpostorReveal view={v} />}
      scoreOf={(r) => t('games.party.points', { count: r.score })}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  note: { fontSize: typography.sizes.sm, textAlign: 'center' },
  way: { alignItems: 'center', gap: spacing.sm },
  wayTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, textAlign: 'center' },
  wayBlurb: { fontSize: typography.sizes.md, textAlign: 'center', lineHeight: 22 },
  stretch: { alignSelf: 'stretch', marginTop: spacing.sm },
});
