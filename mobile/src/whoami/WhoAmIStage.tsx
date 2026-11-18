import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, I18nManager, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Pressable } from '../theme/Pressable';
import Svg, { Path, SvgXml } from 'react-native-svg';
import {
  FOREHEAD,
  WHO_AM_I_GUESSES,
  WHO_AM_I_HELP_CAP,
  WHO_AM_I_HELP_POINTS,
  WHO_AM_I_QUESTION_COST,
  WHO_AM_I_START_POINTS,
  WHO_AM_I_WRONG_GUESS_COST,
  askedVerdict,
  deerSilhouetteSvg,
  dialectDirection,
  learnGame,
  meaningIn,
  type GameDialect,
  type Meanings,
  type WhoAmIAnswer,
  type WhoAmIAnswerCount,
  type WhoAmIAsked,
  type WhoAmIQuestion,
  type WhoAmISays,
  type WhoAmITableMark,
  type WhoAmITile,
} from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { describeError } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { TONES } from '../coursemap/path';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { directionFor, useDirection } from '../reports/direction';
import { ClayButton } from '../theme/glass';
import { Icon, type IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { TABLE } from '../impostor/table';
import { heldDim } from '../theme/MotionParts';
import { turnCard } from '../theme/animate';

/**
 * Who Am I?'s stage on the phone, shared by the online room (WhoAmIScreen.tsx) and the game on one phone
 * (WhoAmICouch.tsx), as the website's whoami/WhoAmIStage.tsx is: the forehead cards, suggested questions, the question
 * deck with answers stamped in the dialect's own words, guess tiles, answer and judgement keys (each with a mark as
 * well as a colour), the verdict card, and what folds away. A question's meaning shows under it for beginners and at a
 * tap otherwise. Nothing here decides what may be seen: a card is drawn when handed in and the hidden mark when not.
 */

const WHO_AM_I_TONE = learnGame('who-am-i').tone;

const CATEGORY_KEY: Record<string, TranslationKey> = {
  animal: 'games.whoAmI.cat.animal',
  object: 'games.whoAmI.cat.object',
  profession: 'games.whoAmI.cat.profession',
  food: 'games.whoAmI.cat.food',
  place: 'games.whoAmI.cat.place',
  nature: 'games.whoAmI.cat.nature',
};

/** A card is paper in both themes, as the table's cards are: the same card whoever looks at it. */
const PAPER = '#fbf6e9';
const PAPER_EDGE = '#d8ccb0';
const PAPER_INK = '#2a2a33';
const PAPER_SOFT = '#5b5b66';
/**
 * Yes, could be and no as three colours that read at a glance: green, the app's gold and a warm red, each with a darker
 * edge. Green and red carry white (5.0:1 and 5.1:1); gold is too light for white, so it carries the deep brown the app
 * writes on gold (8.6:1).
 */
const ON_ANSWER = '#ffffff';
const ON_ANSWER_SOFT = 'rgba(255, 255, 255, 0.88)';
const ON_ANSWER_VEIL = 'rgba(255, 255, 255, 0.18)';
const ON_GOLD = '#3a2800';
const ON_GOLD_SOFT = 'rgba(58, 40, 0, 0.82)';
const ON_GOLD_VEIL = 'rgba(58, 40, 0, 0.1)';

/** What the card can say: the fill of its key or card, the edge the key stands on, and the ink on it. */
const FILL: Record<WhoAmIAnswer, { face: string; edge: string; ink: string; soft: string; veil: string }> = {
  yes: { face: '#1a7f45', edge: '#11592f', ink: ON_ANSWER, soft: ON_ANSWER_SOFT, veil: ON_ANSWER_VEIL },
  sometimes: { face: '#ffbf1f', edge: '#b98500', ink: ON_GOLD, soft: ON_GOLD_SOFT, veil: ON_GOLD_VEIL },
  no: { face: '#c9382a', edge: '#8e2418', ink: ON_ANSWER, soft: ON_ANSWER_SOFT, veil: ON_ANSWER_VEIL },
};

/**
 * The same three as words on the page (the stamps): a step deeper on the light page and lighter on the dark, so each
 * reads at least 6:1 on its ground while keeping its hue.
 */
const WORD_ON_PAGE: Record<'light' | 'dark', Record<WhoAmIAnswer, string>> = {
  light: { yes: '#17723a', sometimes: '#7a5600', no: '#b42318' },
  dark: { yes: '#86e2a4', sometimes: '#ffcf5c', no: '#ff9c90' },
};

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** Each answer in the dialect's own words, from the catalogue, the same in every language of the app. */
const WORD_KEY: Record<GameDialect, Record<WhoAmISays, TranslationKey>> = {
  kmr: { yes: 'games.whoAmI.yesKmr', sometimes: 'games.whoAmI.sometimesKmr', no: 'games.whoAmI.noKmr', unsure: 'games.whoAmI.unsureKmr' },
  ckb: { yes: 'games.whoAmI.yesCkb', sometimes: 'games.whoAmI.sometimesCkb', no: 'games.whoAmI.noCkb', unsure: 'games.whoAmI.unsureCkb' },
};

/**
 * The two in-between answers in the reader's own words, under the Kurdish. Yes and no are among the first words the
 * course teaches, so they stand alone.
 */
const GLOSS_KEY: Partial<Record<WhoAmISays, TranslationKey>> = { sometimes: 'games.whoAmI.sometimes', unsure: 'games.whoAmI.unsure' };

/**
 * An answer in the dialect's own words: the card's (yes, could be, no) or a friend's, which may also be not sure.
 * Always in the Kurdish being played, whatever the app language.
 */
export function answerWord(dialect: GameDialect, answer: WhoAmIAnswer | 'unsure', t: Translate): string {
  return t(WORD_KEY[dialect][answer]);
}

/** An answer in between in the reader's words; none for yes and no, and none when the reader's language is that Kurdish. */
function gloss(dialect: GameDialect, answer: WhoAmISays, t: Translate): string | null {
  const key = GLOSS_KEY[answer];
  if (!key) return null;
  const own = t(key);
  return own.toLocaleLowerCase() === answerWord(dialect, answer, t).toLocaleLowerCase() ? null : own;
}

/** A row that starts where the dialect reads from, whatever the app is written in: in Soranî the yes stands on the right. */
function dialectRow(dialect: GameDialect): ViewStyle['flexDirection'] {
  return directionFor(dialectDirection(dialect).dir === 'rtl', I18nManager.isRTL).row;
}

/** What kind of thing a hidden card is, in the reader's words; null when the card may not say. */
export function kindOf(category: string | null, t: Translate): string | null {
  return category !== null && CATEGORY_KEY[category] ? t(CATEGORY_KEY[category]!) : null;
}

function kurdish(dialect: GameDialect): { writingDirection: 'rtl' | 'ltr' } {
  return { writingDirection: dialectDirection(dialect).dir };
}

/** A card as read: the word and its meaning. */
export interface CardFace {
  word: string;
  meanings: Meanings;
}

const STAGE = 220;
const CARD_W = STAGE * FOREHEAD.width;
const CARD_H = 64;
/** The card friends read from across a sofa: wide enough for a word set large, whatever the deer's size. */
const CARD_LARGE_W = 168;
const CARD_LARGE_H = 92;

/**
 * How a card is cut for where it is read: on the reader's own screen, small on a deer beside a banner (the mark or the
 * word alone), or large for friends reading from where they sit.
 */
export type CardCut = 'regular' | 'small' | 'large';

// ───────────────────────────────────────────────────────────── the one who wears the card

export function ForeheadCard({
  dialect,
  category,
  identity,
  size = STAGE,
  cut = 'regular',
  night = false,
  hiddenLabel,
}: {
  dialect: GameDialect;
  /** What kind of thing it is, when the card may say; null when it may not. */
  category: string | null;
  /** The card's face, once it may be read here; null while it stays hidden. */
  identity: CardFace | null;
  size?: number;
  cut?: CardCut;
  /** On the night cloth, where the deer is the evening's colour whatever the theme. */
  night?: boolean;
  /** What a screen reader calls the hidden card, where it is not the reader's own. */
  hiddenLabel?: string;
}): React.JSX.Element {
  const { t, locale } = useI18n();
  const { scheme } = useTheme();
  const reduce = useReducedMotion();
  const tone = TONES[night ? 'dark' : scheme][WHO_AM_I_TONE];
  const svg = useMemo(() => deerSilhouetteSvg(tone.lip, size), [tone.lip, size]);
  const turn = useRef(new Animated.Value(identity && !reduce ? 0 : 1)).current;
  const shown = !!identity;
  useEffect(() => {
    if (!shown || reduce) {
      turn.setValue(1);
      return;
    }
    turn.setValue(0);
    const anim = turnCard(turn);
    anim.start();
    return () => anim.stop();
  }, [shown, reduce, turn]);
  const rotateY = turn.interpolate({ inputRange: [0, 1], outputRange: ['90deg', '0deg'] });
  const kind = kindOf(category, t);
  const small = cut === 'small';
  const large = cut === 'large';
  // A card is never narrower than a word needs, however small the deer is drawn; only the small cut follows the deer.
  const width = small ? size * 0.62 : large ? Math.max(CARD_LARGE_W, size * FOREHEAD.width) : Math.max(CARD_W, size * FOREHEAD.width);
  const height = small ? size * 0.36 : large ? CARD_LARGE_H : CARD_H;
  return (
    <View style={[styles.stage, { width: size, height: size }]}>
      <View accessible={false} importantForAccessibility="no-hide-descendants">
        <SvgXml xml={svg} width={size} height={size} />
      </View>
      <Animated.View
        style={[
          small ? styles.cardSmall : styles.card,
          { width, minHeight: height, left: size * FOREHEAD.x - width / 2, top: size * FOREHEAD.y - height / 2, borderColor: tone.fill },
          { transform: [{ perspective: 600 }, { rotateY }, { rotate: '-2deg' }] },
        ]}
        accessibilityLiveRegion="polite"
      >
        {identity ? (
          <>
            <Text style={[small ? styles.cardWordSmall : large ? styles.cardWordLarge : styles.cardWord, kurdish(dialect)]} numberOfLines={1} adjustsFontSizeToFit>
              {identity.word}
            </Text>
            {small ? null : (
              <Text style={large ? styles.cardKindLarge : styles.cardKind} numberOfLines={1}>
                {meaningIn(identity.meanings, locale) ?? identity.meanings.en}
              </Text>
            )}
          </>
        ) : (
          <>
            <Text style={small ? styles.cardMarkSmall : styles.cardMark} accessibilityLabel={hiddenLabel ?? t('games.whoAmI.card')}>
              ?
            </Text>
            {kind && !small ? <Text style={styles.cardKind}>{kind}</Text> : null}
          </>
        )}
      </Animated.View>
    </View>
  );
}

/**
 * An answer as a stamp in the dialect's words: the card's yes, could be or no in its colour, or a friend's not sure in
 * the page's quiet ink.
 */
function Stamp({ dialect, answer, large = false }: { dialect: GameDialect; answer: WhoAmISays; large?: boolean }): React.JSX.Element {
  const { t } = useI18n();
  const { colors, scheme } = useTheme();
  const reduce = useReducedMotion();
  const land = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) return;
    const anim = Animated.spring(land, { toValue: 1, useNativeDriver: true, friction: 6 });
    anim.start();
    return () => anim.stop();
  }, [land, reduce]);
  const scale = land.interpolate({ inputRange: [0, 1], outputRange: [1.6, 1] });
  const colour = answer === 'unsure' ? colors.textSecondary : WORD_ON_PAGE[scheme][answer];
  return (
    <Animated.Text
      style={[
        large ? styles.stampLarge : styles.stamp,
        kurdish(dialect),
        { color: colour, borderColor: colour, opacity: land, transform: [{ rotate: '-8deg' }, { scale }] },
      ]}
    >
      {answerWord(dialect, answer, t)}
    </Animated.Text>
  );
}

// ───────────────────────────────────────────────────────────── the table

/** One seat at the table, as the screen in front may draw it. */
export interface TableSeat {
  seat: number;
  name: string;
  /** The reader's own seat. */
  mine: boolean;
  /** The card on this forehead, where the screen may show it; null draws the hidden mark. */
  card: CardFace | null;
  /** What kind of thing a hidden card is, when it may say. */
  kind: string | null;
  points: number;
  asked: number;
  solved: boolean;
  out: boolean;
  left: boolean;
  onTurn: boolean;
  /** While a question is being answered: whether this seat has answered or is still to; null when it has no say. */
  answer: 'answered' | 'waiting' | null;
}

const MINI = 80;
const MINI_CARD_H = 40;

/**
 * Everyone at the table as a row of small foreheads, each with name, points and questions asked, a mark for whoever has
 * their card, is out or has left, and gold round the seat on turn. Two to a row for two or four, three otherwise, so
 * six fit a phone.
 */
export function Foreheads({ dialect, seats, label }: { dialect: GameDialect; seats: readonly TableSeat[]; label: string }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const tone = TONES[scheme][WHO_AM_I_TONE];
  const svg = useMemo(() => deerSilhouetteSvg(tone.lip, MINI), [tone.lip]);
  const wide = seats.length <= 2 || seats.length === 4;
  return (
    <View accessibilityLabel={label} style={[styles.table, { flexDirection: dir.row }]}>
      {seats.map((s) => {
        const meaning = s.card ? (meaningIn(s.card.meanings, locale) ?? s.card.meanings.en) : null;
        const hidden = s.mine ? t('games.whoAmI.card') : t('games.whoAmI.hidden');
        const done = s.solved ? t('games.whoAmI.solved') : s.out ? t('games.whoAmI.out') : null;
        const tag = s.left
          ? t('games.whoAmI.seat.left')
          : s.onTurn
            ? t('games.whoAmI.seat.turn')
            : s.answer === 'answered'
              ? t('games.whoAmI.seat.answered')
              : s.answer === 'waiting'
                ? t('games.whoAmI.seat.answering')
                : done;
        // Whose turn it is in the violet of where you are; green and red only for a right guess or a player out of
        // guesses.
        const tagColour = s.left
          ? colors.textSecondary
          : s.onTurn
            ? colors.primary
            : s.answer === 'answered'
              ? colors.textSecondary
              : s.answer === 'waiting'
                ? colors.textSecondary
                : s.solved
                  ? colors.success
                  : s.out
                    ? colors.danger
                    : colors.textSecondary;
        const spoken = [
          s.name,
          s.card ? `${s.card.word}, ${meaning}` : s.kind ? `${hidden}, ${s.kind}` : hidden,
          t('games.whoAmI.points', { count: s.points }),
          t('games.whoAmI.seatAsked', { count: s.asked }),
          done,
          tag !== done ? tag : null,
        ]
          .filter((part) => !!part)
          .join(', ');
        return (
          <View
            key={s.seat}
            accessible
            accessibilityLabel={spoken}
            accessibilityState={{ selected: s.onTurn }}
            style={[
              wide ? styles.seatWide : styles.seat,
              { borderColor: s.onTurn ? colors.primary : 'transparent', backgroundColor: s.onTurn ? `${colors.primary}1F` : 'transparent', opacity: s.left ? 0.5 : 1 },
            ]}
          >
            <View style={styles.mini}>
              <View accessible={false} importantForAccessibility="no-hide-descendants">
                <SvgXml xml={svg} width={MINI} height={MINI} />
              </View>
              <View style={[styles.miniCard, { borderColor: s.solved ? FILL.yes.face : s.out ? FILL.no.face : tone.fill }]}>
                {s.card ? (
                  <>
                    <Text style={[styles.miniWord, kurdish(dialect)]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                      {s.card.word}
                    </Text>
                    <Text style={styles.miniMeaning} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                      {meaning}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.miniMark}>?</Text>
                    {s.kind ? (
                      <Text style={styles.miniMeaning} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                        {s.kind}
                      </Text>
                    ) : null}
                  </>
                )}
              </View>
              {s.solved || s.out ? (
                <View style={[styles.badge, { backgroundColor: s.solved ? FILL.yes.face : FILL.no.face }]}>
                  <Icon name={s.solved ? 'check' : 'close'} size={12} color={ON_ANSWER} />
                </View>
              ) : null}
            </View>
            <Text style={[styles.seatName, { color: colors.textPrimary }]} numberOfLines={1}>
              {s.name}
            </Text>
            <View style={[styles.seatStats, { flexDirection: dir.row }]}>
              <Icon name="star" size={12} color={colors.textSecondary} />
              <Text style={[styles.seatStat, { color: colors.textSecondary }]}>{s.points}</Text>
              <Icon name="question" size={12} color={colors.textSecondary} />
              <Text style={[styles.seatStat, { color: colors.textSecondary }]}>{s.asked}</Text>
            </View>
            <Text style={[styles.seatTag, { color: tagColour }]} numberOfLines={2}>
              {tag ?? ' '}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ───────────────────────────────────────────────────────────── the questions and the tiles

/**
 * The questions worth asking next, for a learner who does not know where to begin: each on the table's cloth, its
 * Kurdish large with its meaning under it, asked by one tap.
 */
export function SuggestedQuestions({
  dialect,
  questions,
  onAsk,
}: {
  dialect: GameDialect;
  questions: readonly WhoAmIQuestion[];
  onAsk: (question: string) => void;
}): React.JSX.Element {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <View style={styles.section}>
      <Text style={[styles.group, dir.text, { color: colors.textSecondary }]}>{t('games.whoAmI.suggested')}</Text>
      {questions.map((q) => {
        const meaning = meaningIn(q.meanings, locale) ?? q.meanings.en;
        return (
          <Pressable
            key={q.id}
            onPress={() => {
              haptic('select');
              onAsk(q.id);
            }}
            accessibilityRole="button"
            // The meaning is part of what the card says, so a listener hears it as a reader sees it.
            accessibilityLabel={`${t('games.whoAmI.ask')}: ${q.ku} (${meaning})`}
            style={styles.suggestEdge}
          >
            {({ pressed }) => (
              <View style={[styles.suggestFace, { flexDirection: dir.row }, pressed ? styles.down : null]}>
                <View style={styles.suggestText}>
                  <Text style={[styles.suggestKu, kurdish(dialect)]}>{q.ku}</Text>
                  <Text style={[styles.suggestMeaning, dir.text]}>{meaning}</Text>
                </View>
                <View style={dir.flip}>
                  <Icon name="chevron-right" size={20} color={TABLE.gold} />
                </View>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A player's questions as a list: those asked first, each with the card's answer stamped on it, then those still to
 * ask, each with Ask where allowed. `suggested` ones go to the top under their own label, so the eye lands where to
 * begin.
 */
export function QuestionDeck({
  dialect,
  title,
  questions,
  asked,
  suggested = [],
  meanings = false,
  busy = false,
  onAsk,
}: {
  dialect: GameDialect;
  /** The list's heading; none where its container already says what it is. */
  title?: string;
  questions: readonly WhoAmIQuestion[];
  asked: readonly WhoAmIAsked[];
  /** The questions worth asking next, put first under their own label; those already asked stay where they are. */
  suggested?: readonly string[];
  /** Each question's meaning is under it with no tap: the beginner's list. */
  meanings?: boolean;
  busy?: boolean;
  /** Asking one, on the reader's turn; null where the list is only to be read. */
  onAsk: ((question: string) => void) | null;
}): React.JSX.Element {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const dir = useDirection();
  const [open, setOpen] = useState<string | null>(null);
  // The card's own word for each question asked; a list kept before there were three answers holds only yes or no.
  const answers = new Map(asked.map((a) => [a.question, askedVerdict(a)]));
  const first = suggested.map((id) => questions.find((q) => q.id === id)).filter((q): q is WhoAmIQuestion => !!q && !answers.has(q.id));
  const rest = [
    ...asked.map((a) => questions.find((q) => q.id === a.question)).filter((q): q is WhoAmIQuestion => !!q),
    ...questions.filter((q) => !answers.has(q.id) && !first.includes(q)),
  ];
  const row = (q: WhoAmIQuestion): React.JSX.Element => {
    const answer = answers.get(q.id);
    const shown = open === q.id;
    const meaning = meaningIn(q.meanings, locale) ?? q.meanings.en;
    return (
      <View key={q.id} style={[styles.question, { flexDirection: dir.row, backgroundColor: answer === undefined ? colors.glassFill : colors.controlTrack }]}>
        {meanings ? (
          <View style={styles.questionText}>
            <Text style={[styles.questionKu, kurdish(dialect), { color: colors.textPrimary }]}>{q.ku}</Text>
            <Text style={[styles.muted, dir.text, { color: colors.textSecondary }]}>{meaning}</Text>
          </View>
        ) : (
          <Pressable
            onPress={() => setOpen(shown ? null : q.id)}
            accessibilityRole="button"
            accessibilityState={{ expanded: shown }}
            aria-expanded={shown}
            accessibilityLabel={q.ku}
            style={({ pressed }) => [styles.questionText, pressed && heldDim]}
          >
            <Text style={[styles.questionKu, kurdish(dialect), { color: colors.textPrimary }]}>{q.ku}</Text>
            {shown ? <Text style={[styles.muted, dir.text, { color: colors.textSecondary }]}>{meaning}</Text> : null}
          </Pressable>
        )}
        {answer !== undefined ? (
          <Stamp dialect={dialect} answer={answer} />
        ) : onAsk ? (
          <ClayButton
            label={t('games.whoAmI.ask')}
            accessibilityLabel={`${t('games.whoAmI.ask')}: ${q.ku}`}
            tone="primary"
            variant="outline"
            disabled={busy}
            onPress={() => onAsk(q.id)}
          />
        ) : null}
      </View>
    );
  };
  return (
    <View style={styles.section}>
      {title ? (
        <Text accessibilityRole="header" style={[styles.title, dir.text, { color: colors.textPrimary }]}>
          {title}
        </Text>
      ) : null}
      {meanings ? null : <Text style={[styles.muted, dir.text, { color: colors.textSecondary }]}>{t('games.whoAmI.tapToSee')}</Text>}
      {first.length > 0 ? <Text style={[styles.group, dir.text, { color: colors.textSecondary }]}>{t('games.whoAmI.suggested')}</Text> : null}
      {first.map(row)}
      {first.length > 0 && rest.length > 0 ? (
        <Text style={[styles.group, dir.text, { color: colors.textSecondary }]}>{t('games.whoAmI.otherQuestions')}</Text>
      ) : null}
      {rest.map(row)}
    </View>
  );
}

/**
 * The words a player may be, as paper tiles to guess from, online only and only once the player says they know: a list
 * in sight all along would make it a quiz. On one phone there are none, and a guess is said aloud.
 */
export function GuessTiles({
  dialect,
  tiles,
  crossed,
  busy = false,
  onGuess,
}: {
  dialect: GameDialect;
  tiles: readonly WhoAmITile[];
  /** The tiles guessed wrongly so far. */
  crossed: readonly string[];
  busy?: boolean;
  onGuess: (tile: string) => void;
}): React.JSX.Element {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const dir = useDirection();
  const [picked, setPicked] = useState<string | null>(null);
  const can = picked !== null && !crossed.includes(picked) && !busy;
  const heading = t('games.whoAmI.oneOfThese');
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.title, dir.text, { color: colors.textPrimary }]}>
        {heading}
      </Text>
      <View style={[styles.tiles, { flexDirection: dir.row }]} accessibilityRole="radiogroup" accessibilityLabel={heading}>
        {tiles.map((tile) => {
          const out = crossed.includes(tile.id);
          const on = picked === tile.id;
          const off = out || busy;
          return (
            <Pressable
              key={tile.id}
              onPress={() => {
                if (!on) haptic('select');
                setPicked(tile.id);
              }}
              disabled={off}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled: off }}
              accessibilityLabel={out ? `${tile.word}, ${t('games.whoAmI.notThis')}` : tile.word}
              style={[styles.tileEdge, { opacity: out ? 0.45 : 1 }]}
            >
              {({ pressed }) => (
                <View style={[styles.tile, { borderColor: on ? TABLE.gold : 'transparent' }, pressed || on ? styles.down : null]}>
                  <Text style={[styles.tileWord, kurdish(dialect), { textDecorationLine: out ? 'line-through' : 'none' }]}>{tile.word}</Text>
                  {tile.meanings ? <Text style={styles.tileMeaning}>{meaningIn(tile.meanings, locale) ?? tile.meanings.en}</Text> : null}
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      <ClayButton label={t('games.whoAmI.guess')} tone="primary" size="large" disabled={!can} onPress={() => (picked ? onGuess(picked) : undefined)} />
    </View>
  );
}

// ───────────────────────────────────────────────────────────── the question on the table

/**
 * A question in full: its Kurdish large, and its meaning at a tap. `plain` shows the meaning from the start, for a room
 * of beginners reading together.
 */
export function QuestionCard({
  dialect,
  question,
  ink,
  soft,
  size = 'regular',
  plain = false,
}: {
  dialect: GameDialect;
  question: WhoAmIQuestion;
  /** The colours of what it is written on. */
  ink: string;
  soft: string;
  /** `loud` is for the screen that holds nothing else: the question to read out to the room. */
  size?: 'regular' | 'large' | 'loud';
  plain?: boolean;
}): React.JSX.Element {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const meaning = meaningIn(question.meanings, locale) ?? question.meanings.en;
  const written = size === 'loud' ? styles.saidKuLoud : size === 'large' ? styles.saidKuLarge : styles.saidKu;
  const ku = <Text style={[written, kurdish(dialect), { color: ink }]}>{question.ku}</Text>;
  if (plain) {
    return (
      <View style={styles.said}>
        {ku}
        <Text style={[styles.saidMeaning, { color: soft }]}>{meaning}</Text>
      </View>
    );
  }
  return (
    <Pressable
      onPress={() => setOpen((o) => !o)}
      accessibilityRole="button"
      accessibilityLabel={question.ku}
      accessibilityHint={t('games.whoAmI.tapToSee')}
      accessibilityState={{ expanded: open }}
      aria-expanded={open}
      style={({ pressed }) => [styles.said, pressed && heldDim]}
    >
      {ku}
      <Text style={[open ? styles.saidMeaning : styles.saidHint, { color: soft }]}>{open ? meaning : t('games.whoAmI.tapToSee')}</Text>
    </Pressable>
  );
}

/**
 * "Could be" as a wave beside its word, in the weight of the keys' check and cross. The icon set has none, so it is
 * drawn here on the icons' 256-unit grid, as the website draws it.
 */
function MaybeMark({ size, color }: { size: number; color: string }): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256">
      <Path d="M40 148c24-40 56-56 88-20s64 20 88-20" fill="none" stroke={color} strokeWidth={24} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** The mark each answer wears beside its word and its colour: a check, a wave, a cross, a question mark. */
function AnswerMark({ answer, size, color }: { answer: WhoAmISays; size: number; color: string }): React.JSX.Element {
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants">
      {answer === 'sometimes' ? (
        <MaybeMark size={size} color={color} />
      ) : (
        <Icon name={answer === 'yes' ? 'check' : answer === 'no' ? 'close' : 'question'} size={size} color={color} />
      )}
    </View>
  );
}

/**
 * One answer as a large key on its own edge: its mark, the dialect's word and, for the in-between answers, the reader's
 * word under it. Yes, could be and no are filled in their colours; not sure is a quiet neutral line across the row.
 */
function AnswerKey({
  dialect,
  answer,
  disabled,
  onAnswer,
}: {
  dialect: GameDialect;
  answer: WhoAmISays;
  disabled: boolean;
  onAnswer: (says: WhoAmISays) => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const { colors } = useTheme();
  const word = answerWord(dialect, answer, t);
  const own = gloss(dialect, answer, t);
  const quiet = answer === 'unsure';
  const paint = quiet
    ? { face: colors.bubbleTheirs, edge: colors.switchOff, ink: colors.bubbleTheirsInk, soft: colors.textSecondary }
    : FILL[answer];
  const face = quiet ? [styles.unsureFace, { flexDirection: dialectRow(dialect) }] : styles.answerFace;
  return (
    <Pressable
      onPress={() => {
        haptic('select');
        onAnswer(answer);
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={own ? `${word}, ${own}` : word}
      accessibilityState={{ disabled }}
      aria-disabled={disabled}
      style={[quiet ? styles.unsureEdge : styles.answerEdge, { backgroundColor: paint.edge, opacity: disabled ? 0.5 : 1 }]}
    >
      {({ pressed }) => (
        <View style={[face, { backgroundColor: paint.face }, pressed ? styles.down : null]}>
          <AnswerMark answer={answer} size={quiet ? 18 : 22} color={paint.ink} />
          <Text style={[quiet ? styles.unsureText : styles.answerText, kurdish(dialect), { color: paint.ink }]}>{word}</Text>
          {own ? <Text style={[styles.answerGloss, { color: paint.soft }]}>{own}</Text> : null}
        </View>
      )}
    </Pressable>
  );
}

/**
 * A friend's answer to a question about somebody else's card: yes, could be and no in a row in the dialect's reading
 * order (in Soranî yes is on the right), and not sure as a quieter key under them. A two-answer table (`answers` 2)
 * offers only yes and no.
 */
export function AnswerButtons({
  dialect,
  answers,
  disabled = false,
  onAnswer,
}: {
  dialect: GameDialect;
  answers: WhoAmIAnswerCount;
  disabled?: boolean;
  onAnswer: (says: WhoAmISays) => void;
}): React.JSX.Element {
  // The keys' order, as the rules list them (WHO_AM_I_SAYS); not sure is its own key below the row.
  const row: readonly WhoAmISays[] = answers === 4 ? ['yes', 'sometimes', 'no'] : ['yes', 'no'];
  return (
    <View style={styles.answers}>
      <View style={[styles.answerRow, { flexDirection: dialectRow(dialect) }]}>
        {row.map((answer) => (
          <AnswerKey key={answer} dialect={dialect} answer={answer} disabled={disabled} onAnswer={onAnswer} />
        ))}
      </View>
      {answers === 4 ? <AnswerKey dialect={dialect} answer="unsure" disabled={disabled} onAnswer={onAnswer} /> : null}
    </View>
  );
}

/** What a room says to a guess said aloud: that is it, close (another word for the same thing), or not yet. */
export type Judged = 'right' | 'close' | 'wrong';

/** Each judgement in the colours and mark of its nearest answer, so the two sets of keys read alike. */
const JUDGED_AS: Record<Judged, WhoAmIAnswer> = { right: 'yes', close: 'sometimes', wrong: 'no' };

/**
 * The room's three keys for a guess said aloud, in the reader's words since a guess is not a game question. In the
 * colours, marks and order of yes, could be and no, stacked so each phrase fits a phone.
 */
export function JudgeButtons({ labels, onJudge }: { labels: Readonly<Record<Judged, string>>; onJudge: (judged: Judged) => void }): React.JSX.Element {
  const dir = useDirection();
  const order: readonly Judged[] = ['right', 'close', 'wrong'];
  return (
    <View style={styles.judges}>
      {order.map((judged) => {
        const paint = FILL[JUDGED_AS[judged]];
        return (
          <Pressable
            key={judged}
            onPress={() => {
              haptic('select');
              onJudge(judged);
            }}
            accessibilityRole="button"
            accessibilityLabel={labels[judged]}
            style={[styles.judgeEdge, { backgroundColor: paint.edge }]}
          >
            {({ pressed }) => (
              <View style={[styles.judgeFace, { flexDirection: dir.row, backgroundColor: paint.face }, pressed ? styles.down : null]}>
                <AnswerMark answer={JUDGED_AS[judged]} size={22} color={paint.ink} />
                <Text style={[styles.answerPhrase, { color: paint.ink }]}>{labels[judged]}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/** How one friend's answer went, as the rows under a verdict name it. */
const MARK_KEY: Record<WhoAmITableMark, TranslationKey> = {
  right: 'games.whoAmI.answer.right',
  close: 'games.whoAmI.answer.close',
  wrong: 'games.whoAmI.answer.wrong',
  unsure: 'games.whoAmI.answer.unsure',
  none: 'games.whoAmI.answer.none',
};

/**
 * How it went, by a mark as well as a word: check right, wave close, cross wrong, question mark not sure. An answer let
 * run out has no mark.
 */
const MARKED_AS: Record<Exclude<WhoAmITableMark, 'none'>, WhoAmISays> = { right: 'yes', close: 'sometimes', wrong: 'no', unsure: 'unsure' };

/** How one seat answered the question, for the verdict. */
export interface VerdictAnswer {
  seat: number;
  name: string;
  /** What they said; null when their time ran out. */
  says: WhoAmISays | null;
  /** How the card scored it: right, close, wrong, not sure, or none for no answer in time. */
  mark: WhoAmITableMark;
}

/** A card and a question as the server knows them: by their ids on one phone, by game and seat at an online table. */
export type ReportBody = { identity: string; question: string } | { game: string; seat: number; question: string };

/**
 * Reporting a card's answer as wrong, at the foot of its verdict, for a reader who could see the card: one tap, then a
 * thank-you (also announced). The server only flags the card for its editors; nothing a player sends changes it. `done`
 * is for a verdict drawn again further down, so the thank-you stays.
 */
function ReportAnswer({ body, ink, done = false, onDone }: { body: ReportBody; ink: string; done?: boolean; onDone?: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const { client } = useAuth();
  const dir = useDirection();
  const [state, setState] = useState<'ready' | 'sending' | 'done'>(done ? 'done' : 'ready');
  const [error, setError] = useState<string | null>(null);
  const thanked = state === 'done';
  useEffect(() => {
    if (thanked && !done) AccessibilityInfo.announceForAccessibility?.(t('games.whoAmI.reported'));
  }, [thanked, done, t]);
  const send = async (): Promise<void> => {
    setState('sending');
    setError(null);
    const res = await client.post<{ counted: boolean }>('/games/who-am-i/report', body);
    if (!res.ok) {
      setState('ready');
      setError(describeError(res.error, t));
      return;
    }
    setState('done');
    onDone?.();
  };
  return (
    <View accessibilityLiveRegion="polite" style={styles.report}>
      {thanked ? (
        <Text style={[styles.reportText, { color: ink }]}>{t('games.whoAmI.reported')}</Text>
      ) : (
        <Pressable
          onPress={() => void send()}
          disabled={state === 'sending'}
          accessibilityRole="button"
          accessibilityLabel={t('games.whoAmI.report')}
          accessibilityState={{ disabled: state === 'sending', busy: state === 'sending' }}
          style={({ pressed }) => [styles.reportButton, { flexDirection: dir.row }, pressed && heldDim]}
        >
          <Icon name="flag" size={16} color={ink} />
          <Text style={[styles.reportText, styles.reportLink, { color: ink }]}>{t('games.whoAmI.report')}</Text>
        </Pressable>
      )}
      {error ? (
        <Text accessibilityRole="alert" style={[styles.reportText, { color: ink }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * What the card said to a question, on a card of the answer's colour, with who asked, the question and how each friend
 * did. "Could be" says what it means, since a learner may not expect a card to give it. `quiet` draws it on the page's
 * surface, for the last question while the next turn is under way; `report` adds the way to report it.
 */
export function VerdictCard({
  dialect,
  heading,
  question,
  verdict,
  answers = [],
  note,
  quiet = false,
  plain = false,
  report = null,
}: {
  dialect: GameDialect;
  heading: string;
  question: WhoAmIQuestion;
  verdict: WhoAmIAnswer;
  answers?: readonly VerdictAnswer[];
  /** A line under the answer: how the friends did, on one phone. */
  note?: string;
  quiet?: boolean;
  /** The question's meaning is under it from the start, as when it was read out. */
  plain?: boolean;
  /** The card and question to report, and whether this reader already has. */
  report?: { body: ReportBody; done?: boolean; onDone?: () => void } | null;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const paint = quiet
    ? { fill: colors.glassFill, ink: colors.textPrimary, soft: colors.textSecondary, veil: colors.controlTrack }
    : { fill: FILL[verdict].face, ink: FILL[verdict].ink, soft: FILL[verdict].soft, veil: FILL[verdict].veil };
  const said = answerWord(dialect, verdict, t);
  return (
    <View accessibilityLiveRegion="polite" style={[styles.verdict, { backgroundColor: paint.fill }]}>
      <Text style={[styles.verdictHeading, { color: paint.soft }]}>{heading}</Text>
      <QuestionCard key={question.id} dialect={dialect} question={question} ink={paint.ink} soft={paint.soft} plain={plain} />
      <View accessible accessibilityLabel={t('games.whoAmI.verdict', { answer: said })} style={styles.verdictSays}>
        <Text style={[styles.verdictLabel, { color: paint.soft }]}>{t('games.whoAmI.cardSays')}</Text>
        {quiet ? <Stamp dialect={dialect} answer={verdict} large /> : <Text style={[styles.verdictWord, kurdish(dialect), { color: paint.ink }]}>{said}</Text>}
      </View>
      {verdict === 'sometimes' ? <Text style={[styles.verdictEither, { color: paint.ink }]}>{t('games.whoAmI.eitherNote')}</Text> : null}
      {note ? <Text style={[styles.verdictNote, { color: paint.ink }]}>{note}</Text> : null}
      {answers.length > 0 ? (
        <View style={styles.verdictRows}>
          {answers.map((a) => {
            const word = a.says === null ? null : answerWord(dialect, a.says, t);
            const mark = t(MARK_KEY[a.mark]);
            return (
              <View
                key={a.seat}
                accessible
                accessibilityLabel={word ? `${a.name}: ${word}, ${mark}` : `${a.name}: ${mark}`}
                style={[styles.verdictRow, { flexDirection: dir.row, backgroundColor: paint.veil }]}
              >
                <Text style={[styles.verdictName, dir.text, { color: paint.ink }]} numberOfLines={1}>
                  {a.name}
                </Text>
                {word ? <Text style={[styles.verdictSaid, kurdish(dialect), { color: paint.ink }]}>{word}</Text> : null}
                <View style={[styles.verdictMark, { flexDirection: dir.row }]}>
                  {a.mark === 'none' ? null : <AnswerMark answer={MARKED_AS[a.mark]} size={14} color={paint.ink} />}
                  <Text style={[styles.verdictMarkText, { color: paint.ink }]}>{mark}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
      {report ? <ReportAnswer key={JSON.stringify(report.body)} body={report.body} ink={paint.ink} done={report.done} onDone={report.onDone} /> : null}
    </View>
  );
}

// ───────────────────────────────────────────────────────────── what folds away

/**
 * A part of the screen folded under its title, out of the game's way. `bare` lays its contents straight on the page,
 * for a list whose rows have fills of their own.
 */
export function Fold({
  title,
  icon,
  bare = false,
  startOpen = false,
  children,
}: {
  title: string;
  icon?: IconName;
  bare?: boolean;
  /** Open from the start, where its contents are the next thing to reach for. */
  startOpen?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const [open, setOpen] = useState(startOpen);
  return (
    <View style={bare ? styles.foldBare : [styles.fold, { backgroundColor: colors.glassFill }]}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        style={({ pressed }) => [styles.foldHead, { flexDirection: dir.row }, bare ? [styles.foldHeadBare, { backgroundColor: colors.glassFill }] : null, pressed && heldDim]}
      >
        {icon ? <Icon name={icon} size={18} color={colors.textSecondary} /> : null}
        <Text style={[styles.foldTitle, dir.text, { color: colors.textPrimary }]}>{title}</Text>
        <View style={open ? styles.turned : null}>
          <Icon name="chevron-down" size={18} color={colors.textSecondary} />
        </View>
      </Pressable>
      {open ? <View style={bare ? null : styles.foldBody}>{children}</View> : null}
    </View>
  );
}

/**
 * How the game scores, folded under its title. `guesses` is how many wrong guesses put a player out (one more in one
 * room than online); `answers` is how many the friends are offered, and only a table of four explains "could be" and
 * "not sure".
 */
export function ScoringNote({ guesses = WHO_AM_I_GUESSES, answers = 4 }: { guesses?: number; answers?: WhoAmIAnswerCount }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const line = [styles.scoringLine, dir.text, { color: colors.textSecondary }];
  return (
    <Fold title={t('games.whoAmI.scoring.title')} icon="star">
      <Text style={line}>
        {t('games.whoAmI.scoring.own', { start: WHO_AM_I_START_POINTS, question: WHO_AM_I_QUESTION_COST, wrong: WHO_AM_I_WRONG_GUESS_COST })}
      </Text>
      <Text style={line}>{t('games.whoAmI.scoring.help', { count: WHO_AM_I_HELP_POINTS, cap: WHO_AM_I_HELP_CAP })}</Text>
      {answers === 4 ? (
        <>
          <Text style={line}>{t('games.whoAmI.scoring.either')}</Text>
          <Text style={line}>{t('games.whoAmI.scoring.unsure')}</Text>
        </>
      ) : null}
      <Text style={line}>{t('games.whoAmI.scoring.out', { count: guesses })}</Text>
    </Fold>
  );
}

const styles = StyleSheet.create({
  stage: { alignSelf: 'center' },
  card: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: radii.sm,
    borderWidth: 3,
    backgroundColor: PAPER,
  },
  // The same card on a deer drawn small: no room round its mark, and a lighter edge.
  cardSmall: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderRadius: radii.xs, borderWidth: 2, backgroundColor: PAPER },
  cardMark: { fontSize: 28, fontWeight: typography.weights.bold, color: PAPER_INK },
  cardMarkSmall: { fontSize: 16, lineHeight: 20, fontWeight: typography.weights.bold, color: PAPER_INK },
  cardWord: { fontSize: 20, fontWeight: typography.weights.bold, color: PAPER_INK },
  cardWordSmall: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, color: PAPER_INK },
  cardWordLarge: { fontSize: 30, lineHeight: 38, fontWeight: typography.weights.bold, color: PAPER_INK },
  cardKind: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: PAPER_SOFT },
  cardKindLarge: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: PAPER_SOFT },

  table: { flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  // Gold round a seat marks its turn, a state not a frame; every other seat's edge is clear.
  seat: { width: '31%', alignItems: 'center', gap: 2, paddingVertical: spacing.xs, paddingHorizontal: 2, borderWidth: 2, borderRadius: radii.lg },
  seatWide: { width: '47%', alignItems: 'center', gap: 2, paddingVertical: spacing.xs, paddingHorizontal: 2, borderWidth: 2, borderRadius: radii.lg },
  mini: { alignSelf: 'stretch', height: MINI, alignItems: 'center' },
  // As wide as its seat at three to a row, and no wider than a forehead card where the seats are wide.
  miniCard: {
    position: 'absolute',
    alignSelf: 'center',
    width: '96%',
    maxWidth: 116,
    top: MINI * FOREHEAD.y - MINI_CARD_H / 2,
    minHeight: MINI_CARD_H,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 2,
    backgroundColor: PAPER,
  },
  miniWord: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, color: PAPER_INK },
  miniMeaning: { fontSize: typography.sizes.xs, color: PAPER_SOFT },
  miniMark: { fontSize: 20, fontWeight: typography.weights.bold, color: PAPER_INK },
  badge: { position: 'absolute', top: 0, right: 0, width: 20, height: 20, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  seatName: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, maxWidth: '100%' },
  seatStats: { alignItems: 'center', gap: 4 },
  seatStat: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, marginEnd: 4 },
  seatTag: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, textAlign: 'center' },

  section: { gap: spacing.sm },
  title: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  muted: { fontSize: typography.sizes.sm },
  // What a group of questions is, said small over it.
  group: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 0.8, textTransform: 'uppercase' },
  // A suggested question stands on its own edge and presses down onto it under the thumb.
  suggestEdge: { borderRadius: radii.lg, backgroundColor: TABLE.nightDeep, paddingBottom: 4 },
  suggestFace: {
    minHeight: 64,
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: TABLE.nightLight,
  },
  suggestText: { flex: 1, gap: 2 },
  suggestKu: { fontSize: 20, lineHeight: 28, fontWeight: typography.weights.bold, color: TABLE.ink },
  suggestMeaning: { fontSize: typography.sizes.sm, lineHeight: 20, color: TABLE.inkSoft },
  question: { alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, padding: 6 },
  questionText: { flex: 1, minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: 6 },
  questionKu: { fontSize: 18, fontWeight: typography.weights.semibold },
  stamp: {
    minWidth: 64,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 3,
    borderRadius: radii.sm,
    fontWeight: typography.weights.bold,
    fontSize: 17,
    textAlign: 'center',
  },
  stampLarge: {
    minWidth: 96,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderWidth: 4,
    borderRadius: radii.sm,
    fontWeight: typography.weights.bold,
    fontSize: 28,
    textAlign: 'center',
  },
  tiles: { flexWrap: 'wrap', gap: spacing.sm },
  // A tile is a paper card on its own edge, and presses down onto it when chosen.
  tileEdge: { minWidth: 120, flexGrow: 1, borderRadius: radii.md, backgroundColor: PAPER_EDGE, paddingBottom: 4 },
  tile: { minHeight: 56, borderWidth: 3, borderRadius: radii.md, padding: spacing.sm, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: PAPER },
  tileWord: { fontSize: 18, fontWeight: typography.weights.bold, color: PAPER_INK },
  tileMeaning: { fontSize: typography.sizes.sm, color: PAPER_SOFT },
  down: { transform: [{ translateY: 3 }] },

  said: { alignSelf: 'stretch', minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center', gap: 4 },
  saidKu: { fontSize: typography.sizes.lg, lineHeight: 30, fontWeight: typography.weights.bold, textAlign: 'center' },
  saidKuLarge: { fontSize: typography.sizes.xl, lineHeight: 38, fontWeight: typography.weights.bold, textAlign: 'center' },
  saidKuLoud: { fontSize: typography.sizes.xxl, lineHeight: 46, fontWeight: typography.weights.bold, textAlign: 'center' },
  saidMeaning: { fontSize: typography.sizes.md, textAlign: 'center' },
  saidHint: { fontSize: typography.sizes.xs, textAlign: 'center' },
  answers: { alignSelf: 'stretch', gap: spacing.sm },
  answerRow: { alignSelf: 'stretch', gap: spacing.sm },
  // In a row the keys share its width and stand as tall as the tallest.
  answerEdge: { flex: 1, minWidth: 0, borderRadius: radii.lg, paddingBottom: 5 },
  answerFace: {
    flexGrow: 1,
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.lg,
  },
  answerText: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, textAlign: 'center' },
  answerGloss: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, textAlign: 'center' },
  // Not sure: one line across the row, mark, word and gloss side by side, lower than the keys above.
  unsureEdge: { alignSelf: 'stretch', borderRadius: radii.lg, paddingBottom: 4 },
  unsureFace: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.lg,
  },
  unsureText: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  judges: { alignSelf: 'stretch', gap: spacing.sm },
  // Stacked, each is as tall as its own face; sharing out a height that is not there would fold them flat.
  judgeEdge: { borderRadius: radii.lg, paddingBottom: 5 },
  judgeFace: { minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.lg },
  answerPhrase: { flexShrink: 1, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, textAlign: 'center' },

  verdict: { alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radii.xl },
  verdictHeading: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, textAlign: 'center' },
  verdictSays: { alignItems: 'center', gap: 2 },
  verdictLabel: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 0.8, textTransform: 'uppercase', textAlign: 'center' },
  verdictWord: { fontSize: 44, lineHeight: 54, fontWeight: typography.weights.bold, textAlign: 'center' },
  verdictNote: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, textAlign: 'center' },
  // What "could be" means, straight under the card's word.
  verdictEither: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, textAlign: 'center' },
  // Reporting the card: a quiet line at the foot of the verdict, in the card's ink.
  report: { alignSelf: 'stretch', alignItems: 'center', gap: 2 },
  reportButton: { minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: spacing.md, borderRadius: radii.xl },
  reportText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, textAlign: 'center' },
  reportLink: { textDecorationLine: 'underline' },
  verdictRows: { alignSelf: 'stretch', gap: spacing.xs },
  verdictRow: { minHeight: 40, alignItems: 'center', gap: spacing.sm, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.md },
  verdictName: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  verdictSaid: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  verdictMark: { alignItems: 'center', gap: 4 },
  verdictMarkText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },

  fold: { borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  // Laid bare, only the title is a surface; what opens under it sits on the page like the rows round it.
  foldBare: { gap: spacing.sm },
  foldHeadBare: { borderRadius: radii.lg, paddingHorizontal: spacing.md },
  foldHead: { minHeight: MIN_TOUCH_TARGET, alignItems: 'center', gap: spacing.sm },
  foldTitle: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  foldBody: { gap: spacing.xs, paddingBottom: spacing.sm },
  scoringLine: { fontSize: typography.sizes.sm, lineHeight: 21 },
  turned: { transform: [{ rotate: '180deg' }] },
});
