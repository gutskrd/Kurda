/**
 * What a shared win's card says under its picture, in the sender's language (the link names it, win-link.ts): a title
 * with the news in it, said with some cheer, and a line asking the friend to join in. The website's edge script writes
 * these into a link's preview, and the page the link opens shows the same words. They say what was done, never who did
 * it. Only the language list, the leagues' names and the link's types are imported, none of which carries the rest of the
 * package, so the edge script can carry this file.
 */
import { LEAGUE_TIER_META } from './leagues.js';
import { DEFAULT_LOCALE, type AppLocale } from './locales.js';
import type { WinLeague, WinLink } from './win-link.js';

interface CardWords {
  lesson: string;
  /** `{days}` in a row, said only from two days up */
  streak: string;
  /** a streak whose link does not say its days */
  streakPlain: string;
  badge: string;
  /** a good week in the `{tier}` League: a promotion or a podium place, which the link does not tell apart */
  league: string;
  leaguePlain: string;
  /** the day's word found, in `{score}` ("4/6") */
  peyvok: string;
  peyvokLost: string;
  /** a practice word found, in `{score}` */
  practice: string;
  practiceLost: string;
  /** a word game whose link does not say how it went */
  peyvokPlain: string;
  /** the line under a lesson, streak, badge or league */
  learn: string;
  /** the line under a word game */
  play: string;
}

/** The words in each language, written for it rather than from English. The word game keeps its own name in all but Soranî, which writes it in its own script. */
const WORDS: Record<AppLocale, CardWords> = {
  en: {
    lesson: 'Just finished a Kurdish lesson! Come learn with me',
    streak: '{days} days of Kurdish in a row, and still going!',
    streakPlain: 'A Kurdish streak, still burning!',
    badge: 'Just earned a new badge on Hevalo!',
    league: 'A big week in the {tier} League!',
    leaguePlain: 'A big week in the league!',
    peyvok: 'Solved today’s Peyvok in {score}! Can you beat it?',
    peyvokLost: 'Today’s Peyvok won this round. Can you crack it?',
    practice: 'Solved a Peyvok in {score}! Can you beat it?',
    practiceLost: 'A Peyvok won this round. Can you crack today’s?',
    peyvokPlain: 'Peyvok: the day’s Kurdish word',
    learn: 'Kurdish a few minutes a day, with games and friends. Come and join in on Hevalo.',
    play: 'Six tries to find the day’s Kurdish word. Play it on Hevalo.',
  },
  ku: {
    lesson: 'Min nû waneyeke kurdî qedand! Were bi min re hîn bibe',
    streak: '{days} roj li pey hev bi kurdî, û hê jî didome!',
    streakPlain: 'Rêzeya kurdî hê jî dişewite!',
    badge: 'Min li ser Hevalo nîşaneke nû bi dest xist!',
    league: 'Hefteyeke mezin di Lîga {tier} de!',
    leaguePlain: 'Hefteyeke mezin di lîgê de!',
    peyvok: 'Min Peyvoka îro bi {score} çareser kir! Tu dikarî baştir bikî?',
    peyvokLost: 'Vê carê Peyvoka îro bi ser ket. Tu dikarî çareser bikî?',
    practice: 'Min Peyvokek bi {score} çareser kir! Tu dikarî baştir bikî?',
    practiceLost: 'Vê carê Peyvokek bi ser ket. Tu ya îro çareser dikî?',
    peyvokPlain: 'Peyvok: peyva kurdî ya rojê',
    learn: 'Rojê çend deqe kurdî, bi lîstik û hevalan. Li ser Hevalo tevlî me bibe.',
    play: 'Di şeş ceribandinan de peyva kurdî ya rojê bibîne. Li ser Hevalo bilîze.',
  },
  ckb: {
    lesson: 'ئێستا وانەیەکی کوردیم تەواو کرد! وەرە لەگەڵم فێربە',
    streak: '{days} ڕۆژ لەسەریەک بە کوردی، و هێشتا بەردەوامە!',
    streakPlain: 'زنجیرەی کوردی هێشتا نەپچڕاوە!',
    badge: 'لە Hevalo نیشانەیەکی نوێم بەدەستهێنا!',
    league: 'هەفتەیەکی گەورە لە لیگی {tier}!',
    leaguePlain: 'هەفتەیەکی گەورە لە لیگدا!',
    peyvok: 'پەیڤۆکی ئەمڕۆم بە {score} چارەسەر کرد! دەتوانیت باشتر بیت؟',
    peyvokLost: 'ئەمجارە پەیڤۆکی ئەمڕۆ بردییەوە. تۆ دەتوانیت چارەسەری بکەیت؟',
    practice: 'پەیڤۆکێکم بە {score} چارەسەر کرد! دەتوانیت باشتر بیت؟',
    practiceLost: 'ئەمجارە پەیڤۆکێک بردییەوە. تۆ هی ئەمڕۆ چارەسەر دەکەیت؟',
    peyvokPlain: 'پەیڤۆک: وشەی کوردیی ڕۆژ',
    learn: 'ڕۆژانە چەند خولەکێک کوردی، لەگەڵ یاری و هاوڕێ. لە Hevalo بەشداربە.',
    play: 'بە شەش هەوڵ وشەی کوردیی ڕۆژ بدۆزەرەوە. لە Hevalo یاری بکە.',
  },
  de: {
    lesson: 'Gerade eine Kurdisch-Lektion geschafft! Lern mit mir',
    streak: '{days} Tage Kurdisch am Stück, und es geht weiter!',
    streakPlain: 'Eine Kurdisch-Serie, die weiterbrennt!',
    badge: 'Gerade ein neues Abzeichen auf Hevalo geholt!',
    league: 'Eine starke Woche in der {tier}-Liga!',
    leaguePlain: 'Eine starke Woche in der Liga!',
    peyvok: 'Das heutige Peyvok in {score} gelöst! Schaffst du das?',
    peyvokLost: 'Heute hat das Peyvok gewonnen. Knackst du es?',
    practice: 'Ein Peyvok in {score} gelöst! Schaffst du das?',
    practiceLost: 'Diesmal hat das Peyvok gewonnen. Knackst du das heutige?',
    peyvokPlain: 'Peyvok: das kurdische Wort des Tages',
    learn: 'Jeden Tag ein paar Minuten Kurdisch, mit Spielen und Freunden. Mach mit auf Hevalo.',
    play: 'Sechs Versuche für das kurdische Wort des Tages. Spiel mit auf Hevalo.',
  },
  es: {
    lesson: '¡Otra lección de kurdo terminada! Aprende conmigo',
    streak: '¡{days} días seguidos de kurdo, y la racha sigue!',
    streakPlain: '¡Una racha de kurdo que sigue encendida!',
    badge: '¡Una nueva insignia conseguida en Hevalo!',
    league: '¡Una gran semana en la Liga {tier}!',
    leaguePlain: '¡Una gran semana en la liga!',
    peyvok: '¡El Peyvok de hoy, resuelto en {score}! ¿Lo superas?',
    peyvokLost: 'Hoy ganó el Peyvok. ¿Lo resuelves tú?',
    practice: '¡Un Peyvok resuelto en {score}! ¿Lo superas?',
    practiceLost: 'Esta vez ganó el Peyvok. ¿Resuelves el de hoy?',
    peyvokPlain: 'Peyvok: la palabra kurda del día',
    learn: 'Kurdo unos minutos al día, con juegos y amigos. Únete en Hevalo.',
    play: 'Seis intentos para encontrar la palabra kurda del día. Juega en Hevalo.',
  },
  fr: {
    lesson: 'Une leçon de kurde de plus ! Viens apprendre avec moi',
    streak: '{days} jours de kurde d’affilée, et ça continue !',
    streakPlain: 'Une série de kurde qui brûle encore !',
    badge: 'Un nouveau badge gagné sur Hevalo !',
    league: 'Une super semaine en Ligue {tier} !',
    leaguePlain: 'Une super semaine en ligue !',
    peyvok: 'Peyvok du jour résolu en {score} ! Tu fais mieux ?',
    peyvokLost: 'Le Peyvok du jour a gagné cette fois. Tu le trouves ?',
    practice: 'Un Peyvok résolu en {score} ! Tu fais mieux ?',
    practiceLost: 'Ce Peyvok a gagné cette fois. Tu trouves celui du jour ?',
    peyvokPlain: 'Peyvok : le mot kurde du jour',
    learn: 'Du kurde quelques minutes par jour, avec des jeux et des amis. Rejoins-nous sur Hevalo.',
    play: 'Six essais pour trouver le mot kurde du jour. Joue sur Hevalo.',
  },
  nl: {
    lesson: 'Weer een Koerdische les af! Leer met me mee',
    streak: '{days} dagen Koerdisch op rij, en het gaat door!',
    streakPlain: 'Een Koerdische reeks die blijft branden!',
    badge: 'Net een nieuwe badge verdiend op Hevalo!',
    league: 'Een topweek in Competitie {tier}!',
    leaguePlain: 'Een topweek in de competitie!',
    peyvok: 'De Peyvok van vandaag in {score} opgelost! Kun jij het beter?',
    peyvokLost: 'De Peyvok van vandaag won deze keer. Kraak jij hem?',
    practice: 'Een Peyvok in {score} opgelost! Kun jij het beter?',
    practiceLost: 'Deze keer won de Peyvok. Kraak jij die van vandaag?',
    peyvokPlain: 'Peyvok: het Koerdische woord van de dag',
    learn: 'Elke dag een paar minuten Koerdisch, met spellen en vrienden. Doe mee op Hevalo.',
    play: 'Zes pogingen om het Koerdische woord van de dag te vinden. Speel mee op Hevalo.',
  },
  tr: {
    lesson: 'Bir Kürtçe dersi daha bitti! Benimle öğren',
    streak: 'Üst üste {days} gün Kürtçe ve hâlâ devam!',
    streakPlain: 'Hâlâ yanan bir Kürtçe serisi!',
    badge: 'Hevalo’da yeni bir rozet kazandım!',
    league: '{tier} liginde harika bir hafta!',
    leaguePlain: 'Ligde harika bir hafta!',
    peyvok: 'Bugünün Peyvok’unu {score} denemede çözdüm! Beni geçer misin?',
    peyvokLost: 'Bugünün Peyvok’u bu sefer kazandı. Sen çözebilir misin?',
    practice: '{score} denemede bir Peyvok çözdüm! Beni geçer misin?',
    practiceLost: 'Bu sefer Peyvok kazandı. Bugünkünü sen çözer misin?',
    peyvokPlain: 'Peyvok: günün Kürtçe kelimesi',
    learn: 'Günde birkaç dakika Kürtçe, oyunlarla ve arkadaşlarla. Hevalo’da sen de katıl.',
    play: 'Günün Kürtçe kelimesini bulmak için altı deneme. Hevalo’da oyna.',
  },
  ar: {
    lesson: 'أنهيتُ للتوّ درسًا في الكردية! تعال وتعلّم معي',
    // "The Nth day in a row" keeps the count out of Arabic's plural forms.
    streak: 'اليوم {days} على التوالي مع الكردية، والمسيرة مستمرة!',
    streakPlain: 'سلسلة كردية ما زالت مشتعلة!',
    badge: 'نلتُ للتوّ شارة جديدة على Hevalo!',
    league: 'أسبوع رائع في دوري {tier}!',
    leaguePlain: 'أسبوع رائع في الدوري!',
    peyvok: 'حللتُ لغز Peyvok اليوم بنتيجة {score}! هل تتفوّق عليّ؟',
    peyvokLost: 'غلبني لغز Peyvok اليوم هذه المرة. هل تستطيع حلّه؟',
    practice: 'حللتُ لغز Peyvok بنتيجة {score}! هل تتفوّق عليّ؟',
    practiceLost: 'غلبني لغز Peyvok هذه المرة. هل تحلّ لغز اليوم؟',
    peyvokPlain: 'Peyvok: كلمة اليوم الكردية',
    learn: 'الكردية بضع دقائق يوميًا، مع ألعاب وأصدقاء. انضم إلينا على Hevalo.',
    play: 'ست محاولات لإيجاد الكلمة الكردية لهذا اليوم. العب على Hevalo.',
  },
};

/** The leagues as Soranî writes them, in its own script; every other language says the Kurmancî names. */
const SORANI_LEAGUES: Record<WinLeague, string> = { dilop: 'دڵۆپ', kani: 'کانی', cem: 'چەم', gol: 'گۆل', derya: 'دەریا', okyanus: 'ئۆقیانووس' };

/** A league's name as `locale` writes it. */
export function winLeagueName(tier: WinLeague, locale: AppLocale): string {
  return locale === 'ckb' ? SORANI_LEAGUES[tier] : LEAGUE_TIER_META[tier].nameKu;
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => vars[name] ?? whole);
}

/** What a win's card says, in `locale`: its title and the line under it. Counts are written in that language's own figures. */
export function winWords(win: WinLink, locale: AppLocale = DEFAULT_LOCALE): { title: string; description: string } {
  const words = WORDS[locale] ?? WORDS[DEFAULT_LOCALE];
  const n = (value: number): string => new Intl.NumberFormat(locale).format(value);
  switch (win.kind) {
    case 'lesson':
      return { title: words.lesson, description: words.learn };
    case 'streak':
      // One day is not yet a row of them.
      return { title: win.days !== null && win.days > 1 ? fill(words.streak, { days: n(win.days) }) : words.streakPlain, description: words.learn };
    case 'badge':
      return { title: words.badge, description: words.learn };
    case 'league':
      return { title: win.tier ? fill(words.league, { tier: winLeagueName(win.tier, locale) }) : words.leaguePlain, description: words.learn };
    case 'peyvok': {
      const result = win.result;
      if (!result) return { title: words.peyvokPlain, description: words.play };
      if (result.tries === null) return { title: result.practice ? words.practiceLost : words.peyvokLost, description: words.play };
      const score = `${n(result.tries)}/${n(result.of)}`;
      return { title: fill(result.practice ? words.practice : words.peyvok, { score }), description: words.play };
    }
  }
}
