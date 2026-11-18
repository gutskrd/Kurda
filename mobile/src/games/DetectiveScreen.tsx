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
import { ClayButton } from '../theme/glass';
import { TileButton } from '../theme/Tile';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { SoloGameShell, type SoloRound } from './SoloGameShell';
import { useAvailability } from './learnGames';

/**
 * Detective on the phone: the question in hand first, then the case board (the story, the suspects' portraits, and the
 * evidence cards, each in Kurdish only until its meaning is found), then the hints and the notebook of deductions.
 *
 * A card's meaning is found by the deduction it proves, or bought with a hint; hints cost nothing but are few, and the
 * screen says how many are left. A wrong first try marks the cards to read again, and the verdict sits under the
 * question (`feedbackInRound`). Last, the suspects become the buttons for the accusation. Nothing on the board moves.
 * The website's games/Detective.tsx stages the same case.
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

/** The board as it stands: the round's, plus what hints showed and deductions found since. */
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

/** The marks a player may leave on a suspect while reading, in the order they are offered. */
const SUSPECT_NOTES = ['innocent', 'suspicious', 'unsure'] as const;
type SuspectNote = (typeof SUSPECT_NOTES)[number];
const NOTE_KEY: Record<SuspectNote, TranslationKey> = {
  innocent: 'games.detective.notes.innocent',
  suspicious: 'games.detective.notes.suspicious',
  unsure: 'games.detective.notes.unsure',
};

/**
 * The player's own marks on one suspect: a notebook, not an answer, so they are never sent and last only while the case
 * is open. Tapping the chosen mark again clears it.
 */
function SuspectNotes({ name, note, onNote }: { name: string; note: SuspectNote | undefined; onNote: (note: SuspectNote | undefined) => void }): React.JSX.Element {
  const { t } = useI18n();
  const { colors, scheme } = useTheme();
  const dir = useDirection();
  const tone = TONES[scheme][GAME.tone];
  return (
    <View style={[styles.marks, { flexDirection: dir.row }]} accessibilityRole="radiogroup" accessibilityLabel={t('games.detective.notes.label', { name })}>
      {SUSPECT_NOTES.map((n) => {
        const on = note === n;
        return (
          <PressableScale
            key={n}
            onPress={() => {
              haptic('tap');
              onNote(on ? undefined : n);
            }}
            accessibilityRole="radio"
            accessibilityLabel={t(NOTE_KEY[n])}
            accessibilityState={{ checked: on }}
            style={[styles.mark, { borderColor: on ? tone.fill : colors.separator, backgroundColor: on ? colors.selectedFill : colors.surface }]}
          >
            <Text style={[styles.markText, { color: colors.textPrimary }]}>{t(NOTE_KEY[n])}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

function CaseRound({ round, dialect }: { round: Round; dialect: GameDialect }): React.JSX.Element | null {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const tone = TONES[scheme][GAME.tone];
  const { board, spend, spending, error } = useBoard(round);
  const [notes, setNotes] = useState<Record<string, SuspectNote | undefined>>({});
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

      {/* The question first, so the player knows what to look for on the board under it. */}
      <Question round={round} board={board} />

      <View style={[styles.boardField, { backgroundColor: colors.controlTrack }]} accessibilityLabel={t('games.detective.board')}>
        <Text style={[dir.text, styles.section, { color: tone.text }]}>{t('games.detective.suspects')}</Text>
        <Text style={[dir.text, styles.muted, { color: colors.textSecondary }]}>{t('games.detective.notes.hint')}</Text>
        <View style={[styles.suspects, { flexDirection: dir.row }]}>
          {board.suspects.map((s) => (
            <View key={s.id} style={[styles.suspect, { backgroundColor: colors.surface }]}>
              <Portrait suspect={s} />
              <Text style={[styles.suspectName, { color: colors.textPrimary }]}>{s.name}</Text>
              <Text style={[styles.suspectAbout, { color: colors.textSecondary }]}>{meaningIn(s.about, locale) ?? s.about.en}</Text>
              <SuspectNotes name={s.name} note={notes[s.id]} onNote={(note) => setNotes((was) => ({ ...was, [s.id]: note }))} />
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
        {/* A quieter button than Check: green is for a right answer, and a hint is no answer. */}
        <ClayButton label={t('games.detective.hint')} icon="lightbulb" tone="neutral" size="large" onPress={() => void spend()} busy={spending} disabled={!canSpend || !board.moreHints} />
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
  marks: { flexWrap: 'wrap', justifyContent: 'center', gap: 4 },
  mark: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.sm, borderWidth: 1.5, borderRadius: radii.pill },
  markText: { fontSize: typography.sizes.xs },
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
