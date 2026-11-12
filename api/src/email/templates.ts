/**
 * Transactional email templates (KUR-098), localized Kurdish + English (v1).
 * Pure rendering — subject + plain-text body with `{var}` interpolation. An
 * unknown locale falls back to English so a send never produces a blank email.
 *
 * Each email is written once, as its plain text. The designed version every
 * reader with a modern inbox sees is read from that same text (`designOf`):
 * its paragraphs, the link that becomes the one button, the code that becomes
 * a large code, the lines that stay lines. So the two can never say different
 * things, and a new template needs only its text, its picture and, where it
 * has a link to press, what the button says. The look itself is layout.ts.
 */
import { PROVIDER, type EmailPicture } from '@kurda/shared';
import { renderEmailHtml, type EmailBlock, type EmailDesign, type Inline } from './layout.js';

export const EMAIL_TEMPLATES = [
  'verify-email',
  'verify-email-code',
  'password-reset',
  'password-changed',
  'username-changed',
  'oauth-no-password',
  'deletion-notice',
  'moderation-urgent',
  'copyright-received',
  'copyright-removed',
  'copyright-upheld',
  'copyright-kept',
  'copyright-counter-notice',
  'new-sign-in',
  'sign-in-attempts',
  'security-alert',
] as const;
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];

export const EMAIL_LOCALES = ['en', 'ku'] as const;
export type EmailLocale = (typeof EMAIL_LOCALES)[number];

/**
 * Which of these two a reader gets, from the nine the app itself speaks.
 *
 * The app stores a locale per account and the whole send path has carried one
 * since it was written — the job payload, the service, `renderEmail`. No caller
 * ever passed it, so every email rendered `en`. The workaround was to put the
 * Kurmancî copy in the `en` slot as well, byte for byte, which did get Kurdish
 * mail to Kurdish readers — and sent Kurmancî to everyone else, in the two
 * messages you cannot finish signing up or recover an account without.
 *
 * Callers pass the account's locale now, so `en` can be English again.
 *
 * Soranî maps to English deliberately: there is no Soranî email copy yet, and a
 * reader of Soranî is not served by Kurmancî in a script they may not read. It
 * becomes its own entry the day that copy exists.
 */
export function emailLocaleFor(locale: string | null | undefined): EmailLocale {
  return locale === 'ku' ? 'ku' : 'en';
}

export interface RenderedEmail {
  subject: string;
  /** always sent — what a program that refuses HTML shows */
  text: string;
  /** the designed email, read from the same text */
  html: string;
}

interface Entry {
  subject: string;
  text: string;
}

const CATALOG: Record<EmailTemplate, Record<EmailLocale, Entry>> = {
  'verify-email': {
    en: {
      subject: 'Confirm your email',
      text: 'Welcome to Hevalo!\n\nConfirm your email address to finish setting up your account: {link}\n\nThe link works for 24 hours. If you didn’t create a Hevalo account, you can ignore this email.\n\n— The Hevalo team',
    },
    ku: {
      subject: 'E-nameya xwe piştrast bike',
      text: 'Bi xêr hatî Hevalo!\n\nJi bo destpêkê e-nameya xwe piştrast bike: {link}\n\nEv girêdan ji bo 24 saetan derbasdar e. Eger te tomar nekiriye, vê peyamê paşguh bike.\n\n— Tîma Hevalo',
    },
  },
  'verify-email-code': {
    en: { subject: "Your Hevalo verification code", text: "Welcome to Hevalo!\n\nTo finish setting up your account, please use this code:\n\n{code}\n\nThis code is valid for 15 minutes.\n\nIf you didn't ask for this, you can ignore this message. Your account is safe.\n\nThank you for choosing Hevalo.\n\n— The Hevalo team" },
    ku: { subject: "Koda piştrastkirinê ya Hevalo", text: "Bi xêr hatî Hevalo!\n\nJi bo temamkirina tomarkirina xwe, ji kerema xwe vê kodê bikar bîne:\n\n{code}\n\nEv kod ji bo 15 xulekan derbasdar e.\n\nHeke te ev daxwaz nekiriye, tu dikarî vê peyamê paşguh bikî. Hesabê te ewle ye.\n\nSpas ji bo ku te Hevalo hilbijart.\n\n— Tîma Hevalo" },
  },
  'password-reset': {
    en: { subject: "Reset your password", text: "Hello {username},\n\nWe received a request to update the password on your Hevalo account.\n\nTo update your password, use this link:\n\n{link}\n\nThis link is valid for one hour.\nFor the security of your account, it can only be used once.\n\nIf you didn't ask to reset your password, you can ignore this message.\nYour password will not change unless you use this link.\n\nIf several password-reset requests were sent without your knowledge,\nplease contact us about the security of your account.\n\n— The Hevalo team" },
    ku: { subject: "Şîfreya xwe ji nû ve saz bike", text: "Silav {username},\n\nMe daxwazek ji bo nûvekirina şîfreya hesabê te yê Hevalo wergirt.\n\nJi bo nûvekirina şîfreya xwe, vê girêdanê bikar bîne:\n\n{link}\n\nEv girêdan ji bo saetekê derbasdar e.\nJi bo ewlehiya hesabê te, ew tenê carekê dikare were bikaranîn.\n\nHeke te daxwaza nûvekirina şîfreyê nekiriye, tu dikarî vê peyamê paşguh bikî.\nŞîfreya te wê neyê guhertin heta ku tu vê girêdanê bikar neynî.\n\nHeke bêyî destûra te çend daxwazên nûvekirina şîfreyê hatibin şandin, ji kerema xwe ji bo\newlehiya hesabê xwe bi me re têkilî daynin.\n\n— Tîma Hevalo" },
  },
  'password-changed': {
    en: {
      subject: 'Your password was changed',
      text: 'Hello {username},\n\nThe password for your Hevalo account was just changed.\n\nIf this was you, there is nothing else to do.\n\nIf it wasn’t, reset your password now (choose “Forgotten your password?” on the sign-in screen) and contact support.\n\n— The Hevalo team',
    },
    ku: {
      subject: 'Şîfreya te hate guhertin',
      text: 'Silav {username},\n\nŞîfreya te ya Hevalo nû hate guhertin.\n\nHeke ev tu bûyî, tiştek din ji bo kirinê nîne.\n\nHeke ne tu bûyî, tavilê şîfreya xwe ji nû ve saz bike (li ser rûpela têketinê “Şîfreya xwe ji bîr kir?” hilbijêre) û bi piştgiriyê re têkilî deyne.\n\n— Tîma Hevalo',
    },
  },
  'username-changed': {
    en: {
      subject: 'Your username was changed',
      text: 'Hello {username},\n\nThe username of your Hevalo account was just changed from {previous} to {username} ({time}).\n\nIf this was you, there is nothing else to do. Your old username is kept for you for {holdDays} days, so nobody else can take it, and you can change your username again after {cooldownDays} days.\n\nIf it wasn’t you, change your password now (Settings, then Password) and contact support.\n\n— The Hevalo team',
    },
    ku: {
      subject: 'Navê te yê bikarhêner hate guhertin',
      text: 'Silav {username},\n\nNavê bikarhêner ê hesabê te yê Hevalo nû ji {previous} bû {username} ({time}).\n\nHeke ev tu bûyî, tiştek din ji bo kirinê nîne. Navê te yê berê {holdDays} rojan ji bo te tê parastin, da ku kesek din nikaribe wî bigire, û tu dikarî piştî {cooldownDays} rojan navê xwe dîsa biguherînî.\n\nHeke ne tu bûyî, tavilê şîfreya xwe biguherîne (Mîheng, paşê Şîfre) û bi piştgiriyê re têkilî deyne.\n\n— Tîma Hevalo',
    },
  },
  'oauth-no-password': {
    en: {
      subject: 'Set a password for your account',
      text: 'Hello {username},\n\nSomeone asked to reset the password for your Hevalo account. Your account has no password yet, because you sign in through another service.\n\nIf you would also like to sign in with your email address and a password, set one here: {link}\n\nThe link works for one hour. If you didn’t ask for this, you can ignore this email: nothing will change.\n\n— The Hevalo team',
    },
    ku: {
      subject: 'Ji bo hesabê xwe şîfreyekê saz bike',
      text: 'Silav {username},\n\nKesekî xwest şîfreya hesabê te yê Hevalo ji nû ve saz bike. Hesabê te hê şîfreyekê nîne, ji ber ku tu bi xizmeteke din têdikevî.\n\nHeke tu dixwazî bi navnîşana e-nameya xwe û şîfreyekê jî têkevî, li vir yekê saz bike: {link}\n\nEv girêdan ji bo saetekê derbasdar e. Heke te ev daxwaz nekiriye, tu dikarî vê e-nameyê paşguh bikî: tiştek nayê guhertin.\n\n— Tîma Hevalo',
    },
  },
  /**
   * To moderators, for a P0 report. Deliberately empty of everything the
   * report holds — no content, no names, no category — email is not a safe
   * place for it; the link is the whole message.
   */
  'moderation-urgent': {
    en: {
      subject: 'A new urgent report needs review',
      text: 'A new urgent report on Hevalo needs review as soon as you can.\n\nOpen it here: {link}\n\n— Hevalo moderation',
    },
    ku: {
      subject: 'Raporeke lezgîn a nû li benda nirxandinê ye',
      text: 'Raporeke lezgîn a nû li Hevalo li benda nirxandinê ye. Ji kerema xwe zû lê binêre.\n\nLi vir veke: {link}\n\n— Moderasyona Hevalo',
    },
  },
  /**
   * To superadmins, when the security log records something critical (an admin
   * console sign-in from somewhere new, two-step codes locked, a surge of failed
   * sign-ins). Names the kinds of event and how many, never an address or an
   * account: the log is where those are, behind the console's sign-in.
   */
  'security-alert': {
    en: {
      subject: 'Hevalo security alert: {headline}',
      text: 'Something on Hevalo needs your attention:\n\n{list}\n\nOpen the security log to see what happened, and mark it reviewed: {link}\n\nIf it was you, there is nothing else to do. If not, change your password now.\n\n— Hevalo security',
    },
    ku: {
      subject: 'Hişyariya ewlehiyê ya Hevalo: {headline}',
      text: 'Tiştek li Hevalo hewceyî baldariya te ye:\n\n{list}\n\nTomara ewlehiyê veke da ku bibînî çi qewimî, û wê wekî nirxandî nîşan bide: {link}\n\nHeke ew tu bûyî, tiştek din ji bo kirinê nîne. Heke ne tu bûyî, niha şîfreya xwe biguherîne.\n\n— Ewlehiya Hevalo',
    },
  },
  /*
   * To someone who sent a copyright notice from /copyright — usually not a
   * member, so email is the only way to reach them. The receipt (DSA Art.
   * 16(4)) and the decision (Art. 16(5)); the counter-notice's copy is the one
   * the DMCA (§512(g)(2)(B)) asks the provider to forward. Plain text only:
   * these are records, and are kept the way they were sent.
   */
  'copyright-received': {
    en: {
      subject: 'We received your copyright notice ({reference})',
      text:
        'Thank you. We received your copyright notice about {link}.\n\nYour reference is {reference}. A person at Hevalo will review it and email you what we decided.\n\nIf you need to add anything, write to {contact} and quote your reference.\n\n— Hevalo',
    },
    ku: {
      subject: 'Me agahdariya te ya mafê nivîskariyê wergirt ({reference})',
      text:
        'Spas. Me agahdariya te ya mafê nivîskariyê li ser {link} wergirt.\n\nReferansa te {reference} e. Kesek ji Hevalo dê lê binêre û biryara me bi e-nameyê ji te re bişîne.\n\nHeke tu dixwazî tiştekî zêde bikî, ji {contact} re binivîse û referansa xwe binivîse.\n\n— Hevalo',
    },
  },
  'copyright-removed': {
    en: {
      subject: 'Your copyright notice: we removed it ({reference})',
      text:
        'We reviewed your copyright notice {reference} and removed the content you reported, or disabled access to it.\n\nThe person who posted it was told why. If they send a counter-notice, we will forward you a copy.\n\n— Hevalo',
    },
    ku: {
      subject: 'Agahdariya te ya mafê nivîskariyê: me ew rakir ({reference})',
      text:
        'Me li agahdariya te ya mafê nivîskariyê {reference} nêrî û naveroka ku te ragihandibû rakir, an jî gihîştina wê girt.\n\nKesê ku ew şandibû sedem hat agahdarkirin. Heke ew bersiveke dijber bişîne, em ê kopiyekê ji te re bişînin.\n\n— Hevalo',
    },
  },
  /*
   * Upheld with nothing to take down: the notice was about a profile, or its
   * link matched nothing we could find, and the decision acted on the account.
   * Saying "removed" here would be untrue, so this says what happened and asks
   * for the exact link if the material is still up.
   */
  'copyright-upheld': {
    en: {
      subject: 'Your copyright notice: our decision ({reference})',
      text:
        'We reviewed your copyright notice {reference}, agreed with it, and took action against the account involved.\n\nYour notice did not point to a single post we could take down, so nothing was removed because of it. If the material is still on Hevalo, write to {contact} with the exact link to it and quote your reference.\n\n— Hevalo',
    },
    ku: {
      subject: 'Agahdariya te ya mafê nivîskariyê: biryara me ({reference})',
      text:
        'Me li agahdariya te ya mafê nivîskariyê {reference} nêrî, me ew pejirand û me li dijî hesabê têkildar tedbîr girt.\n\nAgahdariya te ne li ser postekê bû ku em karibin rakin, ji ber vê yekê tiştek ji ber wê nehat rakirin. Heke materyal hîn li Hevalo be, lînka wê ya rast ji {contact} re binivîse û referansa xwe binivîse.\n\n— Hevalo',
    },
  },
  'copyright-kept': {
    en: {
      subject: 'Your copyright notice: our decision ({reference})',
      text:
        'We reviewed your copyright notice {reference} and did not remove the content. We could not confirm from the notice that it infringes your rights.\n\nIf you can tell us more, write to {contact} and quote your reference.\n\n— Hevalo',
    },
    ku: {
      subject: 'Agahdariya te ya mafê nivîskariyê: biryara me ({reference})',
      text:
        'Me li agahdariya te ya mafê nivîskariyê {reference} nêrî û naverok ranekir. Me ji agahdariyê nekarî piştrast bikin ku ew mafên te binpê dike.\n\nHeke tu dikarî bêtir bibêjî, ji {contact} re binivîse û referansa xwe binivîse.\n\n— Hevalo',
    },
  },
  'copyright-counter-notice': {
    en: {
      subject: 'A counter-notice to your copyright notice ({reference})',
      text:
        'The person who posted the content you reported in {reference} has sent a counter-notice. They say it was removed by mistake or misidentified. Their counter-notice, as they sent it:\n\nName: {name}\nAddress: {address}\nPhone: {phone}\nEmail: {email}\n\nStatement:\n{statement}\n\nThey state under penalty of perjury that they believe in good faith the content was removed by mistake or misidentification, they consent to the jurisdiction of the courts named by 17 U.S.C. §512(g)(3)(D), and they will accept service of process from you. Signed: {signature}\n\nIf you do not tell us at {contact}, before {restoreDate}, that you have filed a court action to stop the infringement, we may put the content back.\n\n— Hevalo',
    },
    ku: {
      subject: 'Bersiveke dijber ji agahdariya te ya mafê nivîskariyê re ({reference})',
      text:
        'Kesê ku naveroka di {reference} de şandibû bersiveke dijber şand. Ew dibêje ku ew bi şaşî hat rakirin an jî şaş hat naskirin. Bersiva wî/wê, wek ku hatiye şandin:\n\nNav: {name}\nNavnîşan: {address}\nTelefon: {phone}\nE-name: {email}\n\nDaxuyanî:\n{statement}\n\nEw di bin cezaya derewê de dibêje ku bi baweriya baş naverok bi şaşî hat rakirin, ku ew dadgehên ku 17 U.S.C. §512(g)(3)(D) bi nav dike qebûl dike, û ku ew ê belgeyên dadgehê ji te qebûl bike. Îmze: {signature}\n\nHeke tu berî {restoreDate} li {contact} ji me re nebêjî ku te dozek vekiriye, dibe ku em naverokê vegerînin.\n\n— Hevalo',
    },
  },
  /*
   * Security notices. Plain text, and nothing in them the person signing in
   * chose (not the device's name): whoever did it may not be the owner, and
   * this lands in the owner's inbox.
   */
  'new-sign-in': {
    en: {
      subject: 'New sign-in to your Hevalo account',
      text: 'Hello {username},\n\nYour Hevalo account was just signed in to from a device it has not been used on before ({time}).\n\nIf this was you, there is nothing to do.\n\nIf it was not, reset your password now (choose “Forgotten your password?” on the sign-in screen): that signs every device out.\n\n— The Hevalo team',
    },
    ku: {
      subject: 'Têketineke nû li hesabê te yê Hevalo',
      text: 'Silav {username},\n\nNiha ji amûreke ku berê qet bi hesabê te yê Hevalo re nehatibû bikaranîn têketin hate kirin ({time}).\n\nHeke ev tu bûyî, tiştek nayê kirin.\n\nHeke ne tu bûyî, niha şîfreya xwe ji nû ve saz bike (li ser rûpela têketinê “Şîfreya xwe ji bîr kir?” hilbijêre): bi vî awayî hemû amûr ji hesabê derdikevin.\n\n— Tîma Hevalo',
    },
  },
  'sign-in-attempts': {
    en: {
      subject: 'Many failed sign-ins to your Hevalo account',
      text: 'Hello {username},\n\nSomeone has tried several wrong passwords for your Hevalo account, so we have paused sign-ins from new devices for a while ({time}). Devices you already use are not affected.\n\nIf this was you, wait a little or reset your password (choose “Forgotten your password?” on the sign-in screen).\n\nIf it was not, your password has not been changed, but choosing a new, unique one is a good idea.\n\n— The Hevalo team',
    },
    ku: {
      subject: 'Gelek hewldanên têketinê yên têkçûyî li hesabê te yê Hevalo',
      text: 'Silav {username},\n\nKesekî ji bo hesabê te yê Hevalo çend şîfreyên şaş ceribandine, ji ber vê yekê me ji bo demekê têketinên ji amûrên nû rawestandin ({time}). Amûrên ku tu jixwe bikar tînî bandor nabin.\n\nHeke ev tu bûyî, hinekî bisekine an şîfreya xwe ji nû ve saz bike (li ser rûpela têketinê “Şîfreya xwe ji bîr kir?” hilbijêre).\n\nHeke ne tu bûyî, şîfreya te nehatiye guhertin, lê hilbijartina şîfreyeke nû û yekta baş e.\n\n— Tîma Hevalo',
    },
  },
  'deletion-notice': {
    en: {
      subject: 'Your account is scheduled for deletion',
      text: 'Hello {username},\n\nYou asked us to delete your Hevalo account. It will be deleted for good in {graceDays} days, with everything in it.\n\nIf you change your mind, sign in again before then: the deletion is cancelled, and your account and your progress stay as they are.\n\nIf you didn’t ask for this, sign in now and change your password.\n\n— The Hevalo team',
    },
    ku: {
      subject: 'Hesabê te dê were jêbirin',
      text: 'Silav {username},\n\nTe xwest ku em hesabê te yê Hevalo jê bibin. Ew ê piştî {graceDays} rojan, bi hemû tiştên tê de, bi temamî were jêbirin.\n\nHeke tu poşman bibî, berî wê dîsa têkeve: jêbirin tê betalkirin, û hesab û pêşketina te wek xwe dimînin.\n\nHeke te ev daxwaz nekiriye, niha têkeve û şîfreya xwe biguherîne.\n\n— Tîma Hevalo',
    },
  },
};

/** `{name}` placeholders. */
const TOKEN_RE = /\{(\w+)\}/g;

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(TOKEN_RE, (whole, key: string) => (key in vars ? vars[key]! : whole));
}

// ---------------------------------------------------------------------------
// the designed email, read from the text
// ---------------------------------------------------------------------------

/** What each email's picture is, and what its button says when it has a link to press. */
const DESIGN: Record<EmailTemplate, { picture: EmailPicture; button?: Record<EmailLocale, string> }> = {
  'verify-email': { picture: 'letter', button: { en: 'Confirm your email', ku: 'E-nameya xwe piştrast bike' } },
  'verify-email-code': { picture: 'letter' },
  'password-reset': { picture: 'key', button: { en: 'Update password', ku: 'Şîfreyê Nû Bike' } },
  'password-changed': { picture: 'lock' },
  'username-changed': { picture: 'badge' },
  'oauth-no-password': { picture: 'key', button: { en: 'Set a password', ku: 'Şîfreyekê saz bike' } },
  'deletion-notice': { picture: 'hourglass' },
  'moderation-urgent': { picture: 'flag', button: { en: 'Open the report', ku: 'Raporê veke' } },
  'copyright-received': { picture: 'document' },
  'copyright-removed': { picture: 'document' },
  'copyright-upheld': { picture: 'document' },
  'copyright-kept': { picture: 'document' },
  'copyright-counter-notice': { picture: 'document' },
  'new-sign-in': { picture: 'device' },
  'sign-in-attempts': { picture: 'shield' },
  'security-alert': { picture: 'shield', button: { en: 'Open the security log', ku: 'Tomara ewlehiyê veke' } },
};

/** The footer's two lines every email has: where to write, and the link again for a button that will not press. */
const HELP: Record<EmailLocale, string> = { en: 'Need a hand? Write to {email}.', ku: 'Alîkarî divê? Ji {email} re binivîse.' };
const FALLBACK: Record<EmailLocale, string> = { en: 'If the button doesn’t work, copy this link:', ku: 'Heke bişkok naxebite, vê girêdanê kopî bike:' };

/** A paragraph longer than this is read from the edge; set in the middle it would be a ragged block. */
const CENTRED_UP_TO = 220;

/**
 * A paragraph as the layout takes it: its words, with what was filled in as
 * plain words too (the layout escapes them), except the two things a sentence
 * may link — `{link}` and the `{contact}` address.
 */
function sentence(template: string, vars: Record<string, string>): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of template.matchAll(TOKEN_RE)) {
    const key = m[1]!;
    if (!(key in vars)) continue;
    out.push(template.slice(last, m.index));
    const value = vars[key]!;
    out.push(key === 'link' ? { link: value } : key === 'contact' ? { mailto: value } : value);
    last = m.index + m[0].length;
  }
  out.push(template.slice(last));
  return out.filter((part) => part !== '');
}

/** Lines that are kept as lines: a list, somebody's statement, or `Label: {value}` on every line. */
function keepsItsLines(chunk: string): boolean {
  if (chunk === '{list}' || chunk.includes('{statement}')) return true;
  return chunk.includes('\n') && chunk.split('\n').every((line) => /^[^\s:{}][^:{}]{0,30}:\s*\{\w+\}$/.test(line));
}

/**
 * The email's design, read from its text: blank lines part the paragraphs; a
 * `{code}` alone is the code; a `{link}` alone, or closing a line after a
 * colon, is the button; the last line after a dash is who signs it. What
 * follows the button or the code is the small print.
 */
function designOf(template: EmailTemplate, locale: EmailLocale, entry: Entry, vars: Record<string, string>): EmailDesign {
  const chunks = entry.text
    .split(/\n{2,}/)
    .map((c) => c.trim())
    .filter((c) => c !== '');
  const last = chunks.at(-1);
  const signoff = chunks.length > 1 && last !== undefined && /^—\s*/.test(last) ? interpolate(chunks.pop()!.replace(/^—\s*/, ''), vars) : undefined;

  const label = DESIGN[template].button?.[locale] ?? DESIGN[template].button?.en ?? interpolate(entry.subject, vars);
  const button = (): EmailBlock => ({ kind: 'button', label, href: vars.link ?? '{link}' });
  const blocks: EmailBlock[] = [];
  let acted = false;
  let centred = true;
  let preheader: string | undefined;
  for (const chunk of chunks) {
    if (chunk === '{code}') {
      blocks.push({ kind: 'code', code: vars.code ?? '{code}' });
      acted = true;
      continue;
    }
    if (chunk === '{link}') {
      blocks.push(button());
      acted = true;
      continue;
    }
    if (keepsItsLines(chunk)) {
      blocks.push({ kind: 'details', lines: chunk.split('\n').map((line) => interpolate(line, vars)) });
      centred = false;
      continue;
    }
    // hard-wrapped lines of one paragraph are one paragraph
    const flowed = chunk.replace(/\s*\n\s*/g, ' ');
    const closing = /^(.*[:：])\s*\{link\}$/.exec(flowed);
    const words = closing ? closing[1]! : flowed;
    if (words.length > CENTRED_UP_TO) centred = false;
    // the line an inbox shows beside the subject: the first that is not a greeting
    if (preheader === undefined && !/^[^.!?]{1,40},$/.test(words)) preheader = interpolate(words, vars);
    blocks.push({ kind: 'text', parts: sentence(words, vars), ...(acted ? { quiet: true } : {}) });
    if (closing) {
      blocks.push(button());
      acted = true;
    }
  }
  return {
    brand: 'hevalo',
    lang: locale,
    title: interpolate(entry.subject, vars),
    ...(preheader !== undefined ? { preheader } : {}),
    picture: DESIGN[template].picture,
    // a reference in brackets belongs to the subject line, where a reader searches for it, not to the heading
    heading: interpolate(entry.subject.replace(/\s*\(\{\w+\}\)\s*$/, ''), vars),
    blocks,
    align: centred ? 'center' : 'start',
    ...(signoff !== undefined ? { signoff } : {}),
    help: { text: HELP[locale], email: PROVIDER.userContact.email },
    ...(blocks.some((b) => b.kind === 'button') ? { fallback: FALLBACK[locale] } : {}),
  };
}

/** Render a template in a locale (fallback English), interpolating `vars`. */
export function renderEmail(
  template: EmailTemplate,
  locale: EmailLocale,
  vars: Record<string, string> = {},
): RenderedEmail {
  const known = CATALOG[template][locale] ? locale : 'en';
  const entry = CATALOG[template][known];
  return {
    subject: interpolate(entry.subject, vars),
    text: interpolate(entry.text, vars),
    html: renderEmailHtml(designOf(template, known, entry, vars)),
  };
}
