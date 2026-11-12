import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  LAST_LETTER_DEFAULT_TURN_SECONDS,
  LAST_LETTER_TURN_SECONDS,
  type LastLetterBoard,
  type LastLetterOutcome,
  type LetterDialect,
  type MultiView,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { leftResults } from '../feedback/gameFinished';
import { useI18n } from '../i18n/I18nContext';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { GameRoom } from '../play/GameRoom';
import { InviteSheet } from '../play/InviteSheet';
import { JoinCodeCard } from '../play/JoinByCode';
import { useGameView } from '../play/useGameView';
import { ClayButton, GlassCard, GradientBackground, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';
import { LastLetterBoardView } from './LastLetterBoard';
import { offeredDialects, useLastLetterAvailability } from './availability';
import { Loading } from '../theme/Loading';

/** A dialect is called by its own name in every language, the way a language is. */
const DIALECT_NAME: Record<LetterDialect, string> = { kmr: 'Kurmancî', ckb: 'Soranî' };

/**
 * The Last Letter on the phone: a word chain in one Kurdish, with friends or
 * against Hevalo. Without an id, the start: how to play, a game with friends
 * (the invite sheet) and a game against Hevalo, each only in the dialects
 * that have what it needs. With one, the room (play/GameRoom.tsx) with the
 * chain inside. A code, an invite, a card or a rematch opens a room here as
 * new params on the same screen, and the room follows them.
 *
 * A game with friends earns XP by where it is finished; a game against Hevalo
 * is played alone and earns none, which the room's results say in one line.
 */
export function LastLetterScreen({ id: initialId, onExit }: { id?: string; onExit: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const [id, setId] = useState<string | null>(initialId ?? null);
  useEffect(() => {
    if (initialId) setId(initialId);
  }, [initialId]);
  useEffect(() => () => leftResults(), [id]);
  return (
    <GradientBackground>
      <ScreenHeader title={t('games.lastLetter.name')} onBack={onExit} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {id ? <Room key={id} id={id} onNew={() => setId(null)} onOpen={setId} /> : <Start onEnter={setId} />}
      </ScrollView>
    </GradientBackground>
  );
}

function Start({ onEnter }: { onEnter: (id: string) => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const answer = useLastLetterAvailability();
  const group = offeredDialects(answer, 'group');
  const solo = offeredDialects(answer, 'solo');
  const [dialect, setDialect] = useState<LetterDialect>(locale === 'ckb' ? 'ckb' : 'kmr');
  const [turn, setTurn] = useState<string>(String(LAST_LETTER_DEFAULT_TURN_SECONDS));
  const [inviting, setInviting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (answer === null) return <Loading style={styles.loading} />;
  if (group.length === 0) {
    return (
      <GlassCard style={styles.card}>
        <Icon name="link" size={40} tone="primary" />
        <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t('games.lastLetter.notOffered')}</Text>
      </GlassCard>
    );
  }
  const soloDialect = solo.includes(dialect) ? dialect : (solo[0] ?? null);

  const againstHevalo = async (): Promise<void> => {
    if (!soloDialect) return;
    setBusy(true);
    setError(null);
    const res = await client.post<MultiView<LastLetterBoard | null>>('/mp/last-letter/solo', { dialect: soloDialect, turnSeconds: Number(turn) });
    setBusy(false);
    if (res.ok && res.data?.id) onEnter(res.data.id);
    else if (!res.ok) setError(describeError(res.error, t));
  };

  return (
    <>
      <GlassCard style={styles.card}>
        <Icon name="link" size={40} tone="primary" />
        <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t('games.lastLetter.intro')}</Text>
      </GlassCard>
      <GlassCard style={styles.card}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>
          {t('games.lastLetter.withFriends')}
        </Text>
        <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t('games.lastLetter.withFriendsBlurb')}</Text>
        <ClayButton label={t('games.lastLetter.withFriends')} icon="people" tone="primary" onPress={() => setInviting(true)} style={styles.stretch} />
      </GlassCard>
      {soloDialect ? (
        <GlassCard style={styles.card}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>
            {t('games.lastLetter.againstHevalo')}
          </Text>
          <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t('games.lastLetter.againstHevaloBlurb')}</Text>
          {solo.length > 1 ? (
            <View style={styles.stretch}>
              <Segmented<LetterDialect> groupLabel={t('games.lastLetter.kurdish')} options={solo} value={soloDialect} onChange={setDialect} labelOf={(d) => DIALECT_NAME[d]} />
            </View>
          ) : null}
          <Text style={[styles.label, { color: colors.textSecondary }]}>{t('games.lastLetter.turnTime')}</Text>
          <View style={styles.stretch}>
            <Segmented<string>
              groupLabel={t('games.lastLetter.turnTime')}
              options={LAST_LETTER_TURN_SECONDS.map(String)}
              value={turn}
              onChange={setTurn}
              labelOf={(s) => t('games.lastLetter.seconds', { count: Number(s) })}
            />
          </View>
          {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
          <ClayButton label={busy ? t('games.starting') : t('games.play')} icon="play" tone="primary" busy={busy} onPress={() => void againstHevalo()} style={styles.stretch} />
        </GlassCard>
      ) : null}
      {/* a game somebody else made: its code opens it, whichever game it turns out to be */}
      <JoinCodeCard />
      {inviting ? <InviteSheet target={{ kind: 'new', game: 'last-letter' }} onClose={() => setInviting(false)} /> : null}
    </>
  );
}

function Room({ id, onNew, onOpen }: { id: string; onNew: () => void; onOpen: (id: string) => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const room = useGameView<LastLetterBoard | null, LastLetterOutcome>('last-letter', id, {
    deadlineOf: (v) => v.board?.turn?.endsAt ?? null,
  });
  return (
    <GameRoom
      game="last-letter"
      id={id}
      room={room}
      onNew={onNew}
      onOpen={onOpen}
      newLabel={t('games.lastLetter.name')}
      lobbyNote={(v) => {
        const s = v.settings as { turnSeconds?: number };
        return (
          <Text style={[styles.note, { color: colors.textSecondary }]}>
            {DIALECT_NAME[v.dialect]}
            {s.turnSeconds ? ` · ${t('games.lastLetter.seconds', { count: s.turnSeconds })}` : ''}
          </Text>
        );
      }}
      playing={(v) => <LastLetterBoardView view={v} skew={room.skew} move={room.move} />}
      ending={(v) => {
        const winner = v.results?.[0];
        const text =
          v.board?.endedBy === 'chain-full'
            ? t('games.lastLetter.chainFull')
            : v.mode === 'solo' && winner && v.players.find((p) => p.seat === winner.seat)?.bot
              ? t('games.lastLetter.hevaloWon')
              : winner && winner.seat === v.me?.seat
                ? t('games.lastLetter.lastStanding')
                : null;
        return text ? <Text style={[styles.blurb, { color: colors.textSecondary }]}>{text}</Text> : null;
      }}
      scoreOf={(r) => t('games.lastLetter.words', { count: r.score })}
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
  label: { fontSize: typography.sizes.sm, marginTop: spacing.sm },
  note: { fontSize: typography.sizes.sm, textAlign: 'center' },
  error: { fontSize: typography.sizes.sm, textAlign: 'center' },
});
