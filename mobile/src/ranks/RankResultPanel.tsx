import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { progressToNext, type RankResult, type RankedGame } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useCelebrationHold } from '../badges/BadgeCelebrationHost';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { display } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { getRankResult } from './api';
import { PlacementEmblem, RankEmblem } from './art';
import { Celebration } from './Celebration';
import {
  REASON_KEY,
  TIER_NAME_KEY,
  celebrationOf,
  countUpValue,
  friendlyReasonKey,
  rankLabel,
  rankName,
  resultEmblem,
  resultTone,
  signed,
  tierMeaning,
  type Celebration as CelebrationKind,
} from './format';
import { Meter } from './Meter';
import { FLECKS, countUpMs } from './motion';
import { ShieldPips } from './RankCard';
import { PLACING_TINT, confettiColours, rankGlow, rankTint } from './tint';

/** A result is recorded as the game ends; asked again a few times while it is on its way. */
const PENDING_RETRIES = 5;
const PENDING_GAP_MS = 1500;

type Counted = Extract<RankResult, { counted: true }>;

/**
 * What a finished game did to your rank (contract 4 §R2, §U): the points
 * counting from where they were to where they are, the bar filling, and the
 * one plain reason — "+24 · you beat a higher-ranked player". A new division
 * or tier, or a first placement, then has its moment on its own stage, and
 * any badge the game earned waits until that is over.
 *
 * A loss is never staged as a loss: the change is written in the page's
 * quiet grey, the bar does not drain in front of you, and the line under it
 * says where you still are. A game that played as friendly says so, once,
 * with its reason when it was not the host's choice.
 */
export function RankResultPanel({ game, gameRef }: { game: RankedGame; gameRef: string }): React.JSX.Element | null {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [result, setResult] = useState<RankResult | null>(null);
  const [counting, setCounting] = useState(true);

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ask = async (attempt: number): Promise<void> => {
      const res = await getRankResult(client, game, gameRef);
      if (!live) return;
      if (!res.ok) {
        setCounting(false);
        return;
      }
      setResult(res.data);
      if (!res.data.counted && res.data.pending && attempt < PENDING_RETRIES) {
        timer = setTimeout(() => void ask(attempt + 1), PENDING_GAP_MS);
      } else {
        setCounting(false);
      }
    };
    void ask(0);
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [client, game, gameRef]);

  // the badges this game earned wait while its result is being worked out and shown
  const [shown, setShown] = useState(false);
  useCelebrationHold(counting || (result?.counted === true && !shown));

  if (!result) return null;
  if (!result.counted) {
    if (result.pending) {
      return counting ? <Line icon="mountains" text={t('ranks.result.pending')} /> : null;
    }
    if (result.voided) return <Line icon="mountains" text={t('ranks.result.voided')} />;
    const reason = result.friendlyReason;
    return (
      <Line
        icon="handshake"
        text={reason && reason !== 'chosen' ? t('ranks.result.friendlyBecause', { reason: t(friendlyReasonKey(reason)) }) : t('ranks.result.friendly')}
        colour={colors.textSecondary}
      />
    );
  }
  return <CountedResult result={result} onShown={() => setShown(true)} />;
}

function Line({ icon, text, colour }: { icon: 'mountains' | 'handshake'; text: string; colour?: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={[styles.line, { backgroundColor: colors.controlTrack }]} accessibilityLiveRegion="polite">
      <Icon name={icon} size={16} color={colour ?? colors.textSecondary} />
      <Text style={[styles.lineText, { color: colour ?? colors.textSecondary }]}>{text}</Text>
    </View>
  );
}

function CountedResult({ result, onShown }: { result: Counted; onShown: () => void }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const reduce = useReducedMotion();
  const tone = resultTone(result.delta);
  const emblem = resultEmblem(result);
  const moment = celebrationOf(result);
  const [points, setPoints] = useState(reduce ? result.pointsAfter : result.pointsBefore);
  const [celebrating, setCelebrating] = useState<CelebrationKind>(null);
  const counter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const ms = countUpMs(result.delta, reduce);
    const finish = () => {
      setPoints(result.pointsAfter);
      if (moment) setCelebrating(moment);
      else onShown();
    };
    if (ms === 0) {
      finish();
      return;
    }
    const id = counter.addListener(({ value }) => setPoints(countUpValue(result.pointsBefore, result.pointsAfter, value)));
    const run = Animated.timing(counter, { toValue: 1, duration: ms, delay: 350, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    run.start(({ finished }) => finished && finish());
    return () => {
      run.stop();
      counter.removeListener(id);
    };
    // plays once, for this result
  }, [result]);

  const after = result.progress ?? progressToNext(result.pointsAfter);
  const before = progressToNext(result.pointsBefore);
  // a win in the same division slides on from where it was; a new division fills from its start; a loss just shows where you are
  const from = tone === 'up' ? (result.divisionUp || result.tierUp ? 0 : before.fraction) : undefined;
  const placing = emblem.kind === 'placing';
  const tint = placing ? PLACING_TINT[scheme] : rankTint(emblem.tier, scheme);
  const name = placing ? t('ranks.placing', { played: result.placement?.played ?? 0, of: result.placement?.of ?? 5 }) : rankName(t, emblem.tier, emblem.division);
  const reason = t(REASON_KEY[result.reason]);
  const deltaColour = tone === 'up' ? colors.textPrimary : colors.textSecondary;
  const kind =
    tone === 'down' && !placing
      ? t('ranks.result.stillAt', { rank: rankName(t, emblem.tier, emblem.division) })
      : tone === 'down'
        ? t('ranks.result.placingLoss')
        : null;

  return (
    <View style={[styles.panel, { backgroundColor: colors.controlTrack }]}>
      <View style={styles.top}>
        {placing ? (
          <PlacementEmblem done={emblem.done} size={80} label={name} />
        ) : (
          <RankEmblem tier={emblem.tier} division={emblem.division} size={80} label={rankLabel(t, emblem.tier, emblem.division)} />
        )}
        <View style={styles.main} accessible accessibilityLabel={`${signed(result.delta)} · ${reason}. ${name}. ${t('ranks.pointsCount', { count: result.pointsAfter })}`}>
          <View style={styles.deltaRow}>
            <Text style={[styles.delta, { color: deltaColour }]}>{signed(result.delta)}</Text>
            <Text style={[styles.reason, { color: colors.textSecondary }]} numberOfLines={2}>
              {reason}
            </Text>
          </View>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {name}
            <Text style={[styles.points, { color: colors.textSecondary }]}>{`  ${t('ranks.pointsCount', { count: formatNumber(points, locale) })}`}</Text>
          </Text>
        </View>
      </View>
      <Meter fraction={placing ? (result.placement?.played ?? 0) / 5 : after.fraction} from={from} tint={tint} height={8} delayMs={350} durationMs={countUpMs(result.delta, reduce) || 600} />
      {kind ? <Text style={[styles.kind, { color: colors.textSecondary }]}>{kind}</Text> : null}
      {result.reason === 'shield' || (result.shieldGames > 0 && !result.tierUp) ? (
        <View style={styles.shieldRow}>
          <ShieldPips count={result.shieldGames} />
        </View>
      ) : null}
      {result.weight < 1 ? <Text style={[styles.kind, { color: colors.textSecondary }]}>{t('ranks.result.damped')}</Text> : null}
      {celebrating && !placing ? (
        <RankMoment
          kind={celebrating}
          tier={emblem.tier}
          division={emblem.division}
          shieldGames={result.shieldGames}
          line={`${signed(result.delta)} · ${reason}`}
          onClose={() => {
            setCelebrating(null);
            onShown();
          }}
        />
      ) : null}
    </View>
  );
}

/** A new division, a new tier, or a first rank after placement — on its own stage. */
function RankMoment({
  kind,
  tier,
  division,
  shieldGames,
  line,
  onClose,
}: {
  kind: Exclude<CelebrationKind, null>;
  /** the game's own line: "+26 · you beat a higher-ranked player" */
  line: string;
  tier: Extract<ReturnType<typeof resultEmblem>, { kind: 'ranked' }>['tier'];
  division: Extract<ReturnType<typeof resultEmblem>, { kind: 'ranked' }>['division'];
  shieldGames: number;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const name = rankName(t, tier, division);
  const kicker = kind === 'tier' ? t('ranks.celebrate.tier') : kind === 'placed' ? t('ranks.celebrate.placed') : t('ranks.celebrate.division');
  const note =
    kind === 'tier' && shieldGames > 0
      ? t('ranks.celebrate.shield', { count: shieldGames, tier: t(TIER_NAME_KEY[tier]) })
      : kind === 'placed'
        ? t('ranks.celebrate.placedNote')
        : null;
  return (
    <Celebration
      art={<RankEmblem tier={tier} division={division} size={176} label={rankLabel(t, tier, division)} />}
      glow={rankGlow(tier)}
      flecks={kind === 'tier' ? FLECKS.tier : kind === 'placed' ? FLECKS.placed : FLECKS.division}
      fleckColours={confettiColours(tier)}
      seed={tier.length * 31 + (division ?? 0)}
      kicker={kicker}
      title={name}
      subtitle={tierMeaning(t, tier)}
      detail={line}
      note={note}
      announce={`${kicker}: ${rankLabel(t, tier, division)}`}
      onClose={onClose}
      actions={<ClayButton label={t('ranks.celebrate.continue')} tone="primary" size="large" onPress={onClose} />}
    />
  );
}

const styles = StyleSheet.create({
  panel: { alignSelf: 'stretch', borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm, marginVertical: spacing.sm },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  main: { flex: 1, gap: 2 },
  deltaRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flexWrap: 'wrap' },
  delta: { ...display(typography.sizes.xxl), fontVariant: ['tabular-nums'] },
  reason: { flexShrink: 1, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  name: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  points: { fontSize: typography.sizes.sm, fontVariant: ['tabular-nums'] },
  kind: { fontSize: typography.sizes.sm, lineHeight: 19 },
  shieldRow: { flexDirection: 'row' },
  line: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: spacing.sm, borderRadius: radii.md, padding: spacing.md, marginVertical: spacing.sm },
  lineText: { flex: 1, fontSize: typography.sizes.sm, lineHeight: 19 },
});
