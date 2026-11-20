import type pg from 'pg';
import { reportCategoryInfo, type BanContentChoice, type ReportCategory, type SanctionKind, type SanctionOrigin } from '@kurda/shared';
import { isPlaceholderAddress } from '../email/service.js';
import { emailLocaleFor, type EmailLocale } from '../email/templates.js';
import { contentSentence, formatUtc } from './notices.js';
import type { BanMailer } from './sanctions-service.js';

/**
 * The emailed statement of reasons for a suspension or ban (templates `account-suspended` and `account-closed`): the
 * moderator's words, the rule, until when, what happens to what they shared, how it came about and how to ask for a
 * review, in the reader's language. The sanctions outbox sends each once (sanctions-service.ts `sendNoticeEmails`).
 */

/** The rules as the Kurmancî apps name them (web/src/i18n/ku.ts `report.category.*`). */
const RULE_KU: Readonly<Record<string, string>> = {
  'report.category.childSafety': 'Zarokek dikeve metirsiyê',
  'report.category.selfHarm': 'Dibe ku yek xwe biêşîne',
  'report.category.violence': 'Gefên tundiyê',
  'report.category.sexual': 'Naveroka seksî an tazî',
  'report.category.hate': 'Kîn',
  'report.category.privateInfo': 'Parvekirina agahiyên taybet',
  'report.category.harassment': 'Zordarî an tengavkirin',
  'report.category.spam': 'Xapandin an spam',
  'report.category.copyright': 'Karê kesekî din kopî dike',
  'report.category.impersonation': 'Xwe wek yekî din nîşan dide',
  'report.category.other': 'Tiştekî din',
};

function ruleIn(policy: ReportCategory, locale: EmailLocale): string {
  const info = reportCategoryInfo(policy);
  return locale === 'ku' ? (RULE_KU[info.labelKey] ?? info.label) : info.label;
}

/** "14.12.2026, 18:00 UTC": a time every reader reads alike. */
function untilIn(at: Date, locale: EmailLocale): string {
  if (locale === 'en') return formatUtc(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(at.getUTCDate())}.${pad(at.getUTCMonth() + 1)}.${at.getUTCFullYear()}, ${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())} UTC`;
}

const CONTENT_KU: Record<BanContentChoice, (suspension: boolean) => string> = {
  keep: () => 'Tiştên ku te parve kirine dimînin, wek yên hesabekî ku ne berdest e tên nîşandan.',
  hide: (suspension) =>
    suspension ? 'Şandî, şîrove, wêne û profîla te heta dawiya rawestandinê ji her kesî tên veşartin.' : 'Şandî, şîrove, wêne û profîla te ji her kesî tên veşartin.',
  remove: () => 'Şandî, şîrove, wêne û profîla te hatin rakirin. Ew şeş mehan bi taybetî tên parastin, heke tu daxwaza nirxandinê bikî, paşê bi tevahî tên jêbirin.',
};
const MESSAGES_KU = ' Peyamên te yên taybet jî wek rakirî tên nîşandan.';

function contentIn(kind: SanctionKind, content: { choice: BanContentChoice; includeMessages: boolean }, locale: EmailLocale): string {
  if (locale === 'en') return contentSentence(kind, content) ?? '';
  return CONTENT_KU[content.choice](kind === 'suspension') + (content.includeMessages && content.choice !== 'keep' ? MESSAGES_KU : '');
}

function reviewIn(origin: SanctionOrigin, reviewed: boolean, locale: EmailLocale): string {
  if (locale === 'en') {
    const source =
      origin === 'report' ? 'This came from a report by another member' : origin === 'automatic' ? 'This came from our automatic checks' : 'This came from a Hevalo moderator';
    return reviewed ? `${source}, and a person reviewed it.` : `${source}. No person has reviewed it yet.`;
  }
  const source = origin === 'report' ? 'Ev ji raporeke endamekî din hat' : origin === 'automatic' ? 'Ev ji kontrolên me yên otomatîk hat' : 'Ev ji moderatorekî Hevalo hat';
  return reviewed ? `${source}, û kesekî lê nêrî.` : `${source}. Hê tu kesî lê nenêriye.`;
}

export interface BanEmailFacts {
  kind: SanctionKind;
  policy: ReportCategory;
  statement: string;
  endsAt: Date | null;
  origin: SanctionOrigin;
  reviewedByPerson: boolean;
  username: string;
  content: { choice: BanContentChoice; includeMessages: boolean };
}

/** The template and its words for one ban, in one language. Pure. */
export function banEmail(facts: BanEmailFacts, locale: EmailLocale, link: string): { template: 'account-suspended' | 'account-closed'; vars: Record<string, string> } {
  const suspended = facts.kind === 'suspension' && facts.endsAt !== null;
  return {
    template: suspended ? 'account-suspended' : 'account-closed',
    vars: {
      username: facts.username,
      // one paragraph in the email, however it was typed
      statement: facts.statement.replace(/\s+/g, ' ').trim(),
      until: facts.endsAt ? untilIn(facts.endsAt, locale) : '',
      rule: ruleIn(facts.policy, locale),
      content: contentIn(facts.kind, facts.content, locale),
      review: reviewIn(facts.origin, facts.reviewedByPerson, locale),
      link,
    },
  };
}

export type SendEmail = (to: string, template: 'account-suspended' | 'account-closed', vars: Record<string, string>, locale: EmailLocale) => Promise<void>;

/** The outbox's mailer: reads the ban, its person and what happened to their content, and sends; nothing for a placeholder address. */
export function banMailer(pool: pg.Pool, send: SendEmail, webBaseUrl: string): BanMailer {
  return {
    async send(sanctionId) {
      const r = await pool.query<{
        kind: SanctionKind; policy: ReportCategory; statement: string; ends_at: Date | null; origin: SanctionOrigin;
        created_by: string | null; approved_by: string | null; email: string | null; username: string; locale: string | null;
        guest: boolean; deleted_at: Date | null; choice: 'hide' | 'remove' | null; include_messages: boolean | null;
      }>(
        `SELECT s.kind, s.policy, s.statement, s.ends_at, s.origin, s.created_by, s.approved_by,
                u.email::text AS email, u.username, u.locale, u.guest, u.deleted_at, t.choice, t.include_messages
           FROM sanctions s JOIN users u ON u.id = s.user_id
           LEFT JOIN LATERAL (SELECT choice, include_messages FROM ban_takedowns
                               WHERE user_id = s.user_id AND state = 'hidden' ORDER BY created_at DESC LIMIT 1) t ON true
          WHERE s.id = $1`,
        [sanctionId],
      );
      const row = r.rows[0];
      if (!row || !row.email || row.guest || row.deleted_at || isPlaceholderAddress(row.email)) return 'skipped';
      const locale = emailLocaleFor(row.locale);
      const mail = banEmail(
        {
          kind: row.kind,
          policy: row.policy,
          statement: row.statement,
          endsAt: row.ends_at,
          origin: row.origin,
          reviewedByPerson: row.created_by !== null || row.approved_by !== null,
          username: row.username,
          content: row.choice ? { choice: row.choice, includeMessages: row.include_messages === true } : { choice: 'keep', includeMessages: false },
        },
        locale,
        `${webBaseUrl.replace(/\/+$/, '')}/settings/standing`,
      );
      await send(row.email, mail.template, mail.vars, locale);
      return 'sent';
    },
  };
}
