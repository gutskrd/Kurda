/**
 * Hevalo's and Xezal's reaction lines: short everyday Kurmancî said at moments anywhere in the app (a run of right
 * answers, a miss, a lesson finished, the day's Zêr, the streak, a league promotion, a first day or a return). Each is
 * recorded once on the "Record by person" page, filed in `lesson_audio` under `reactionKey`, and the apps play one
 * recorded variant when its moment comes, in the voice of the character shown (`verdictVoice`, `REACTION_VOICE`).
 * Every Kurmancî line, and every meaning, needs a native speaker's check before it is recorded.
 */
import type { AppLocale } from './locales.js';
import { celebrationPlan } from './celebration.js';
import { lessonAudioKey } from './lesson-audio.js';
import { VERDICT_TIMING, runMilestone } from './lesson-player.js';
import type { RecordingVoice, SpeakerId } from './lipsync/speakers.js';
import type { StreakMood } from './lesson-end.js';

/** Hamo keeps his own lines: only these two react. */
export const REACTION_CHARACTERS = ['hevalo', 'xezo'] as const;
export type ReactionCharacter = (typeof REACTION_CHARACTERS)[number];

export function isReactionCharacter(v: unknown): v is ReactionCharacter {
  return v === 'hevalo' || v === 'xezo';
}

export const REACTION_MOMENTS = [
  'run-3',
  'run-5',
  'miss',
  'lesson-done',
  'perfect',
  'daily-zer',
  'streak-kept',
  'streak-best',
  'promoted',
  'first-day',
  'welcome-back',
] as const;
export type ReactionMoment = (typeof REACTION_MOMENTS)[number];

/** What a line means in each interface language but Kurmancî, whose readers have the line itself. */
export type ReactionMeaning = Readonly<Record<Exclude<AppLocale, 'ku'>, string>>;

export interface ReactionLine {
  /** unique for its character, and kept when the words change: `run-3-1` */
  id: string;
  character: ReactionCharacter;
  moment: ReactionMoment;
  /** what is said, in Kurmancî */
  ku: string;
  meaning: ReactionMeaning;
}

/** Each moment for the record page: its heading and what is happening when the line is said. */
export const REACTION_MOMENT_CUE: Readonly<Record<ReactionMoment, { title: string; cue: string }>> = {
  'run-3': { title: 'Three right in a row', cue: 'The learner has just got three answers right in a row. A quick, happy cheer.' },
  'run-5': { title: 'Five right in a row', cue: 'Five right answers in a row: a real streak inside the lesson. Proud and delighted.' },
  miss: { title: 'A gentle miss', cue: 'The learner got one wrong. Warm and light, never disappointed: it will come back.' },
  'lesson-done': { title: 'Lesson finished', cue: 'The lesson’s results have just opened. Pleased and a little playful.' },
  perfect: { title: 'A perfect lesson', cue: 'Every answer in the lesson was right first time. Thrilled.' },
  'daily-zer': { title: 'The day’s Zêr claimed', cue: 'The learner has just collected today’s gold coins (Zêr).' },
  'streak-kept': { title: 'Streak kept', cue: 'Another day of the streak kept, shown on the streak card. Steady and glad.' },
  'streak-best': { title: 'New best streak', cue: 'The streak is the longest the learner has ever had. Excited.' },
  promoted: { title: 'Moved up a league', cue: 'Last week moved the learner up to a new league. Celebrating.' },
  'first-day': { title: 'A first day', cue: 'The learner’s very first day: the first lesson is done. Welcoming.' },
  'welcome-back': { title: 'Welcome back', cue: 'The learner is back after some days away. Glad to see them, never reproachful.' },
};

/** What the learner knows each one as: the teacher is Xezal to everyone but her uncle. */
export const REACTION_NAMES: Readonly<Record<ReactionCharacter, string>> = { hevalo: 'Hevalo', xezo: 'Xezal' };

/** How each character says them, for the record page. */
export const REACTION_TONE: Readonly<Record<ReactionCharacter, string>> = {
  hevalo: 'A young deer: short, cheeky and warm, always thinking of apples.',
  xezo: 'The village teacher: bright and kind, pleased with her pupil.',
};

/** Who speaks a moment when no character is on screen: the line's caption shows their face. */
export const REACTION_VOICE: Readonly<Record<ReactionMoment, ReactionCharacter>> = {
  'run-3': 'hevalo',
  'run-5': 'hevalo',
  miss: 'hevalo',
  'lesson-done': 'hevalo',
  perfect: 'hevalo',
  'daily-zer': 'xezo',
  'streak-kept': 'hevalo',
  'streak-best': 'hevalo',
  promoted: 'xezo',
  'first-day': 'hevalo',
  'welcome-back': 'hevalo',
};

function line(character: ReactionCharacter, moment: ReactionMoment, n: number, ku: string, meaning: ReactionMeaning): ReactionLine {
  return { id: `${moment}-${n}`, character, moment, ku, meaning };
}

/** The whole catalogue, Hevalo's lines and then Xezal's, each moment's variants together. */
export const REACTION_LINES: readonly ReactionLine[] = [
  line('hevalo', 'run-3', 1, 'Aferîn!', { en: 'Well done!', ckb: 'ئافەرین!', nl: 'Goed zo!', de: 'Gut gemacht!', es: '¡Bien hecho!', fr: 'Bravo !', tr: 'Aferin!', ar: 'أحسنت!' }),
  line('hevalo', 'run-3', 2, 'Sê li pey hev!', { en: 'Three in a row!', ckb: 'سێ لە دوای یەک!', nl: 'Drie op een rij!', de: 'Drei hintereinander!', es: '¡Tres seguidas!', fr: 'Trois d’affilée !', tr: 'Üst üste üç!', ar: 'ثلاثة على التوالي!' }),
  line('hevalo', 'run-3', 3, 'Çi xweş e!', { en: 'How lovely!', ckb: 'چەند خۆشە!', nl: 'Wat fijn!', de: 'Wie schön!', es: '¡Qué bien!', fr: 'Que c’est bien !', tr: 'Ne güzel!', ar: 'ما أجمل هذا!' }),
  line('hevalo', 'run-5', 1, 'Pênc li pey hev!', { en: 'Five in a row!', ckb: 'پێنج لە دوای یەک!', nl: 'Vijf op een rij!', de: 'Fünf hintereinander!', es: '¡Cinco seguidas!', fr: 'Cinq d’affilée !', tr: 'Üst üste beş!', ar: 'خمسة على التوالي!' }),
  line('hevalo', 'run-5', 2, 'Tu çi zîrek î!', { en: 'How clever you are!', ckb: 'چەند زیرەکی!', nl: 'Wat ben jij slim!', de: 'Du bist so schlau!', es: '¡Qué inteligente eres!', fr: 'Quelle intelligence !', tr: 'Ne kadar zekisin!', ar: 'ما أروع ذكاءك!' }),
  line('hevalo', 'run-5', 3, 'Bijî!', { en: 'Hooray!', ckb: 'بژی!', nl: 'Hoera!', de: 'Hurra!', es: '¡Hurra!', fr: 'Hourra !', tr: 'Yaşasın!', ar: 'مرحى!' }),
  line('hevalo', 'miss', 1, 'Ne xem e!', { en: 'No worries!', ckb: 'خەم مەخۆ!', nl: 'Geeft niks!', de: 'Macht nichts!', es: '¡No pasa nada!', fr: 'Pas grave !', tr: 'Dert etme!', ar: 'لا بأس!' }),
  line('hevalo', 'miss', 2, 'Carek din!', { en: 'Once more!', ckb: 'جارێکی تر!', nl: 'Nog een keer!', de: 'Noch einmal!', es: '¡Otra vez!', fr: 'Encore une fois !', tr: 'Bir kez daha!', ar: 'مرة أخرى!' }),
  line('hevalo', 'miss', 3, 'Tu dikarî!', { en: 'You can do it!', ckb: 'تۆ دەتوانیت!', nl: 'Je kunt het!', de: 'Du schaffst das!', es: '¡Tú puedes!', fr: 'Tu peux le faire !', tr: 'Yapabilirsin!', ar: 'بإمكانك!' }),
  line('hevalo', 'miss', 4, 'Hêdî hêdî!', { en: 'Step by step!', ckb: 'هێدی هێدی!', nl: 'Stap voor stap!', de: 'Schritt für Schritt!', es: '¡Paso a paso!', fr: 'Pas à pas !', tr: 'Yavaş yavaş!', ar: 'خطوة خطوة!' }),
  line('hevalo', 'lesson-done', 1, 'Me qedand!', { en: 'We finished it!', ckb: 'تەواومان کرد!', nl: 'We zijn klaar!', de: 'Geschafft!', es: '¡Lo terminamos!', fr: 'On a fini !', tr: 'Bitirdik!', ar: 'أنهيناه!' }),
  line('hevalo', 'lesson-done', 2, 'Xilas! Aferîn!', { en: 'All done! Well done!', ckb: 'تەواو! ئافەرین!', nl: 'Klaar! Goed zo!', de: 'Fertig! Gut gemacht!', es: '¡Listo! ¡Bien hecho!', fr: 'Fini ! Bravo !', tr: 'Bitti! Aferin!', ar: 'انتهينا! أحسنت!' }),
  line('hevalo', 'lesson-done', 3, 'Niha dema sêvê ye!', { en: 'Now it’s apple time!', ckb: 'ئێستا کاتی سێوە!', nl: 'Nu is het appeltijd!', de: 'Jetzt ist Apfelzeit!', es: '¡Ahora toca manzana!', fr: 'C’est l’heure de la pomme !', tr: 'Şimdi elma zamanı!', ar: 'حان وقت التفاح!' }),
  line('hevalo', 'perfect', 1, 'Bê şaşî!', { en: 'Not one mistake!', ckb: 'بێ هەڵە!', nl: 'Zonder één fout!', de: 'Ohne einen Fehler!', es: '¡Sin un solo error!', fr: 'Sans une seule faute !', tr: 'Hiç hatasız!', ar: 'بلا أي خطأ!' }),
  line('hevalo', 'perfect', 2, 'Bêkêmasî!', { en: 'Perfect!', ckb: 'بێ کەموکوڕی!', nl: 'Perfect!', de: 'Perfekt!', es: '¡Perfecto!', fr: 'Parfait !', tr: 'Mükemmel!', ar: 'مثالي!' }),
  line('hevalo', 'perfect', 3, 'Sêv! Sêva min ku ye?', { en: 'An apple! Where’s my apple?', ckb: 'سێو! سێوەکەم لە کوێیە؟', nl: 'Een appel! Waar is mijn appel?', de: 'Ein Apfel! Wo ist mein Apfel?', es: '¡Una manzana! ¿Dónde está mi manzana?', fr: 'Une pomme ! Où est ma pomme ?', tr: 'Elma! Elmam nerede?', ar: 'تفاحة! أين تفاحتي؟' }),
  line('hevalo', 'streak-kept', 1, 'Îro jî!', { en: 'Today too!', ckb: 'ئەمڕۆش!', nl: 'Vandaag ook!', de: 'Heute auch!', es: '¡Hoy también!', fr: 'Aujourd’hui aussi !', tr: 'Bugün de!', ar: 'واليوم أيضًا!' }),
  line('hevalo', 'streak-kept', 2, 'Roj bi roj!', { en: 'Day by day!', ckb: 'ڕۆژ بە ڕۆژ!', nl: 'Dag na dag!', de: 'Tag für Tag!', es: '¡Día a día!', fr: 'Jour après jour !', tr: 'Gün be gün!', ar: 'يومًا بعد يوم!' }),
  line('hevalo', 'streak-kept', 3, 'Sibê jî were!', { en: 'Come tomorrow too!', ckb: 'سبەینێش وەرە!', nl: 'Kom morgen ook!', de: 'Komm morgen wieder!', es: '¡Vuelve mañana también!', fr: 'Reviens demain aussi !', tr: 'Yarın da gel!', ar: 'تعال غدًا أيضًا!' }),
  line('hevalo', 'streak-best', 1, 'Rekoreke nû!', { en: 'A new record!', ckb: 'ڕیکۆردێکی نوێ!', nl: 'Een nieuw record!', de: 'Ein neuer Rekord!', es: '¡Un nuevo récord!', fr: 'Un nouveau record !', tr: 'Yeni bir rekor!', ar: 'رقم قياسي جديد!' }),
  line('hevalo', 'streak-best', 2, 'Agir mezin dibe!', { en: 'The fire’s growing!', ckb: 'ئاگرەکە گەورە دەبێت!', nl: 'Het vuur groeit!', de: 'Das Feuer wächst!', es: '¡El fuego crece!', fr: 'Le feu grandit !', tr: 'Ateş büyüyor!', ar: 'النار تكبر!' }),
  line('hevalo', 'streak-best', 3, 'Ji berê dirêjtir!', { en: 'Longer than ever!', ckb: 'لە جاران درێژتر!', nl: 'Langer dan ooit!', de: 'Länger als je zuvor!', es: '¡Más larga que nunca!', fr: 'Plus longue que jamais !', tr: 'Hiç olmadığı kadar uzun!', ar: 'أطول من أي وقت مضى!' }),
  line('hevalo', 'first-day', 1, 'Bi xêr hatî!', { en: 'Welcome!', ckb: 'بەخێربێیت!', nl: 'Welkom!', de: 'Willkommen!', es: '¡Te doy la bienvenida!', fr: 'Bienvenue !', tr: 'Hoş geldin!', ar: 'أهلًا وسهلًا!' }),
  line('hevalo', 'first-day', 2, 'Ez Hevalo me!', { en: 'I’m Hevalo!', ckb: 'من Hevalo ـم!', nl: 'Ik ben Hevalo!', de: 'Ich bin Hevalo!', es: '¡Soy Hevalo!', fr: 'Je suis Hevalo !', tr: 'Ben Hevalo!', ar: 'أنا Hevalo!' }),
  line('hevalo', 'first-day', 3, 'Were, em herin!', { en: 'Come on, let’s go!', ckb: 'وەرە، با بڕۆین!', nl: 'Kom, we gaan!', de: 'Komm, los geht’s!', es: '¡Ven, vamos!', fr: 'Viens, on y va !', tr: 'Gel, gidelim!', ar: 'هيا بنا!' }),
  line('hevalo', 'welcome-back', 1, 'Tu vegeriyayî!', { en: 'You’re back!', ckb: 'گەڕایتەوە!', nl: 'Je bent terug!', de: 'Du bist zurück!', es: '¡Has vuelto!', fr: 'Te revoilà !', tr: 'Geri döndün!', ar: 'لقد عدت!' }),
  line('hevalo', 'welcome-back', 2, 'Min bêriya te kiribû!', { en: 'I missed you!', ckb: 'بیرم کردبوویت!', nl: 'Ik heb je gemist!', de: 'Ich hab dich vermisst!', es: '¡Te eché de menos!', fr: 'Tu m’as manqué !', tr: 'Seni özledim!', ar: 'اشتقت إليك!' }),
  line('hevalo', 'welcome-back', 3, 'Dîsa bi xêr hatî!', { en: 'Welcome back!', ckb: 'دیسان بەخێربێیتەوە!', nl: 'Welkom terug!', de: 'Willkommen zurück!', es: '¡Qué bien verte otra vez!', fr: 'Bon retour !', tr: 'Tekrar hoş geldin!', ar: 'أهلًا بعودتك!' }),

  line('xezo', 'run-3', 1, 'Pir baş e!', { en: 'Very good!', ckb: 'زۆر باشە!', nl: 'Heel goed!', de: 'Sehr gut!', es: '¡Muy bien!', fr: 'Très bien !', tr: 'Çok iyi!', ar: 'جيد جدًا!' }),
  line('xezo', 'run-3', 2, 'Berdewam be!', { en: 'Keep it up!', ckb: 'بەردەوام بە!', nl: 'Ga zo door!', de: 'Weiter so!', es: '¡Sigue así!', fr: 'Continue comme ça !', tr: 'Böyle devam!', ar: 'إلى الأمام!' }),
  line('xezo', 'run-5', 1, 'Pênc ji pêncan!', { en: 'Five out of five!', ckb: 'پێنج لە پێنج!', nl: 'Vijf op vijf!', de: 'Fünf von fünf!', es: '¡Cinco de cinco!', fr: 'Cinq sur cinq !', tr: 'Beşte beş!', ar: 'خمسة من خمسة!' }),
  line('xezo', 'run-5', 2, 'Tu hîn dibî!', { en: 'You’re learning!', ckb: 'فێر دەبیت!', nl: 'Je leert het!', de: 'Du lernst es!', es: '¡Estás aprendiendo!', fr: 'Tu apprends !', tr: 'Öğreniyorsun!', ar: 'أنت تتعلّم!' }),
  line('xezo', 'miss', 1, 'Şaşî jî hînbûn e.', { en: 'Mistakes are learning too.', ckb: 'هەڵەش فێربوونە.', nl: 'Ook van fouten leer je.', de: 'Auch Fehler gehören zum Lernen.', es: 'Los errores también enseñan.', fr: 'Les erreurs aussi font apprendre.', tr: 'Hatalar da öğrenmektir.', ar: 'الأخطاء جزء من التعلّم.' }),
  line('xezo', 'miss', 2, 'Ne xem e, carek din.', { en: 'No worries, once more.', ckb: 'خەم مەخۆ، جارێکی تر.', nl: 'Geeft niks, nog een keer.', de: 'Macht nichts, noch einmal.', es: 'No pasa nada, otra vez.', fr: 'Pas grave, encore une fois.', tr: 'Dert etme, bir kez daha.', ar: 'لا بأس، مرة أخرى.' }),
  line('xezo', 'daily-zer', 1, 'Ji te re zêr!', { en: 'Gold for you!', ckb: 'زێڕ بۆ تۆ!', nl: 'Goud voor jou!', de: 'Gold für dich!', es: '¡Oro para ti!', fr: 'De l’or pour toi !', tr: 'Sana altın!', ar: 'ذهب لك!' }),
  line('xezo', 'daily-zer', 2, 'Ev zêr yê te ye!', { en: 'This gold is yours!', ckb: 'ئەم زێڕە هی تۆیە!', nl: 'Dit goud is van jou!', de: 'Dieses Gold gehört dir!', es: '¡Este oro es tuyo!', fr: 'Cet or est à toi !', tr: 'Bu altın senin!', ar: 'هذا الذهب لك!' }),
  line('xezo', 'daily-zer', 3, 'Îro jî zêr!', { en: 'Gold again today!', ckb: 'ئەمڕۆش زێڕ!', nl: 'Vandaag weer goud!', de: 'Heute wieder Gold!', es: '¡Hoy también hay oro!', fr: 'De l’or aujourd’hui aussi !', tr: 'Bugün de altın!', ar: 'ذهب اليوم أيضًا!' }),
  line('xezo', 'promoted', 1, 'Pîroz be!', { en: 'Congratulations!', ckb: 'پیرۆز بێت!', nl: 'Gefeliciteerd!', de: 'Herzlichen Glückwunsch!', es: '¡Enhorabuena!', fr: 'Félicitations !', tr: 'Tebrikler!', ar: 'مبروك!' }),
  line('xezo', 'promoted', 2, 'Lîgeke nû, pîroz be!', { en: 'A new league, congratulations!', ckb: 'لیگێکی نوێ، پیرۆز بێت!', nl: 'Een nieuwe divisie, gefeliciteerd!', de: 'Eine neue Liga, Glückwunsch!', es: '¡Una liga nueva, enhorabuena!', fr: 'Une nouvelle ligue, félicitations !', tr: 'Yeni bir lig, tebrikler!', ar: 'دوري جديد، مبروك!' }),
  line('xezo', 'promoted', 3, 'Tu derketî jor!', { en: 'You’ve moved up!', ckb: 'چوویتە سەرەوە!', nl: 'Je bent gestegen!', de: 'Du bist aufgestiegen!', es: '¡Has subido!', fr: 'Tu passes au niveau supérieur !', tr: 'Yükseldin!', ar: 'لقد صعدت!' }),
];

const BY_KEY = new Map(REACTION_LINES.map((l) => [`${l.character}:${l.id}`, l]));

/** One line of the catalogue, by its character and id. */
export function reactionLine(character: string, id: string): ReactionLine | null {
  return BY_KEY.get(`${character}:${id}`) ?? null;
}

/** What a line means to a reader of `locale`: Kurmancî readers have the line itself. */
export function reactionMeaning(l: Pick<ReactionLine, 'ku' | 'meaning'>, locale: AppLocale): string {
  return locale === 'ku' ? l.ku : l.meaning[locale];
}

/** Starts every reaction take's key; a colon is in no conversation id, and a plain text's key has no word joiner. */
const PREFIX = 'reaction:';
/** The word joiner, which `lessonAudioKey` removes, between the line and its words. */
const JOIN = '⁠';

/**
 * The key a reaction's take is filed under: its character and id, so two characters' "Aferîn!" are two takes, then
 * its words keyed as any recording's, so a take of words since changed is not played for the new ones.
 */
export function reactionKey(l: Pick<ReactionLine, 'character' | 'id' | 'ku'>): string {
  return `${PREFIX}${l.character}:${l.id}${JOIN}${lessonAudioKey(l.ku)}`;
}

export function isReactionKey(key: string): boolean {
  return key.startsWith(PREFIX);
}

/** GET /reactions: every recorded reaction of the catalogue as it stands, by character and id. */
export interface ReactionTake {
  character: ReactionCharacter;
  id: string;
  src: string;
  voice: RecordingVoice | null;
}

export interface ReactionTakes {
  takes: ReactionTake[];
}

/** A take with its line, as the apps play and caption it. */
export interface ReactionClip extends ReactionTake {
  line: ReactionLine;
}

/**
 * One recorded variant of `character`'s lines for `moment`, at random but never `last` when there is another, or null
 * when none is recorded. Takes the catalogue no longer has are passed over.
 */
export function pickReaction(
  takes: readonly ReactionTake[],
  moment: ReactionMoment,
  character: ReactionCharacter,
  last: string | null = null,
  random: () => number = Math.random,
): ReactionClip | null {
  const clips = takes.flatMap((t) => {
    const l = t.character === character ? reactionLine(t.character, t.id) : null;
    return l && l.moment === moment ? [{ ...t, line: l }] : [];
  });
  const fresh = clips.length > 1 ? clips.filter((c) => c.id !== last) : clips;
  if (fresh.length === 0) return null;
  return fresh[Math.min(fresh.length - 1, Math.floor(random() * fresh.length))]!;
}

/** The least time between any two reactions, so two moments close together are not both said. */
export const REACTION_GAP_MS = 3000;

/** How long a moment stays quiet once said: a lesson's own moments about a lesson's length, the others a moment. */
export const REACTION_REST_MS: Readonly<Record<ReactionMoment, number>> = {
  'run-3': 15 * 60_000,
  'run-5': 15 * 60_000,
  miss: 15 * 60_000,
  'lesson-done': 20_000,
  perfect: 20_000,
  'daily-zer': 20_000,
  'streak-kept': 20_000,
  'streak-best': 20_000,
  promoted: 20_000,
  'first-day': 20_000,
  'welcome-back': 20_000,
};

/** Whether a reaction may be heard now: at most once per moment while it rests, and never right after another. */
export interface ReactionGate {
  allow(moment: ReactionMoment, now: number): boolean;
  /** Marks a moment as said at `now`. */
  said(moment: ReactionMoment, now: number): void;
}

export function createReactionGate(): ReactionGate {
  const last = new Map<ReactionMoment, number>();
  let any = -Infinity;
  return {
    allow: (moment, now) => now - any >= REACTION_GAP_MS && now - (last.get(moment) ?? -Infinity) >= REACTION_REST_MS[moment],
    said: (moment, now) => {
      last.set(moment, now);
      any = now;
    },
  };
}

/**
 * When a reaction is heard, in ms after its moment: after a verdict's chime, in the slot a model recording would take
 * (`VERDICT_TIMING.modelAtMs`), or once a celebration's words have landed (`celebrationPlan`).
 */
export function reactionDelayMs(at: 'verdict' | 'celebration', reduce: boolean): number {
  if (at === 'verdict') return VERDICT_TIMING.modelAtMs;
  const plan = celebrationPlan(reduce);
  return plan.detailsDelayMs + plan.detailsMs;
}

/** How long a caption stays after its line ends. */
export const REACTION_CAPTION_AFTER_MS = 1200;

/**
 * A verdict's line waits for the answer's own recording to finish, then this beat, before it is said; it waits no
 * longer than `REACTION_AUDIO_WAIT_MS` in all.
 */
export const REACTION_AFTER_AUDIO_MS = 300;
export const REACTION_AUDIO_WAIT_MS = 8000;

/** A verdict's moment: a miss, three in a row, or a run milestone (five, ten…); a spoken answer is the learner's own rating. */
export function verdictMoment({ accepted, spoken, run, before }: { accepted: boolean; spoken: boolean; run: number; before: number }): ReactionMoment | null {
  if (spoken) return null;
  if (!accepted) return 'miss';
  if (run <= before) return null;
  if (run === 3) return 'run-3';
  return runMilestone(run) !== null ? 'run-5' : null;
}

/**
 * Who reacts to a verdict, and whether they are drawn there: the character beside it (Hamo has no reactions, so then
 * nobody), Hevalo when nobody is shown at all, and nobody while another character is on the exercise's stage. A voice
 * never comes from a character other than the one on screen.
 */
export function verdictVoice({
  shown,
  staged,
}: {
  /** the character drawn beside the verdict */
  shown: SpeakerId | null;
  /** a character is on the exercise's own stage above it */
  staged: boolean;
}): { character: ReactionCharacter; drawn: boolean } | null {
  if (shown) return isReactionCharacter(shown) ? { character: shown, drawn: true } : null;
  return staged ? null : { character: 'hevalo', drawn: false };
}

/** The end of a lesson: perfect, or simply done. */
export function endMoment(perfect: boolean): ReactionMoment {
  return perfect ? 'perfect' : 'lesson-done';
}

/** The streak card's moment by its mood (shared `streakMood`): a first day, a return, a new best, or another day kept. */
export function streakMoment(mood: StreakMood): ReactionMoment {
  return mood === 'start' ? 'first-day' : mood === 'comeback' ? 'welcome-back' : mood === 'best' ? 'streak-best' : 'streak-kept';
}
