/**
 * Pure streak-reminder timing (KUR-096). Decides, for one user at one moment,
 * whether to nudge them and with which reminder — evaluated against their LOCAL
 * hour so a global spread of timezones each gets its reminder at the right local
 * time. The job runs hourly and only users whose local hour matches fire.
 */
import { isAppLocale, type AppLocale } from '@kurda/shared';

/** Default send hour when we have no practice history for a user. */
export const FALLBACK_HOUR = 19; // 7pm local
export const LAST_CHANCE_HOUR = 22; // 2h before local midnight
export const LAST_CHANCE_MIN_STREAK = 7;

export type ReminderKind = 'primary' | 'last_chance';

export interface ReminderContext {
  currentStreak: number;
  practicedToday: boolean;
  /** 0-23 in the user's timezone. */
  localHour: number;
  /** The user's most common practice hour (0-23), or null if unknown. */
  historicalHour: number | null;
}

/** Where the primary reminder fires: the historical practice hour, else 19:00. */
export function preferredHour(historicalHour: number | null): number {
  if (historicalHour === null || historicalHour < 0 || historicalHour > 23) return FALLBACK_HOUR;
  return historicalHour;
}

/**
 * The reminder to send right now, or null. Never fires if the user already
 * practiced today or has no live streak. A later nudge at 22:00 (for streaks
 * ≥ 7, still called `last_chance` in the send log) takes precedence over the
 * primary reminder if they coincide.
 */
export function dueReminder(ctx: ReminderContext): ReminderKind | null {
  if (ctx.practicedToday) return null;
  if (ctx.currentStreak < 1) return null;
  if (ctx.currentStreak >= LAST_CHANCE_MIN_STREAK && ctx.localHour === LAST_CHANCE_HOUR) {
    return 'last_chance';
  }
  if (ctx.localHour === preferredHour(ctx.historicalHour)) return 'primary';
  return null;
}

export interface ReminderMessage {
  title: string;
  body: string;
}

interface ReminderCopy {
  primary: (days: number) => ReminderMessage;
  lastChance: ReminderMessage;
}

/**
 * The copy, in every language the app speaks.
 *
 * An invitation, not a warning. This used to read "Don't lose your streak!"
 * and "Last chance!", in English to everyone, which frames a day off as a loss
 * and leans on guilt — the pattern the roadmap in docs/research asks us to
 * drop, for learners of every age. So it says what has been done and how
 * little today needs, and nothing about what could be lost.
 *
 * Where a language changes the noun with the number, the sentence either picks
 * the form (English, German, French, Spanish, Dutch) or is built so the number
 * stands alone (Arabic); Kurmancî, Soranî and Turkish keep the singular after a
 * number anyway.
 */
const REMINDER_COPY: Record<AppLocale, ReminderCopy> = {
  en: {
    primary: (n) => ({
      title: 'A few minutes of Kurdish?',
      body: `You have learned ${n} ${n === 1 ? 'day' : 'days'} in a row. One short lesson or practice counts for today.`,
    }),
    lastChance: {
      title: 'There is still time today',
      body: 'A short practice before midnight counts for today.',
    },
  },
  ku: {
    primary: (n) => ({
      title: 'Çend deqîqe bi kurdî?',
      body: `Te ${n} roj li pey hev kurdî xwend. Dersek an temrînek kurt ji bo îro bes e.`,
    }),
    lastChance: {
      title: 'Îro hê dem heye',
      body: 'Temrînek kurt berî nîvê şevê ji bo îro tê hesibandin.',
    },
  },
  ckb: {
    primary: (n) => ({
      title: 'چەند خولەکێک بە کوردی؟',
      body: `${n} ڕۆژ لەسەر یەک کوردیت خوێندووە. وانەیەک یان ڕاهێنانێکی کورت بۆ ئەمڕۆ بەسە.`,
    }),
    lastChance: {
      title: 'ئەمڕۆ هێشتا کات هەیە',
      body: 'ڕاهێنانێکی کورت پێش نیوەشەو بۆ ئەمڕۆ هەژمار دەکرێت.',
    },
  },
  ar: {
    primary: (n) => ({
      title: 'بضع دقائق من الكردية؟',
      body: `أيام التعلّم المتتالية: ${n}. درس قصير أو تمرين واحد يكفي لليوم.`,
    }),
    lastChance: {
      title: 'ما زال هناك وقت اليوم',
      body: 'تمرين قصير قبل منتصف الليل يُحتسب لليوم.',
    },
  },
  tr: {
    primary: (n) => ({
      title: 'Birkaç dakika Kürtçe?',
      body: `${n} gündür üst üste öğreniyorsun. Kısa bir ders ya da alıştırma bugün için yeterli.`,
    }),
    lastChance: {
      title: 'Bugün için hâlâ vakit var',
      body: 'Gece yarısından önce kısa bir alıştırma bugüne sayılır.',
    },
  },
  de: {
    primary: (n) => ({
      title: 'Ein paar Minuten Kurdisch?',
      body: `Du hast ${n} ${n === 1 ? 'Tag' : 'Tage'} in Folge gelernt. Eine kurze Lektion oder Übung zählt für heute.`,
    }),
    lastChance: {
      title: 'Heute ist noch Zeit',
      body: 'Eine kurze Übung vor Mitternacht zählt für heute.',
    },
  },
  fr: {
    primary: (n) => ({
      title: 'Quelques minutes de kurde ?',
      body: `Tu as appris ${n} ${n === 1 ? 'jour' : 'jours'} d’affilée. Une courte leçon ou un exercice compte pour aujourd’hui.`,
    }),
    lastChance: {
      title: 'Il reste du temps aujourd’hui',
      body: 'Un court exercice avant minuit compte pour aujourd’hui.',
    },
  },
  es: {
    primary: (n) => ({
      title: '¿Unos minutos de kurdo?',
      body: `Llevas ${n} ${n === 1 ? 'día seguido' : 'días seguidos'} aprendiendo. Una lección corta o una práctica cuenta para hoy.`,
    }),
    lastChance: {
      title: 'Todavía hay tiempo hoy',
      body: 'Una práctica corta antes de medianoche cuenta para hoy.',
    },
  },
  nl: {
    primary: (n) => ({
      title: 'Een paar minuten Koerdisch?',
      body: `Je hebt ${n} ${n === 1 ? 'dag' : 'dagen'} op rij geleerd. Een korte les of oefening telt voor vandaag.`,
    }),
    lastChance: {
      title: 'Er is vandaag nog tijd',
      body: 'Een korte oefening voor middernacht telt voor vandaag.',
    },
  },
};

/**
 * Copy for each reminder kind, in the account's own language — the one it
 * chose in the app. Anything the app does not speak gets English rather than
 * nothing.
 */
export function reminderMessage(kind: ReminderKind, streak: number, locale?: string | null): ReminderMessage {
  const copy = REMINDER_COPY[isAppLocale(locale) ? locale : 'en'];
  return kind === 'last_chance' ? { ...copy.lastChance } : copy.primary(streak);
}
