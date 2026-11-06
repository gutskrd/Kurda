import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  CHARACTER_NAMES,
  learnGame,
  meaningIn,
  type GameDialect,
  type ScenarioCorrection,
  type ScenarioHint,
  type ScenePlace,
  type WhatWouldYouSayItemView,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { TONES } from '../coursemap/path';
import { useCourseDialect } from '../learn/courseDialect';
import { PromptScene } from '../lesson/components/SpeechBubble';
import { useAudio } from '../lesson/useAudio';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useDirection } from '../reports/direction';
import { haptic } from '../feedback/haptics';
import { Icon, type IconName } from '../theme/Icon';
import { PressableScale } from '../theme/MotionParts';
import { Tile, TileButton } from '../theme/Tile';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { SoloGameShell, type SoloRound } from './SoloGameShell';
import { useAvailability } from './learnGames';

/**
 * What Would You Say? on the phone.
 *
 * The stage is a scene card: the place it happens in, drawn large in the
 * game's colour, the situation in the reader's language, and the one who is
 * speaking — Hevalo, Hamo or Xezo — beside their line in a speech bubble,
 * saying it in the voice it was recorded in (lesson/components/SpeechBubble's
 * scene, as a lesson's prompt has it). Under it the player answers in a
 * bubble of their own: one of three or four real lines, or at the advanced
 * level the reply laid from its words as tiles.
 *
 * A wrong first try strikes the option out and says what it means; tiles say
 * the first word is out of place. Once an item is done every option is laid
 * out with what it means and why it fits or does not, the real reply first.
 * Soranî reads right to left; nothing moves but the speaker, who keeps still
 * under Reduce Motion save for the words. The website's
 * games/WhatWouldYouSay.tsx stages the same round.
 */

type Round = SoloRound<WhatWouldYouSayItemView, ScenarioHint, ScenarioCorrection>;

const GAME = learnGame('what-would-you-say');

/** Where a scene is set, drawn from the icon set (shared SCENE_PLACES). */
export const PLACE_ICON: Record<ScenePlace, IconName> = {
  home: 'home',
  street: 'place-street',
  market: 'place-market',
  shop: 'cart',
  school: 'place-school',
  cafe: 'place-cafe',
  bus: 'place-bus',
  doctor: 'place-doctor',
  phone: 'device-phone',
  village: 'mountains',
  party: 'place-party',
  work: 'place-work',
};

export const PLACE_KEY: Record<ScenePlace, TranslationKey> = {
  home: 'games.say.place.home',
  street: 'games.say.place.street',
  market: 'games.say.place.market',
  shop: 'games.say.place.shop',
  school: 'games.say.place.school',
  cafe: 'games.say.place.cafe',
  bus: 'games.say.place.bus',
  doctor: 'games.say.place.doctor',
  phone: 'games.say.place.phone',
  village: 'games.say.place.village',
  party: 'games.say.place.party',
  work: 'games.say.place.work',
};

function SceneCard({ item, dialect }: { item: WhatWouldYouSayItemView; dialect: GameDialect }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const tone = TONES[scheme][GAME.tone];
  const audio = item.line.audio;
  const player = useAudio(audio?.src);
  const said = useRef<string | null>(null);
  // the line is said as the scene comes up, once; a tap on the speaker or the bubble says it again
  useEffect(() => {
    if (audio && player.source === audio.src && said.current !== `${item.index}:${audio.src}`) {
      said.current = `${item.index}:${audio.src}`;
      player.play(1);
    }
  }, [audio, item.index, player]);
  const who = item.speaker ? CHARACTER_NAMES[item.speaker] : null;
  const rtl = dialect === 'ckb';
  return (
    <View style={[styles.scene, { backgroundColor: colors.surface, borderColor: colors.separator }]}>
      <View style={[styles.sceneHead, { flexDirection: dir.row }]}>
        {item.place ? (
          <View style={[styles.place, { backgroundColor: tone.fill }]} aria-hidden>
            <Icon name={PLACE_ICON[item.place]} size={30} color={tone.ink} />
          </View>
        ) : null}
        <View style={styles.sceneText}>
          {item.place ? <Text style={[styles.placeName, dir.text, { color: tone.text }]}>{t(PLACE_KEY[item.place])}</Text> : null}
          <Text style={[styles.situation, dir.text, { color: colors.textPrimary }]}>{meaningIn(item.situation, locale) ?? item.situation.en}</Text>
        </View>
      </View>
      <PromptScene
        voice={item.speaker ? { ...(audio?.voice ?? {}), speaker: item.speaker } : null}
        audio={audio ? player : null}
        reaction={null}
        onReplay={() => player.play(1)}
        bubble={audio ? { onPress: () => player.play(1), label: t('games.say.listen') } : null}
      >
        <View accessibilityLabel={who ? t('games.say.speaker', { name: who }) : t('games.say.someone')}>
          <Text style={[styles.line, { color: colors.textPrimary, writingDirection: rtl ? 'rtl' : 'ltr', textAlign: rtl ? 'right' : 'left' }]}>{item.line.ku}</Text>
        </View>
      </PromptScene>
    </View>
  );
}

function Explained({ correction, dialect }: { correction: ScenarioCorrection; dialect: GameDialect }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const rtl = dialect === 'ckb';
  const heard = meaningIn(correction.line.meanings, locale);
  const ordered = correction.options.map((o, i) => ({ o, i })).sort((a, b) => Number(b.o.fits) - Number(a.o.fits) || a.i - b.i);
  return (
    <View style={styles.explained} testID="say-explained">
      {heard ? <Text style={[dir.text, styles.heard, { color: colors.textSecondary }]}>{t('games.say.heard', { meaning: heard })}</Text> : null}
      {ordered.map(({ o, i }) => (
        <View
          key={i}
          style={[
            styles.explain,
            { backgroundColor: colors.surface, borderColor: colors.separator },
            dir.rtl ? { borderRightWidth: 4, borderRightColor: o.fits ? colors.success : colors.controlTrack } : { borderLeftWidth: 4, borderLeftColor: o.fits ? colors.success : colors.controlTrack },
          ]}
        >
          <Text style={[dir.text, styles.badge, { color: o.fits ? colors.success : colors.textSecondary }]}>{t(o.fits ? 'games.say.fits' : 'games.say.fitsNot')}</Text>
          <Text style={[styles.explainKu, { color: colors.textPrimary, writingDirection: rtl ? 'rtl' : 'ltr', textAlign: rtl ? 'right' : 'left' }]}>{o.ku}</Text>
          <Text style={[dir.text, { color: colors.textSecondary }]}>{meaningIn(o.meanings, locale) ?? o.meanings.en}</Text>
          <Text style={[dir.text, styles.why, { color: colors.textSecondary }]}>{meaningIn(o.why, locale) ?? t(o.fits ? 'games.say.whyFits' : 'games.say.whyNot')}</Text>
        </View>
      ))}
    </View>
  );
}

function ChooseReply({ round, dialect }: { round: Round; dialect: GameDialect }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const tone = TONES[scheme][GAME.tone];
  const { item, result, busy, submit } = round;
  const [picked, setPicked] = useState<number | null>(null);
  const [ruledOut, setRuledOut] = useState<Array<{ at: number; meaning: string | null }>>([]);
  const done = result?.done === true;
  const locked = done || busy;
  const rtl = dialect === 'ckb';

  useEffect(() => {
    setPicked(null);
    setRuledOut([]);
  }, [item.index]);
  useEffect(() => {
    const hint = result?.hint;
    if (hint && hint.ruledOut !== null) {
      const at = hint.ruledOut;
      setRuledOut((was) => (was.some((r) => r.at === at) ? was : [...was, { at, meaning: meaningIn(hint.meanings, locale) }]));
      setPicked(null);
    }
  }, [result, locale]);

  const right = done ? (result?.correction?.options.findIndex((o) => o.fits) ?? -1) : -1;
  const chosen = done ? (result?.correction?.chosen ?? picked) : picked;

  return (
    <View style={styles.replies} accessibilityLabel={t('games.say.replies')} testID="say-replies">
      {(item.options ?? []).map((option, i) => {
        const out = ruledOut.find((r) => r.at === i);
        const on = !done && picked === i;
        const border = done ? (i === right ? colors.success : i === chosen ? colors.danger : colors.separator) : on ? tone.fill : colors.separator;
        const fill = done ? (i === right ? colors.successFill : i === chosen ? colors.dangerFill : colors.surface) : on ? colors.selectedFill : colors.surface;
        return (
          <View key={i} style={[styles.replyWrap, { alignItems: dir.rtl ? 'flex-start' : 'flex-end' }]}>
            <PressableScale
              onPress={() => {
                haptic('tap');
                setPicked(i);
              }}
              disabled={locked || !!out}
              accessibilityRole="button"
              accessibilityLabel={option}
              accessibilityState={{ selected: on, disabled: locked || !!out }}
              style={[
                styles.reply,
                dir.rtl ? styles.replyTailStart : styles.replyTailEnd,
                { borderColor: border, backgroundColor: fill, opacity: out && !done ? 0.55 : done && i !== right && i !== chosen ? 0.6 : 1 },
              ]}
            >
              <Text
                style={[
                  styles.replyText,
                  { color: colors.textPrimary, writingDirection: rtl ? 'rtl' : 'ltr', textAlign: rtl ? 'right' : 'left' },
                  out && !done ? styles.struck : null,
                ]}
              >
                {option}
              </Text>
            </PressableScale>
            {out && !done ? (
              <Text style={[styles.ruledOut, { color: colors.textSecondary, textAlign: dir.rtl ? 'left' : 'right' }]}>
                {out.meaning ? t('games.say.ruledOut', { meaning: out.meaning }) : t('games.say.ruledOutPlain')}
              </Text>
            ) : null}
          </View>
        );
      })}
      {!done ? (
        <TileButton
          label={result && !result.correct ? t('games.solo.tryAgain') : t('games.solo.check')}
          onPress={() => picked !== null && void submit({ choice: picked })}
          busy={busy}
          disabled={locked || picked === null}
        />
      ) : null}
    </View>
  );
}

function BuildReply({ round, dialect }: { round: Round; dialect: GameDialect }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t } = useI18n();
  const tone = TONES[scheme][GAME.tone];
  const { item, result, busy, submit } = round;
  const tiles = item.tiles ?? [];
  const [placed, setPlaced] = useState<number[]>([]);
  const [tried, setTried] = useState<string | null>(null);
  const done = result?.done === true;
  const locked = done || busy;
  const flow = dialect === 'ckb' ? 'row-reverse' : 'row';
  const rtl = dialect === 'ckb' ? styles.rtl : null;

  useEffect(() => {
    setPlaced([]);
    setTried(null);
  }, [item.index]);

  const unchanged = tried === placed.join(',');
  const marked = result && !result.correct ? (done ? (result.correction?.firstWrong ?? null) : (result.hint?.firstWrong ?? null)) : null;
  return (
    <View style={styles.build}>
      <View accessibilityLabel={t('games.say.line')} testID="say-line" style={[styles.buildLine, { flexDirection: flow, borderBottomColor: result?.correct ? tone.fill : colors.controlTrack }]}>
        {placed.map((i, at) => (
          <Tile
            key={i}
            label={tiles[i]}
            state={result?.correct ? 'right' : marked === at && unchanged ? 'wrong' : 'idle'}
            disabled={locked}
            onPress={() => setPlaced((p) => p.filter((x) => x !== i))}
            textStyle={rtl}
          />
        ))}
      </View>
      {!done && marked !== null && unchanged ? (
        <Text style={[styles.hint, { color: colors.textSecondary }]}>{marked >= placed.length ? t('games.sentence.hintMissing') : t('games.sentence.hint')}</Text>
      ) : null}
      {!done ? (
        <View style={[styles.tray, { flexDirection: flow }]} accessibilityLabel={t('games.say.tray')} testID="say-tray">
          {tiles.map((word, i) =>
            placed.includes(i) ? (
              <View key={i} style={[styles.ghost, { backgroundColor: colors.controlTrack }]} aria-hidden>
                <Text style={[styles.ghostText, rtl]}>{word}</Text>
              </View>
            ) : (
              <Tile
                key={i}
                label={word}
                disabled={locked}
                onPress={() => {
                  haptic('tap');
                  setPlaced((p) => [...p, i]);
                }}
                textStyle={rtl}
              />
            ),
          )}
        </View>
      ) : null}
      {!done ? (
        <TileButton
          label={result && !result.correct ? t('games.solo.tryAgain') : t('games.solo.check')}
          onPress={() => {
            setTried(placed.join(','));
            void submit({ order: placed });
          }}
          busy={busy}
          disabled={locked || placed.length === 0 || unchanged}
        />
      ) : null}
    </View>
  );
}

function SceneBoard({ round, dialect }: { round: Round; dialect: GameDialect }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const { item, result } = round;
  const correction = result?.done ? result.correction : null;
  return (
    <View style={styles.board}>
      <SceneCard item={item} dialect={dialect} />
      <Text style={[styles.ask, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
        {t('games.say.prompt')}
      </Text>
      {item.tiles ? <BuildReply round={round} dialect={dialect} /> : <ChooseReply round={round} dialect={dialect} />}
      {correction ? <Explained correction={correction} dialect={dialect} /> : null}
    </View>
  );
}

/** A speech bubble heard and two to answer it, one lit: the intro's picture of the game, without any Kurdish of its own. */
function SceneMini(): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const tone = TONES[scheme][GAME.tone];
  return (
    <View style={styles.mini} aria-hidden>
      <View style={[styles.miniBubble, { width: '70%', alignSelf: 'flex-start', borderColor: tone.fill, backgroundColor: colors.surface }]} />
      <View style={[styles.miniBubble, { width: '56%', alignSelf: 'flex-end', borderColor: colors.controlTrack, backgroundColor: colors.surface }]} />
      <View style={[styles.miniBubble, { width: '64%', alignSelf: 'flex-end', borderColor: tone.fill, backgroundColor: colors.selectedFill }]} />
    </View>
  );
}

export function WhatWouldYouSayScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { t } = useI18n();
  const { scheme } = useTheme();
  const dialect = useCourseDialect();
  const availability = useAvailability(dialect);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void client.get<{ id: string | null }>(`/games/solo/open?game=what-would-you-say&dialect=${dialect}`).then((res) => {
      if (live && res.ok) setOpen(res.data.id);
    });
    return () => {
      live = false;
    };
  }, [client, dialect]);

  const game = availability?.games.find((g) => g.id === 'what-would-you-say');
  const difficulties = availability ? (game?.difficulties ?? []) : null;
  const tone = TONES[scheme][GAME.tone];

  return (
    <SoloGameShell<WhatWouldYouSayItemView, ScenarioHint, ScenarioCorrection>
      game="what-would-you-say"
      dialect={dialect}
      title={t('games.say.name')}
      blurb={t('games.say.intro')}
      intro={<SceneMini />}
      difficulties={difficulties}
      open={open}
      renderRound={(round) => <SceneBoard round={round} dialect={dialect} />}
      explain={(why) => (why === 'reply' ? t('games.say.why') : null)}
      onExit={onExit}
      tone={tone.fill}
    />
  );
}

const styles = StyleSheet.create({
  board: { gap: spacing.lg },
  scene: { borderRadius: radii.lg, borderWidth: 1, padding: spacing.md, gap: spacing.md },
  sceneHead: { alignItems: 'center', gap: spacing.sm },
  place: { width: 52, height: 52, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center' },
  sceneText: { flex: 1, gap: 2 },
  placeName: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  situation: { fontSize: typography.sizes.md, lineHeight: 22 },
  line: { fontSize: typography.sizes.lg, lineHeight: 28, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  ask: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  replies: { gap: spacing.sm },
  replyWrap: { gap: 4 },
  reply: { minHeight: MIN_TOUCH_TARGET + 4, width: '92%', borderWidth: 2, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, justifyContent: 'center' },
  // the tail's corner is on the player's side: the end of the line
  replyTailEnd: { borderBottomRightRadius: radii.xs },
  replyTailStart: { borderBottomLeftRadius: radii.xs },
  replyText: { fontSize: typography.sizes.md, lineHeight: 24 },
  struck: { textDecorationLine: 'line-through' },
  ruledOut: { fontSize: typography.sizes.sm, maxWidth: '92%' },
  build: { gap: spacing.md },
  buildLine: { flexWrap: 'wrap', alignItems: 'flex-end', gap: spacing.sm, minHeight: 64, paddingBottom: spacing.sm, borderBottomWidth: 3 },
  tray: { flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  ghost: { borderRadius: radii.lg, paddingHorizontal: spacing.md, minHeight: 48, justifyContent: 'center' },
  ghostText: { opacity: 0, fontSize: typography.sizes.md },
  hint: { fontSize: typography.sizes.sm },
  rtl: { writingDirection: 'rtl' },
  explained: { gap: spacing.sm },
  heard: { fontSize: typography.sizes.sm },
  explain: { borderRadius: radii.md, borderWidth: 1, padding: spacing.md, gap: 4 },
  badge: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  explainKu: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  why: { fontSize: typography.sizes.sm },
  mini: { gap: spacing.sm, width: '70%', alignSelf: 'center', paddingVertical: spacing.sm },
  miniBubble: { height: 24, borderRadius: radii.md, borderWidth: 2 },
});
