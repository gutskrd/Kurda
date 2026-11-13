import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import {
  characterSvg,
  learnGame,
  meaningIn,
  type DetectiveBoardView,
  type DetectiveCorrection,
  type DetectiveHint,
  type DetectiveItemView,
  type EvidenceKind,
  type GameDialect,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { useAudio } from '../lesson/useAudio';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { TONES } from '../coursemap/path';
import { useCourseDialect } from '../learn/courseDialect';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useDirection } from '../reports/direction';
import { haptic } from '../feedback/haptics';
import { Icon, type IconName } from '../theme/Icon';
import { PressableScale } from '../theme/MotionParts';
import { TileButton } from '../theme/Tile';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { SoloGameShell, type SoloRound } from './SoloGameShell';
import { useAvailability } from './learnGames';

/**
 * Detective on the phone.
 *
 * The case board, top to bottom: the case file's title and story, the
 * suspects' portraits in a row (the app's own characters where one plays a
 * suspect, a plain silhouette for anyone else), and the evidence pinned up
 * one card under another — messages, statements, notes and talk overheard
 * with its recording — each in its Kurdish only until its meaning is found.
 * The question in hand comes before the board, so the player knows what to
 * look for; the hints and the notebook, which fills with each deduction
 * made, come after it.
 *
 * A card's meaning is found by the deduction it proves, or had for a hint,
 * as is the case's next written hint. A hint costs nothing but itself: a case
 * has only a few, the screen says how many are left before one is spent, and
 * that they run out is the whole price. A wrong first try marks the cards to
 * read again, and the verdict comes right under the question
 * (`feedbackInRound`). Last, the accusation: the suspects become
 * the buttons, and the solution walks back through every deduction. Nothing
 * on the board moves. The website's games/Detective.tsx stages the same case.
 */

type Round = SoloRound<DetectiveItemView, DetectiveHint, DetectiveCorrection, DetectiveBoardView>;
type Board = DetectiveBoardView;
type Suspect = Board['suspects'][number];

const GAME = learnGame('detective');

const KIND_KEY: Record<EvidenceKind, TranslationKey> = {
  message: 'games.detective.kind.message',
  statement: 'games.detective.kind.statement',
  overheard: 'games.detective.kind.overheard',
  note: 'games.detective.kind.note',
};

const KIND_ICON: Record<EvidenceKind, IconName> = { message: 'mail', statement: 'statement', overheard: 'ear', note: 'note' };

/** A suspect's portrait: the character who plays them, drawn from the art kit, or a plain silhouette with their initial. */
export function Portrait({ suspect, size = 60 }: { suspect: Pick<Suspect, 'id' | 'name' | 'portrait'>; size?: number }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const tone = TONES[scheme][GAME.tone];
  const xml = useMemo(
    () => (suspect.portrait ? characterSvg(suspect.portrait, { crop: 'head', width: size, idPrefix: `dt-${suspect.id}`, title: suspect.name }) : null),
    [suspect.portrait, suspect.id, suspect.name, size],
  );
  return (
    <View style={[styles.portrait, { width: size, height: size, backgroundColor: xml ? tone.fill : colors.controlTrack }]} aria-hidden>
      {xml ? (
        <SvgXml xml={xml} width={size} height={size} />
      ) : (
        <>
          <Icon name="person" size={Math.round(size * 0.55)} color={colors.textSecondary} />
          <Text style={[styles.initial, { color: colors.textSecondary }]}>{[...suspect.name][0] ?? ''}</Text>
        </>
      )}
    </View>
  );
}

/** The board as it stands: the round's, with what hints showed and deductions found since. */
function useBoard(round: Round): { board: Board | null; spend: (evidence?: string) => Promise<void>; spending: boolean; error: string | null } {
  const { client } = useAuth();
  const { t } = useI18n();
  const [board, setBoard] = useState<Board | null>(round.board);
  const [spending, setSpending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { result, sessionId } = round;

  useEffect(() => {
    const c = result?.done ? result.correction : null;
    if (!c) return;
    setBoard((b) => {
      if (!b) return b;
      const found = new Map(c.evidence.map((e) => [e.id, e.meanings]));
      const notebook = c.entry && !b.notebook.some((n) => n.step === c.entry!.step) ? [...b.notebook, c.entry] : b.notebook;
      return { ...b, notebook, evidence: b.evidence.map((e) => (found.has(e.id) ? { ...e, meanings: found.get(e.id)! } : e)) };
    });
  }, [result]);

  const spend = useCallback(
    async (evidence?: string) => {
      setSpending(true);
      setError(null);
      const res = await client.post<{ board: Board }>(`/games/solo/sessions/${sessionId}/hints`, evidence ? { evidence } : {});
      setSpending(false);
      if (res.ok) setBoard(res.data.board);
      else setError(describeError(res.error, t));
    },
    [client, sessionId, t],
  );
  return { board, spend, spending, error };
}

/** One card on the board, with its recording when it is talk overheard. */
function EvidenceCard({
  card,
  from,
  look,
  canSpend,
  onTranslate,
  dialect,
}: {
  card: Board['evidence'][number];
  from: string | null;
  look: boolean;
  canSpend: boolean;
  onTranslate: () => void;
  dialect: GameDialect;
}): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const tone = TONES[scheme][GAME.tone];
  const player = useAudio(card.audio?.src);
  const rtl = dialect === 'ckb';
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: look ? tone.fill : colors.separator, borderStyle: card.kind === 'overheard' ? 'dashed' : 'solid' },
        look && styles.cardLook,
      ]}
      testID={`evidence-${card.id}`}
    >
      <View style={[styles.pin]} aria-hidden>
        <Icon name="pin" size={18} color={colors.danger} />
      </View>
      <View style={[styles.cardKind, { flexDirection: dir.row }]}>
        <Icon name={KIND_ICON[card.kind]} size={16} color={colors.textSecondary} />
        <Text style={[styles.cardKindText, { color: colors.textSecondary }]}>
          {t(KIND_KEY[card.kind])}
          {from ? ` · ${t('games.detective.from', { name: from })}` : ''}
        </Text>
      </View>
      <Text style={[styles.cardKu, { color: colors.textPrimary, writingDirection: rtl ? 'rtl' : 'ltr', textAlign: rtl ? 'right' : 'left' }]}>{card.ku}</Text>
      {card.audio && player.supported ? (
        <PressableScale
          onPress={() => player.play(1)}
          accessibilityRole="button"
          accessibilityLabel={t('games.detective.listen')}
          style={[styles.listen, { flexDirection: dir.row, borderColor: player.playing ? colors.gold : colors.separator }]}
        >
          <Icon name="speaker" size={18} color={colors.textPrimary} />
          <Text style={{ color: colors.textPrimary }}>{t('games.detective.listen')}</Text>
        </PressableScale>
      ) : null}
      {card.meanings ? (
        <Text style={[dir.text, styles.cardMeaning, { color: colors.textSecondary, borderTopColor: colors.separator }]}>{meaningIn(card.meanings, locale) ?? card.meanings.en}</Text>
      ) : (
        <View style={[styles.unknown, { flexDirection: dir.row, borderTopColor: colors.separator }]}>
          <Text style={[styles.unknownText, { color: colors.textSecondary }]}>{t('games.detective.unknown')}</Text>
          <PressableScale
            onPress={onTranslate}
            disabled={!canSpend}
            accessibilityRole="button"
            accessibilityLabel={t('games.detective.translate')}
            accessibilityState={{ disabled: !canSpend }}
            style={[styles.translate, { flexDirection: dir.row, borderColor: colors.separator, opacity: canSpend ? 1 : 0.5 }]}
          >
            <Icon name="lightbulb" size={16} color={colors.textPrimary} />
            <Text style={{ color: colors.textPrimary, fontSize: typography.sizes.sm }}>{t('games.detective.translate')}</Text>
          </PressableScale>
        </View>
      )}
    </View>
  );
}

function Choice({ label, state, onPress, disabled, children }: { label: string; state: 'idle' | 'picked' | 'right' | 'wrong' | 'dim'; onPress: () => void; disabled: boolean; children?: React.ReactNode }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const dir = useDirection();
  const tone = TONES[scheme][GAME.tone];
  const border = state === 'right' ? colors.success : state === 'wrong' ? colors.danger : state === 'picked' ? tone.fill : colors.separator;
  const fill = state === 'right' ? colors.successFill : state === 'wrong' ? colors.dangerFill : state === 'picked' ? colors.selectedFill : colors.surface;
  return (
    <PressableScale
      onPress={() => {
        haptic('tap');
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: state === 'picked', disabled }}
      style={[styles.option, { borderColor: border, backgroundColor: fill, opacity: state === 'dim' ? 0.6 : 1 }]}
    >
      {children ?? <Text style={[dir.text, { color: colors.textPrimary, fontSize: typography.sizes.md }]}>{label}</Text>}
    </PressableScale>
  );
}

function Question({ round, board }: { round: Round; board: Board }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const { item, result, busy, submit, feedback } = round;
  const [picked, setPicked] = useState<number | null>(null);
  const done = result?.done === true;
  const locked = done || busy;
  useEffect(() => setPicked(null), [item.index]);
  useEffect(() => {
    if (result && !result.correct && !result.done) setPicked(null);
  }, [result]);
  const right = done ? (result?.correction?.correctIndex ?? -1) : -1;
  const state = (i: number) => (done ? (i === right ? 'right' : i === picked ? 'wrong' : 'dim') : picked === i ? 'picked' : 'idle');
  const text = [dir.text, { color: colors.textPrimary }];

  if (item.kind === 'accuse') {
    const correction = done ? result?.correction : null;
    const culprit = board.suspects.find((s) => s.id === correction?.culprit);
    return (
      <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.separator }]}>
        <View style={[styles.titleRow, { flexDirection: dir.row }]}>
          <Icon name="gavel" size={22} color={colors.textPrimary} />
          <Text style={[...text, styles.question]} accessibilityRole="header">
            {t('games.detective.accuse')}
          </Text>
        </View>
        <Text style={[dir.text, styles.muted, { color: colors.textSecondary }]}>{t('games.detective.accuseHelp')}</Text>
        <View style={[styles.accused, { flexDirection: dir.row }]} accessibilityLabel={t('games.detective.suspects')} testID="detective-accused">
          {item.suspects.map((id, i) => {
            const s = board.suspects.find((x) => x.id === id);
            if (!s) return null;
            return (
              <Choice key={id} label={s.name} state={state(i)} onPress={() => setPicked(i)} disabled={locked}>
                <View style={styles.accuseFace}>
                  <Portrait suspect={s} size={52} />
                  <Text style={{ color: colors.textPrimary, fontWeight: typography.weights.semibold }}>{s.name}</Text>
                </View>
              </Choice>
            );
          })}
        </View>
        {!done ? (
          <TileButton
            label={result && !result.correct ? t('games.solo.tryAgain') : t('games.detective.accuseButton')}
            onPress={() => picked !== null && void submit({ choice: picked })}
            busy={busy}
            disabled={locked || picked === null}
          />
        ) : null}
        {feedback}
        {correction ? (
          <View style={[styles.solution, { borderTopColor: colors.separator }]}>
            <Text style={[...text, styles.solutionTitle]}>{t('games.detective.solution')}</Text>
            {culprit ? (
              <View style={[styles.titleRow, { flexDirection: dir.row }]}>
                <Portrait suspect={culprit} size={44} />
                <Text style={[...text, styles.solutionTitle]}>{t('games.detective.culprit', { name: culprit.name })}</Text>
              </View>
            ) : null}
            {correction.solution ? <Text style={text}>{meaningIn(correction.solution, locale) ?? correction.solution.en}</Text> : null}
            {(correction.walk ?? []).map((w) => (
              <View key={w.step} style={styles.note}>
                <Text style={[dir.text, styles.muted, { color: colors.textSecondary }]}>{meaningIn(w.prompt, locale) ?? w.prompt.en}</Text>
                <Text style={[...text, styles.noteAnswer]}>{meaningIn(w.answer, locale) ?? w.answer.en}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.separator }]}>
      <Text style={[dir.text, styles.count, { color: colors.textSecondary }]}>{t('games.detective.step', { n: item.index + 1, total: board.steps })}</Text>
      <Text style={[...text, styles.question]} accessibilityRole="header">
        {meaningIn(item.prompt, locale) ?? item.prompt.en}
      </Text>
      <View style={styles.options} accessibilityLabel={t('games.detective.options')} testID="detective-options">
        {item.options.map((o, i) => (
          <Choice key={i} label={meaningIn(o, locale) ?? o.en} state={state(i)} onPress={() => setPicked(i)} disabled={locked} />
        ))}
      </View>
      {result?.hint && !done ? <Text style={[dir.text, styles.muted, { color: colors.textSecondary }]}>{t('games.detective.look')}</Text> : null}
      {!done ? (
        <TileButton
          label={result && !result.correct ? t('games.solo.tryAgain') : t('games.solo.check')}
          onPress={() => picked !== null && void submit({ choice: picked })}
          busy={busy}
          disabled={locked || picked === null}
        />
      ) : null}
      {done && result?.correction?.entry ? <Text style={[dir.text, styles.muted, { color: colors.textSecondary }]}>{t('games.detective.noted')}</Text> : null}
      {feedback}
    </View>
  );
}

function CaseRound({ round, dialect }: { round: Round; dialect: GameDialect }): React.JSX.Element | null {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const tone = TONES[scheme][GAME.tone];
  const { board, spend, spending, error } = useBoard(round);
  if (!board) return null;
  const look = round.result && !round.result.done ? (round.result.hint?.look ?? []) : [];
  const name = (id: string | null) => board.suspects.find((s) => s.id === id)?.name ?? null;
  const text = [dir.text, { color: colors.textPrimary }];
  const muted = [dir.text, styles.muted, { color: colors.textSecondary }];
  const canSpend = board.hintsLeft > 0 && !spending;
  return (
    <View style={styles.case}>
      <View style={[styles.file, { backgroundColor: colors.surface, borderColor: colors.separator }, dir.rtl ? { borderRightWidth: 4, borderRightColor: tone.fill } : { borderLeftWidth: 4, borderLeftColor: tone.fill }]}>
        <Text style={[...text, styles.caseTitle]} accessibilityRole="header">
          {meaningIn(board.title, locale) ?? board.title.en}
        </Text>
        <Text style={muted}>{meaningIn(board.intro, locale) ?? board.intro.en}</Text>
      </View>

      {/* the question first, so the player knows what to look for on the board under it */}
      <Question round={round} board={board} />

      <View style={[styles.boardField, { backgroundColor: colors.controlTrack }]} accessibilityLabel={t('games.detective.board')}>
        <Text style={[dir.text, styles.section, { color: tone.text }]}>{t('games.detective.suspects')}</Text>
        <View style={[styles.suspects, { flexDirection: dir.row }]}>
          {board.suspects.map((s) => (
            <View key={s.id} style={[styles.suspect, { backgroundColor: colors.surface }]}>
              <Portrait suspect={s} />
              <Text style={[styles.suspectName, { color: colors.textPrimary }]}>{s.name}</Text>
              <Text style={[styles.suspectAbout, { color: colors.textSecondary }]}>{meaningIn(s.about, locale) ?? s.about.en}</Text>
            </View>
          ))}
        </View>
        <Text style={[dir.text, styles.section, { color: tone.text }]}>{t('games.detective.evidence')}</Text>
        {board.evidence.map((e) => (
          <EvidenceCard key={e.id} card={e} from={name(e.from)} look={look.includes(e.id)} canSpend={canSpend} onTranslate={() => void spend(e.id)} dialect={dialect} />
        ))}
      </View>

      <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.separator }]}>
        <View style={[styles.titleRow, { flexDirection: dir.row }]}>
          <Icon name="lightbulb" size={20} color={colors.textPrimary} />
          <Text style={[...text, styles.panelTitle]}>{t('games.detective.hintsLeft', { n: board.hintsLeft })}</Text>
        </View>
        <Text style={muted}>{t('games.detective.hintsFew')}</Text>
        {board.hints.map((h, i) => (
          <Text key={i} style={[...text, styles.hint, { backgroundColor: colors.controlTrack }]}>
            {meaningIn(h, locale) ?? h.en}
          </Text>
        ))}
        <TileButton label={t('games.detective.hint')} onPress={() => void spend()} tone="success" busy={spending} disabled={!canSpend || !board.moreHints} />
        {error ? <Text style={[dir.text, { color: colors.danger }]}>{error}</Text> : null}
      </View>

      <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.separator }]} accessibilityLabel={t('games.detective.notebook')} testID="detective-notebook">
        <View style={[styles.titleRow, { flexDirection: dir.row }]}>
          <Icon name="notebook" size={20} color={colors.textPrimary} />
          <Text style={[...text, styles.panelTitle]}>{t('games.detective.notebook')}</Text>
        </View>
        {board.notebook.length === 0 ? <Text style={muted}>{t('games.detective.notebookEmpty')}</Text> : null}
        {board.notebook.map((n) => (
          <View key={n.step} style={styles.note}>
            <Text style={muted}>{meaningIn(n.prompt, locale) ?? n.prompt.en}</Text>
            <Text style={[...text, styles.noteAnswer]}>{meaningIn(n.answer, locale) ?? n.answer.en}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function DetectiveScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { t } = useI18n();
  const { scheme } = useTheme();
  const dialect = useCourseDialect();
  const availability = useAvailability(dialect);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void client.get<{ id: string | null }>(`/games/solo/open?game=detective&dialect=${dialect}`).then((res) => {
      if (live && res.ok) setOpen(res.data.id);
    });
    return () => {
      live = false;
    };
  }, [client, dialect]);

  const game = availability?.games.find((g) => g.id === 'detective');
  const difficulties = availability ? (game?.difficulties ?? []) : null;
  const tone = TONES[scheme][GAME.tone];

  return (
    <SoloGameShell<DetectiveItemView, DetectiveHint, DetectiveCorrection, DetectiveBoardView>
      game="detective"
      dialect={dialect}
      title={t('games.detective.name')}
      blurb={t('games.detective.intro')}
      difficulties={difficulties}
      open={open}
      renderRound={(round) => <CaseRound key={round.sessionId} round={round} dialect={dialect} />}
      feedbackInRound
      explain={(why) => (why === 'step' ? t('games.detective.why.step') : why === 'accuse' ? t('games.detective.why.accuse') : null)}
      onExit={onExit}
      tone={tone.fill}
    />
  );
}

const styles = StyleSheet.create({
  case: { gap: spacing.md },
  file: { borderRadius: radii.lg, borderWidth: 1, padding: spacing.md, gap: spacing.xs },
  caseTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold },
  muted: { fontSize: typography.sizes.sm, lineHeight: 20 },
  boardField: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.md },
  section: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  suspects: { flexWrap: 'wrap', gap: spacing.sm },
  suspect: { flexGrow: 1, flexBasis: 96, alignItems: 'center', gap: 4, padding: spacing.sm, borderRadius: radii.md },
  suspectName: { fontWeight: typography.weights.semibold },
  suspectAbout: { fontSize: typography.sizes.xs, textAlign: 'center' },
  portrait: { borderRadius: radii.pill, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  initial: { position: 'absolute', bottom: 4, fontSize: 12, fontWeight: '700' },
  card: { borderWidth: 2, borderRadius: radii.sm, padding: spacing.md, paddingTop: spacing.lg, gap: spacing.sm },
  cardLook: { borderWidth: 3 },
  pin: { position: 'absolute', top: -9, alignSelf: 'center' },
  cardKind: { alignItems: 'center', gap: 4 },
  cardKindText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  cardKu: { fontSize: typography.sizes.md, lineHeight: 24 },
  listen: { alignSelf: 'flex-start', alignItems: 'center', gap: spacing.xs, minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.md, borderWidth: 1.5, borderRadius: radii.pill },
  cardMeaning: { paddingTop: spacing.sm, borderTopWidth: 1, fontSize: typography.sizes.sm },
  unknown: { flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs, paddingTop: spacing.sm, borderTopWidth: 1 },
  unknownText: { fontSize: typography.sizes.sm },
  translate: { alignItems: 'center', gap: 4, minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.md, borderWidth: 1, borderRadius: radii.pill },
  panel: { borderRadius: radii.lg, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  panelTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  titleRow: { alignItems: 'center', gap: spacing.sm },
  count: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  question: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold },
  options: { gap: spacing.sm },
  option: { minHeight: MIN_TOUCH_TARGET + 4, borderWidth: 2, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, justifyContent: 'center' },
  accused: { flexWrap: 'wrap', gap: spacing.sm },
  accuseFace: { alignItems: 'center', gap: 4, minWidth: 80 },
  solution: { gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1 },
  solutionTitle: { fontWeight: typography.weights.semibold },
  hint: { padding: spacing.sm, borderRadius: radii.sm },
  note: { gap: 2 },
  noteAnswer: { fontWeight: typography.weights.semibold },
});
