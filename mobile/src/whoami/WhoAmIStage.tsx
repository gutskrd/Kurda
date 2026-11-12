import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import {
  FOREHEAD,
  WHO_AM_I_GUESSES,
  WHO_AM_I_HELP_POINTS,
  WHO_AM_I_QUESTION_COST,
  WHO_AM_I_START_POINTS,
  WHO_AM_I_WRONG_GUESS_COST,
  deerSilhouetteSvg,
  dialectDirection,
  learnGame,
  meaningIn,
  type GameDialect,
  type Meanings,
  type WhoAmIAsked,
  type WhoAmIQuestion,
  type WhoAmITile,
} from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { TONES } from '../coursemap/path';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useDirection } from '../reports/direction';
import { ClayButton } from '../theme/glass';
import { Icon, type IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { TABLE } from '../impostor/table';

/**
 * Who Am I?'s stage on the phone: the parts the room with friends
 * (WhoAmIScreen.tsx) and the game on one phone (WhoAmICouch.tsx) are both
 * drawn from (the website's are in whoami/WhoAmIStage.tsx).
 *
 * Hevalo's silhouette with a card on his forehead, large for the one the
 * screen is about and small for every seat at the table; the questions worth
 * asking next as cards one tap asks; the deck of Kurdish questions, the
 * suggested ones first, where Ask asks one and the card's answer is stamped
 * on it in the dialect's own yes or no; the paper tiles to guess from, a
 * wrong one crossed out; the question on the table with the two answers to
 * give; the card's verdict as a card of its own colour; and what folds away
 * under a title, how the game scores among it.
 *
 * What a question means is under it wherever a beginner reads it (the
 * suggested cards, the beginner's deck, the question read out on one phone);
 * elsewhere a tap shows it, so a learner further on tries the Kurdish first.
 *
 * Nothing here decides what may be seen. A card is drawn when it is handed in
 * and the hidden mark when it is not, so a screen shows a player their own
 * card only once the rules have taken it off their forehead. Kurdish keeps
 * its own direction everywhere; with Reduce Motion the card and the stamps
 * simply appear.
 */

export const WHO_AM_I_TONE = learnGame('who-am-i').tone;

const CATEGORY_KEY: Record<string, TranslationKey> = {
  animal: 'games.whoAmI.cat.animal',
  object: 'games.whoAmI.cat.object',
  profession: 'games.whoAmI.cat.profession',
  food: 'games.whoAmI.cat.food',
  place: 'games.whoAmI.cat.place',
};

/** A card is paper in the light theme and the dark, as the table's cards are: the same card whoever looks at it. */
const PAPER = '#fbf6e9';
const PAPER_EDGE = '#d8ccb0';
const PAPER_INK = '#2a2a33';
const PAPER_SOFT = '#5b5b66';
/** Yes and no, each with the edge its button stands on and the ink written on it. */
const YES = '#2e7a52';
const YES_EDGE = '#1f5739';
const NO = '#a9532f';
const NO_EDGE = '#7d3c21';
const ON_ANSWER = '#ffffff';
const ON_ANSWER_SOFT = 'rgba(255, 255, 255, 0.86)';
const ON_ANSWER_VEIL = 'rgba(255, 255, 255, 0.16)';

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** The dialect's own yes or no, from the catalogue. */
export function yesNo(dialect: GameDialect, answer: boolean, t: Translate): string {
  if (dialect === 'ckb') return t(answer ? 'games.whoAmI.yesCkb' : 'games.whoAmI.noCkb');
  return t(answer ? 'games.whoAmI.yesKmr' : 'games.whoAmI.noKmr');
}

/** What kind of thing a hidden card is, in the reader's words; null when the card may not say. */
export function kindOf(category: string | null, t: Translate): string | null {
  return category !== null && CATEGORY_KEY[category] ? t(CATEGORY_KEY[category]!) : null;
}

/** Names read as a list the way the reader's language joins them; a comma where the phone cannot say. */
export function listed(names: readonly string[], locale: string): string {
  try {
    const formats = Intl as unknown as { ListFormat?: new (locale: string, options: { type: 'conjunction' }) => { format(items: readonly string[]): string } };
    if (formats.ListFormat) return new formats.ListFormat(locale, { type: 'conjunction' }).format(names);
  } catch {
    // an older engine has no list format: the comma below says it well enough
  }
  return names.join(', ');
}

function kurdish(dialect: GameDialect): { writingDirection: 'rtl' | 'ltr' } {
  return { writingDirection: dialectDirection(dialect).dir };
}

/** A card as it is read: the word, and what it means. */
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
 * How a card is cut for where it is read: on the reader's own screen, small
 * on a deer drawn beside a banner (the mark or the word alone), or large for
 * friends who read it from where they sit.
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
  /** what kind of thing it is, when the card may say (every tile that kind); null when it may not */
  category: string | null;
  /** the card's face, once it may be read here; null while it stays hidden */
  identity: CardFace | null;
  size?: number;
  cut?: CardCut;
  /** on the night cloth, where the deer is the evening's colour whatever the theme */
  night?: boolean;
  /** what a screen reader calls the hidden card, where it is not the reader's own */
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
    const anim = Animated.timing(turn, { toValue: 1, duration: 480, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [shown, reduce, turn]);
  const rotateY = turn.interpolate({ inputRange: [0, 1], outputRange: ['90deg', '0deg'] });
  const kind = kindOf(category, t);
  const small = cut === 'small';
  const large = cut === 'large';
  // a card never narrower than a word needs, however small the one who wears it is drawn; the small cut alone follows the deer
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

function Stamp({ dialect, answer, large = false }: { dialect: GameDialect; answer: boolean; large?: boolean }): React.JSX.Element {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const land = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) return;
    const anim = Animated.spring(land, { toValue: 1, useNativeDriver: true, friction: 6 });
    anim.start();
    return () => anim.stop();
  }, [land, reduce]);
  const scale = land.interpolate({ inputRange: [0, 1], outputRange: [1.6, 1] });
  const colour = answer ? YES : NO;
  return (
    <Animated.Text
      style={[
        large ? styles.stampLarge : styles.stamp,
        kurdish(dialect),
        { color: colour, borderColor: colour, opacity: land, transform: [{ rotate: '-8deg' }, { scale }] },
      ]}
    >
      {yesNo(dialect, answer, t)}
    </Animated.Text>
  );
}

// ───────────────────────────────────────────────────────────── the table

/** One seat at the table, as the screen in front may draw it. */
export interface TableSeat {
  seat: number;
  name: string;
  /** the reader's own seat */
  mine: boolean;
  /** the card on this forehead, where the screen may show it; null draws the hidden mark */
  card: CardFace | null;
  /** what kind of thing a hidden card is, when it may say */
  kind: string | null;
  points: number;
  asked: number;
  solved: boolean;
  out: boolean;
  left: boolean;
  onTurn: boolean;
  /** while a question is being answered: whether this seat has answered it or is still to; null when it has no say */
  answer: 'answered' | 'waiting' | null;
}

const MINI = 80;
const MINI_CARD_H = 40;

/**
 * Everyone at the table as a row of small foreheads: the deer with that
 * seat's card, the name under it, the points and the questions asked, a mark
 * for whoever has their card, is out or has left, and gold round the seat on
 * turn. Two to a row for two or four, three for the rest, so six fit a phone.
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
        const tagColour = s.left
          ? colors.textSecondary
          : s.onTurn
            ? colors.goldText
            : s.answer === 'answered'
              ? colors.success
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
              { borderColor: s.onTurn ? colors.gold : 'transparent', backgroundColor: s.onTurn ? `${TABLE.gold}26` : 'transparent', opacity: s.left ? 0.5 : 1 },
            ]}
          >
            <View style={styles.mini}>
              <View accessible={false} importantForAccessibility="no-hide-descendants">
                <SvgXml xml={svg} width={MINI} height={MINI} />
              </View>
              <View style={[styles.miniCard, { borderColor: s.solved ? YES : s.out ? NO : tone.fill }]}>
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
                <View style={[styles.badge, { backgroundColor: s.solved ? YES : NO }]}>
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
 * The questions worth asking next, for a learner who does not know where to
 * begin: each a card of the table's own cloth, its Kurdish large and what it
 * means under it for every reader, and one tap asks it.
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
            // the meaning is part of what the card says, so someone listening hears it as someone looking reads it
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
  /** the list's heading; none where what holds the list has already said what it is */
  title?: string;
  questions: readonly WhoAmIQuestion[];
  asked: readonly WhoAmIAsked[];
  /** the questions worth asking next, put first under a label of their own; those already asked are left where they are */
  suggested?: readonly string[];
  /** what each question means is under it with no tap: the beginner's list */
  meanings?: boolean;
  busy?: boolean;
  /** asking one, on the reader's turn to; null where the list is only to be read */
  onAsk: ((question: string) => void) | null;
}): React.JSX.Element {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const dir = useDirection();
  const [open, setOpen] = useState<string | null>(null);
  const answers = new Map(asked.map((a) => [a.question, a.answer]));
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
            style={styles.questionText}
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
      {first.length > 0 && rest.length > 0 ? <Text style={[styles.group, dir.text, { color: colors.textSecondary }]}>{t('games.whoAmI.otherQuestions')}</Text> : null}
      {rest.map(row)}
    </View>
  );
}

export function GuessTiles({
  dialect,
  title,
  tiles,
  crossed,
  busy = false,
  onGuess,
}: {
  dialect: GameDialect;
  /** what the tiles are called, where "Who are you?" is already said above them */
  title?: string;
  tiles: readonly WhoAmITile[];
  /** the tiles guessed wrongly so far */
  crossed: readonly string[];
  busy?: boolean;
  /** guessing one, when the reader may; null where the tiles are only to be read */
  onGuess: ((tile: string) => void) | null;
}): React.JSX.Element {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const dir = useDirection();
  const [picked, setPicked] = useState<string | null>(null);
  const open = onGuess !== null;
  const can = open && picked !== null && !crossed.includes(picked) && !busy;
  const heading = title ?? t('games.whoAmI.guessTitle');
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.title, dir.text, { color: colors.textPrimary }]}>
        {heading}
      </Text>
      <View style={[styles.tiles, { flexDirection: dir.row }]} accessibilityRole="radiogroup" accessibilityLabel={heading}>
        {tiles.map((tile) => {
          const out = crossed.includes(tile.id);
          const on = open && picked === tile.id;
          const off = !open || out || busy;
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
      {open ? <ClayButton label={t('games.whoAmI.guess')} tone="primary" size="large" disabled={!can} onPress={() => (picked ? onGuess(picked) : undefined)} /> : null}
    </View>
  );
}

// ───────────────────────────────────────────────────────────── the question on the table

/**
 * A question said in full: its Kurdish, large, and what it means at a tap.
 * `plain` writes the meaning under it from the start, for a room of beginners
 * reading it together: nothing to press, and nothing kept back.
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
  /** the colours of what it is written on */
  ink: string;
  soft: string;
  /** `loud` is for the one screen that holds nothing else: the question to read out to the room */
  size?: 'regular' | 'large' | 'loud';
  plain?: boolean;
}): React.JSX.Element {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const meaning = meaningIn(question.meanings, locale) ?? question.meanings.en;
  const ku = <Text style={[size === 'loud' ? styles.saidKuLoud : size === 'large' ? styles.saidKuLarge : styles.saidKu, kurdish(dialect), { color: ink }]}>{question.ku}</Text>;
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
      style={styles.said}
    >
      {ku}
      <Text style={[open ? styles.saidMeaning : styles.saidHint, { color: soft }]}>{open ? meaning : t('games.whoAmI.tapToSee')}</Text>
    </Pressable>
  );
}

/** The two answers to give, in the dialect's own yes and no: two buttons a thumb cannot miss. */
export function YesNoButtons({ dialect, disabled = false, onAnswer }: { dialect: GameDialect; disabled?: boolean; onAnswer: (yes: boolean) => void }): React.JSX.Element {
  const { t } = useI18n();
  const dir = useDirection();
  return (
    <View style={[styles.yesNo, { flexDirection: dir.row }]}>
      {[true, false].map((yes) => (
        <Pressable
          key={String(yes)}
          onPress={() => {
            haptic('select');
            onAnswer(yes);
          }}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={yesNo(dialect, yes, t)}
          accessibilityState={{ disabled }}
          aria-disabled={disabled}
          style={[styles.answerEdge, { backgroundColor: yes ? YES_EDGE : NO_EDGE, opacity: disabled ? 0.5 : 1 }]}
        >
          {({ pressed }) => (
            <View style={[styles.answerFace, { backgroundColor: yes ? YES : NO }, pressed ? styles.down : null]}>
              <Text style={[styles.answerText, kurdish(dialect)]}>{yesNo(dialect, yes, t)}</Text>
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}

/** How one seat answered the question, for the verdict. */
export interface VerdictAnswer {
  seat: number;
  name: string;
  /** null when their time ran out */
  yes: boolean | null;
  right: boolean;
}

/**
 * What the card itself said to a question: a card of the answer's own colour,
 * green for yes and clay for no, with who asked, the question, and how each
 * friend answered. `quiet` draws it on the page's own surface, for the last
 * question while the next turn is already under way.
 */
export function VerdictCard({
  dialect,
  heading,
  question,
  truth,
  answers = [],
  note,
  quiet = false,
  plain = false,
}: {
  dialect: GameDialect;
  heading: string;
  question: WhoAmIQuestion;
  truth: boolean;
  answers?: readonly VerdictAnswer[];
  /** a line under the answer: how the friends did, on one phone */
  note?: string;
  quiet?: boolean;
  /** the question's meaning is under it from the start, as it was when it was read out */
  plain?: boolean;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const paint = quiet
    ? { fill: colors.glassFill, ink: colors.textPrimary, soft: colors.textSecondary, veil: colors.controlTrack }
    : { fill: truth ? YES : NO, ink: ON_ANSWER, soft: ON_ANSWER_SOFT, veil: ON_ANSWER_VEIL };
  const said = yesNo(dialect, truth, t);
  return (
    <View accessibilityLiveRegion="polite" style={[styles.verdict, { backgroundColor: paint.fill }]}>
      <Text style={[styles.verdictHeading, { color: paint.soft }]}>{heading}</Text>
      <QuestionCard key={question.id} dialect={dialect} question={question} ink={paint.ink} soft={paint.soft} plain={plain} />
      <View accessible accessibilityLabel={t('games.whoAmI.verdict', { answer: said })} style={styles.verdictSays}>
        <Text style={[styles.verdictLabel, { color: paint.soft }]}>{t('games.whoAmI.cardSays')}</Text>
        {quiet ? <Stamp dialect={dialect} answer={truth} large /> : <Text style={[styles.verdictWord, kurdish(dialect), { color: paint.ink }]}>{said}</Text>}
      </View>
      {note ? <Text style={[styles.verdictNote, { color: paint.ink }]}>{note}</Text> : null}
      {answers.length > 0 ? (
        <View style={styles.verdictRows}>
          {answers.map((a) => {
            const word = a.yes === null ? null : yesNo(dialect, a.yes, t);
            const mark = a.yes === null ? t('games.whoAmI.answer.none') : t(a.right ? 'games.whoAmI.answer.right' : 'games.whoAmI.answer.wrong');
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
                  {a.yes !== null ? <Icon name={a.right ? 'check' : 'close'} size={14} color={paint.ink} /> : null}
                  <Text style={[styles.verdictMarkText, { color: paint.ink }]}>{mark}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

// ───────────────────────────────────────────────────────────── what folds away

/**
 * A part of the screen folded away under its title: there for whoever asks,
 * out of the way of the game. `bare` lays what is inside straight on the
 * page, for a list whose rows have fills of their own.
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
  /** open from the start, where what is inside is the next thing to reach for */
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
        style={[styles.foldHead, { flexDirection: dir.row }, bare ? [styles.foldHeadBare, { backgroundColor: colors.glassFill }] : null]}
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

/** How the game scores, folded away under its title. */
export function ScoringNote(): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  return (
    <Fold title={t('games.whoAmI.scoring.title')} icon="star">
      <Text style={[styles.scoringLine, dir.text, { color: colors.textSecondary }]}>
        {t('games.whoAmI.scoring.own', { start: WHO_AM_I_START_POINTS, question: WHO_AM_I_QUESTION_COST, wrong: WHO_AM_I_WRONG_GUESS_COST })}
      </Text>
      <Text style={[styles.scoringLine, dir.text, { color: colors.textSecondary }]}>{t('games.whoAmI.scoring.help', { count: WHO_AM_I_HELP_POINTS })}</Text>
      <Text style={[styles.scoringLine, dir.text, { color: colors.textSecondary }]}>{t('games.whoAmI.scoring.out', { count: WHO_AM_I_GUESSES })}</Text>
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
  // the same card on a deer drawn small: no room round its mark, and a lighter edge
  cardSmall: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderRadius: radii.xs, borderWidth: 2, backgroundColor: PAPER },
  cardMark: { fontSize: 28, fontWeight: typography.weights.bold, color: PAPER_INK },
  cardMarkSmall: { fontSize: 16, lineHeight: 20, fontWeight: typography.weights.bold, color: PAPER_INK },
  cardWord: { fontSize: 20, fontWeight: typography.weights.bold, color: PAPER_INK },
  cardWordSmall: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, color: PAPER_INK },
  cardWordLarge: { fontSize: 30, lineHeight: 38, fontWeight: typography.weights.bold, color: PAPER_INK },
  cardKind: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: PAPER_SOFT },
  cardKindLarge: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: PAPER_SOFT },

  table: { flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  // the gold round a seat is its turn, a state and not a frame: every other seat's edge is clear
  seat: { width: '31%', alignItems: 'center', gap: 2, paddingVertical: spacing.xs, paddingHorizontal: 2, borderWidth: 2, borderRadius: radii.lg },
  seatWide: { width: '47%', alignItems: 'center', gap: 2, paddingVertical: spacing.xs, paddingHorizontal: 2, borderWidth: 2, borderRadius: radii.lg },
  mini: { alignSelf: 'stretch', height: MINI, alignItems: 'center' },
  // as wide as its seat on a phone's three to a row, and no wider than a card held to a forehead where the seats are wide
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
  // what a group of questions is, said small over it
  group: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 0.8, textTransform: 'uppercase' },
  // a suggested question is a card of the table's cloth standing on its own edge, and goes down onto it under the thumb
  suggestEdge: { borderRadius: radii.lg, backgroundColor: TABLE.nightDeep, paddingBottom: 4 },
  suggestFace: { minHeight: 64, alignItems: 'center', gap: spacing.sm, paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: radii.lg, backgroundColor: TABLE.nightLight },
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
  // a tile is a paper card standing on its own edge, and goes down onto it when it is chosen
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
  yesNo: { alignSelf: 'stretch', gap: spacing.sm },
  answerEdge: { flex: 1, borderRadius: radii.lg, paddingBottom: 5 },
  answerFace: { minHeight: 68, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radii.lg },
  answerText: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: ON_ANSWER },

  verdict: { alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radii.xl },
  verdictHeading: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, textAlign: 'center' },
  verdictSays: { alignItems: 'center', gap: 2 },
  verdictLabel: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 0.8, textTransform: 'uppercase', textAlign: 'center' },
  verdictWord: { fontSize: 44, lineHeight: 54, fontWeight: typography.weights.bold, textAlign: 'center' },
  verdictNote: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, textAlign: 'center' },
  verdictRows: { alignSelf: 'stretch', gap: spacing.xs },
  verdictRow: { minHeight: 40, alignItems: 'center', gap: spacing.sm, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.md },
  verdictName: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  verdictSaid: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  verdictMark: { alignItems: 'center', gap: 4 },
  verdictMarkText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },

  fold: { borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  // laid bare, only the title is a surface: what opens under it sits on the page like the rows round it
  foldBare: { gap: spacing.sm },
  foldHeadBare: { borderRadius: radii.lg, paddingHorizontal: spacing.md },
  foldHead: { minHeight: MIN_TOUCH_TARGET, alignItems: 'center', gap: spacing.sm },
  foldTitle: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  foldBody: { gap: spacing.xs, paddingBottom: spacing.sm },
  scoringLine: { fontSize: typography.sizes.sm, lineHeight: 21 },
  turned: { transform: [{ rotate: '180deg' }] },
});
