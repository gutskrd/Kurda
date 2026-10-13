import { useEffect, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import {
  MAX_PLAYERS,
  MIN_PLAYERS_TO_START,
  buildInviteUrl,
  formatJoinCode,
  type StoryGamePlayer,
  type StoryGameView,
  type StoryListItem,
} from '@kurda/shared';
import { useAuth } from '../../auth/AuthContext';
import { describeError } from '../../api/errors';
import type { ApiError, ApiResult } from '../../api/types';
import { MIN_TOUCH_TARGET } from '../../a11y/a11y';
import { InitialsAvatar } from '../../profile/InitialsAvatar';
import { ClayButton } from '../../theme/glass';
import { Icon } from '../../theme/Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { display } from '../../theme/fonts';
import { radii, spacing, typography } from '../../theme/tokens';
import { useI18n } from '../../i18n/I18nContext';
import { InviteSheet } from '../../play/InviteSheet';
import { LobbyInvites } from '../../play/LobbyInvites';
import { leaveGame, listStories, removePlayer, startGame, updateSettings } from '../api';
import { ACCESS_KEY, LENGTH_KEY, TEXT_DURING_KEY, timerLabel } from '../labels';
import { StoryPresetFields, useCanHostOpen } from '../SetupSheet';
import { initialSetup, type SetupState } from '../setup';
import { storyTextProps, storyTextStyle } from '../storyText';
import { Card, Note, SectionLabel, Sheet } from '../ui';
import { ExtraTimeSwitch } from './ExtraTimeSwitch';

/** A player's name as this viewer may see it: their own, a friend's, or "Player 3". */
export function playerName(p: Pick<StoryGamePlayer, 'name' | 'seat' | 'isMe'>, t: (k: 'stories.player' | 'games.you', v?: Record<string, string | number>) => string): string {
  if (p.isMe) return p.name ? `${p.name} (${t('games.you')})` : t('games.you');
  return p.name ?? t('stories.player', { seat: p.seat });
}

/** "A B C 2 3 4", so a screen reader spells the code instead of reading it as a word. */
export function spelledCode(code: string): string {
  return code.split('').join(' ');
}

/**
 * The lobby of a duo or group game (contract §A1 "Lobby"): the join code
 * (and a link — the share sheet sends both), friends to invite and where each
 * invite stands, the players by seat, and the settings. The host can change
 * the settings, take a player out and start once enough people are in;
 * everyone else waits for the host, or leaves.
 */
export function Lobby({
  view,
  apply,
  onLeft,
}: {
  view: StoryGameView;
  apply: (res: ApiResult<StoryGameView>) => ApiError | null;
  onLeft: () => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const s = view.settings;
  const active = view.players.filter((p) => !p.gone && !p.away).length;
  const needed = MIN_PLAYERS_TO_START[view.mode];
  const canStart = view.isHost && active >= needed;
  const link = buildInviteUrl('stories', view.id);

  const run = async (key: string, work: () => Promise<ApiResult<StoryGameView>>): Promise<void> => {
    setBusy(key);
    setError(null);
    const err = apply(await work());
    setBusy(null);
    if (err) setError(err.code === 'NOT_ENOUGH_PLAYERS' ? t('stories.lobby.needMore') : describeError(err, t));
  };

  const share = (): void => {
    const message = view.code
      ? t('stories.lobby.shareText', { title: s.storyTitle, code: formatJoinCode(view.code), link })
      : t('stories.lobby.shareTextNoCode', { title: s.storyTitle, link });
    void Share.share({ message }).catch(() => undefined);
  };

  const remove = (p: StoryGamePlayer): void => {
    const name = playerName(p, t);
    Alert.alert(t('stories.lobby.removeTitle', { name }), t('stories.lobby.removeBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.remove'), style: 'destructive', onPress: () => void run(`remove-${p.seat}`, () => removePlayer(client, view.id, p.seat)) },
    ]);
  };

  const leave = (): void => {
    Alert.alert(
      view.isHost ? t('stories.lobby.cancelTitle') : t('stories.lobby.leaveTitle'),
      view.isHost ? t('stories.lobby.cancelBody') : t('stories.lobby.leaveBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: view.isHost ? t('stories.lobby.cancelGame') : t('stories.lobby.leave'),
          style: 'destructive',
          onPress: () =>
            void leaveGame(client, view.id).then((res) => {
              if (res.ok) onLeft();
              else setError(describeError(res.error, t));
            }),
        },
      ],
    );
  };

  return (
    <>
      <Card style={styles.card}>
        <Text {...storyTextProps(s.dialect)} style={[styles.title, { color: colors.textPrimary }, storyTextStyle(s.dialect)]} accessibilityRole="header">
          {s.storyTitle}
        </Text>
        <Text style={[styles.settings, { color: colors.textSecondary }]}>
          {[
            t(LENGTH_KEY[s.length]),
            t('stories.questionsCount', { count: s.questionCount }),
            timerLabel(s.timerSeconds, t),
            t(TEXT_DURING_KEY[s.textDuring]),
            t(ACCESS_KEY[s.access]),
          ].join(' · ')}
        </Text>
        {s.textDuring === 'hidden' ? <Note icon="eye-off">{t('stories.fromMemoryWarning')}</Note> : null}
        {view.isHost ? (
          <ClayButton label={t('stories.lobby.changeSettings')} icon="gear" variant="outline" onPress={() => setEditing(true)} />
        ) : null}
      </Card>

      {view.code ? (
        <Card style={styles.card}>
          <SectionLabel>{t('stories.lobby.code')}</SectionLabel>
          <Text
            selectable
            style={[styles.code, { color: colors.primary }]}
            accessibilityLabel={t('stories.lobby.codeSpelled', { code: spelledCode(view.code) })}
          >
            {formatJoinCode(view.code)}
          </Text>
          <Text style={[styles.codeHint, { color: colors.textSecondary }]}>
            {s.access === 'open' ? t('stories.lobby.codeOpen') : t('stories.lobby.codeFriends')}
          </Text>
          {active < MAX_PLAYERS[view.mode] ? (
            <ClayButton label={t('stories.lobby.invite')} icon="user-plus" tone="primary" onPress={() => setInviting(true)} />
          ) : null}
          <ClayButton label={t('share.title')} icon="share" onPress={share} />
          <Text selectable style={[styles.link, { color: colors.textSecondary }]} accessibilityLabel={t('games.inviteLink')}>
            {link}
          </Text>
        </Card>
      ) : null}

      <Card style={styles.card}>
        <SectionLabel>{t('stories.lobby.players', { count: active, max: MAX_PLAYERS[view.mode] })}</SectionLabel>
        {view.players
          .filter((p) => !p.gone)
          .map((p) => {
            const name = playerName(p, t);
            return (
              <View key={p.seat} style={styles.player}>
                <InitialsAvatar name={p.name ?? String(p.seat)} id={`seat-${p.seat}`} size={36} photoUrl={p.avatarUrl} />
                <View style={styles.playerMain}>
                  <Text style={[styles.playerName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {name}
                  </Text>
                  <View style={styles.playerFacts}>
                    {p.isHost ? (
                      <View style={styles.fact}>
                        <Icon name="crown" size={12} color={colors.gold} />
                        <Text style={[styles.factText, { color: colors.textSecondary }]}>{t('stories.lobby.host')}</Text>
                      </View>
                    ) : null}
                    {p.away ? <Text style={[styles.factText, { color: colors.textSecondary }]}>{t('stories.lobby.away')}</Text> : null}
                  </View>
                </View>
                {view.isHost && !p.isMe && !p.isHost ? (
                  <Pressable
                    onPress={() => remove(p)}
                    disabled={busy === `remove-${p.seat}`}
                    accessibilityRole="button"
                    accessibilityLabel={t('stories.lobby.removeWho', { name })}
                    style={styles.removeButton}
                  >
                    <Icon name="close" size={18} color={colors.textSecondary} />
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        {view.isHost ? <LobbyInvites game="stories" lobbyId={view.id} /> : null}
      </Card>

      <ExtraTimeSwitch view={view} apply={apply} />

      {error ? <Note tone="danger" icon="alert">{error}</Note> : null}

      {view.isHost ? (
        <>
          <ClayButton
            label={t('stories.lobby.start')}
            tone="primary"
            size="large"
            busy={busy === 'start'}
            disabled={!canStart}
            onPress={() => void run('start', () => startGame(client, view.id))}
          />
          {!canStart ? (
            <Text style={[styles.waiting, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
              {t('stories.lobby.needMore')}
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={[styles.waiting, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
          {t('stories.lobby.waitingHost')}
        </Text>
      )}
      <ClayButton
        label={view.isHost ? t('stories.lobby.cancelGame') : t('stories.lobby.leave')}
        tone="danger"
        variant="outline"
        onPress={leave}
      />

      {inviting ? (
        <InviteSheet target={{ kind: 'lobby', game: 'stories', lobbyId: view.id, mode: view.mode === 'duo' ? 'duo' : 'group' }} onClose={() => setInviting(false)} />
      ) : null}
      {editing ? <SettingsSheet view={view} apply={apply} onClose={() => setEditing(false)} /> : null}
    </>
  );
}

/** The host changes the settings in the lobby — the same presets as setting up. */
function SettingsSheet({
  view,
  apply,
  onClose,
}: {
  view: StoryGameView;
  apply: (res: ApiResult<StoryGameView>) => ApiError | null;
  onClose: () => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { t } = useI18n();
  const canHostOpen = useCanHostOpen();
  const s = view.settings;
  const [stories, setStories] = useState<StoryListItem[]>([]);
  const [state, setState] = useState<SetupState>(() => ({
    ...initialSetup({ mode: view.mode, dialect: s.dialect, story: { id: s.storyId, length: s.length } }),
    questionCount: s.questionCount,
    timerSeconds: s.timerSeconds,
    timerChosen: true,
    textDuring: s.textDuring,
    access: s.access,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void listStories(client, { dialect: s.dialect }).then((res) => {
      if (live && res.ok) setStories(res.data.stories);
    });
    return () => {
      live = false;
    };
  }, [client, s.dialect]);

  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const err = apply(
      await updateSettings(client, view.id, {
        ...(state.storyId && state.storyId !== s.storyId ? { storyId: state.storyId } : {}),
        questionCount: state.questionCount,
        timerSeconds: state.timerSeconds,
        textDuring: state.textDuring,
        access: state.access,
      }),
    );
    setBusy(false);
    if (err) setError(err.code === 'ACCESS_LOCKED' ? t('stories.lobby.accessLocked') : describeError(err, t));
    else onClose();
  };

  return (
    <Sheet
      title={t('stories.lobby.changeSettings')}
      onClose={onClose}
      footer={
        <>
          {error ? <Note tone="danger" icon="alert">{error}</Note> : null}
          <ClayButton label={t('stories.lobby.save')} tone="primary" size="large" busy={busy} onPress={() => void save()} />
        </>
      }
    >
      <StoryPresetFields
        state={state}
        onChange={(next) => setState(next.storyId === null ? { ...next, storyId: s.storyId, length: s.length } : next)}
        stories={stories.filter((x) => x.length === s.length || x.id === state.storyId)}
        canHostOpen={canHostOpen}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  title: { ...display(typography.sizes.lg) },
  settings: { fontSize: typography.sizes.sm, lineHeight: 20 },
  code: { fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold, letterSpacing: 4, textAlign: 'center', writingDirection: 'ltr' },
  codeHint: { fontSize: typography.sizes.sm, textAlign: 'center' },
  link: { fontSize: typography.sizes.xs, textAlign: 'center', writingDirection: 'ltr' },
  player: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: MIN_TOUCH_TARGET },
  playerMain: { flex: 1, gap: 2 },
  playerName: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  playerFacts: { flexDirection: 'row', gap: spacing.sm },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  factText: { fontSize: typography.sizes.xs },
  removeButton: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill },
  waiting: { fontSize: typography.sizes.md, textAlign: 'center' },
});
