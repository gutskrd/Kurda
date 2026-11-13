import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import type { GameDialect, ImpostorBoard, ImpostorOutcome } from '@kurda/shared';
import { leftResults } from '../feedback/gameFinished';
import { useI18n } from '../i18n/I18nContext';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { GameRoom } from '../play/GameRoom';
import { useGameView } from '../play/useGameView';
import { PARTY_DIALECT_NAME, PARTY_LEVEL_KEY } from '../party/PartyStart';
import { GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';
import { categoriesAt, useImpostorCategories } from './categories';
import { CouchGame } from './CouchGame';
import { ImpostorBoardView, ImpostorReveal } from './ImpostorBoard';
import { ImpostorStart, type CouchAsk } from './ImpostorStart';

/**
 * Impostor on the phone: without an id, the start (ImpostorStart.tsx:
 * the game in a line and one thing to press), offered only where approved
 * word cards are; with one, the room (play/GameRoom.tsx) with the table
 * inside. A code, an invite, a
 * card or the next round opens a room here as new params on the same screen.
 * From the start, "Play on this phone" opens the game for people in one room
 * (CouchGame.tsx); the back arrow there returns to the start.
 */
export function ImpostorScreen({ id: initialId, onExit }: { id?: string; onExit: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const [id, setId] = useState<string | null>(initialId ?? null);
  // the game on one phone, and what was chosen on the way into it (a way to play, a category)
  const [couch, setCouch] = useState<CouchAsk | null>(null);
  useEffect(() => {
    if (initialId) setId(initialId);
  }, [initialId]);
  const onOnePhone = couch !== null && !id;
  useEffect(() => () => leftResults(), [id]);
  return (
    <GradientBackground>
      <ScreenHeader title={t(onOnePhone ? 'games.couch.title' : 'games.impostor.name')} onBack={onOnePhone ? () => setCouch(null) : onExit} />
      {onOnePhone ? (
        // the game on one phone scrolls itself, so its button can stay under the list
        <CouchGame ask={couch} onLeave={() => setCouch(null)} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {id ? <Room key={id} id={id} onNew={() => setId(null)} onOpen={setId} /> : <ImpostorStart onCouch={(ask) => setCouch(ask ?? {})} />}
        </ScrollView>
      )}
    </GradientBackground>
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
});
