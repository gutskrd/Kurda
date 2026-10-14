/**
 * Transactional email templates (KUR-098), localized Kurdish + English (v1).
 * Pure rendering — subject + plain-text body with `{var}` interpolation. An
 * unknown locale falls back to English so a send never produces a blank email.
 */

export const EMAIL_TEMPLATES = [
  'verify-email',
  'verify-email-code',
  'password-reset',
  'password-changed',
  'oauth-no-password',
  'deletion-notice',
  'moderation-urgent',
  'copyright-received',
  'copyright-removed',
  'copyright-upheld',
  'copyright-kept',
  'copyright-counter-notice',
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
  /** always present — the fallback for clients that refuse HTML */
  subject: string;
  text: string;
  /** only for templates that define one */
  html?: string;
}

interface Entry {
  subject: string;
  text: string;
  html?: string;
}

const CATALOG: Record<EmailTemplate, Record<EmailLocale, Entry>> = {
  'verify-email': {
    en: {
      subject: 'Verify your email',
      text: 'Welcome to Hevalo!\n\nConfirm your email to get started: {link}\n\nIf you didn’t sign up, ignore this message.',
    },
    ku: {
      subject: 'E-nameya xwe piştrast bike',
      text: 'Bi xêr hatî Hevalo!\n\nJi bo destpêkê e-nameya xwe piştrast bike: {link}\n\nEger te tomar nekiriye, vê peyamê pişguh bike.',
    },
  },
  'verify-email-code': {
    en: { subject: "Your Hevalo verification code", text: "Welcome to Hevalo!\n\nTo finish setting up your account, please use this code:\n\n{code}\n\nThis code is valid for 15 minutes.\nBe quick, friend 😄\n\nIf you didn't ask for this, you can ignore this message. Your account is safe.\n\nThank you for choosing Hevalo.\n\n— The Hevalo team", html: "<div style=\"background:#f5f6f8;padding:24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;\"><div style=\"max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;color:#14171c;\"><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;font-size:20px;font-weight:700;\">Welcome to <strong>Hevalo</strong>!</p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\">To finish setting up your account, please use this code:</p><div style=\"text-align:center;margin:0 0 20px;\"><div style=\"display:inline-block;padding:16px 28px;border:1px solid #e3e6ea;border-radius:10px;background:#fafbfc;font-size:32px;font-weight:700;letter-spacing:8px;\">{code}</div></div><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;margin-bottom:6px;\"><strong>This code is valid for 15 minutes.</strong></p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\"><strong>Be quick, friend 😄</strong></p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;color:#5b6169;\">If you didn't ask for this, you can ignore this message. Your account is safe.</p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\">Thank you for choosing <strong>Hevalo</strong>.</p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;margin-bottom:0;\">— <strong>The Hevalo team</strong></p></div></div>" },
    ku: { subject: "Koda piştrastkirinê ya Hevalo", text: "Bi xêr hatî Hevalo!\n\nJi bo temamkirina tomarkirina xwe, ji kerema xwe vê kodê bikar bîne:\n\n{code}\n\nEv kod ji bo 15 xulekan derbasdar e.\nZû be, heval 😄\n\nHeke te ev daxwaz nekiriye, tu dikarî vê peyamê paşguh bikî. Hesabê te ewle ye.\n\nSpas ji bo ku te Hevalo hilbijart.\n\n— Tîma Hevalo", html: "<div style=\"background:#f5f6f8;padding:24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;\"><div style=\"max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;color:#14171c;\"><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;font-size:20px;font-weight:700;\">Bi xêr hatî <strong>Hevalo</strong>!</p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\">Ji bo temamkirina tomarkirina xwe, ji kerema xwe vê kodê bikar bîne:</p><div style=\"text-align:center;margin:0 0 20px;\"><div style=\"display:inline-block;padding:16px 28px;border:1px solid #e3e6ea;border-radius:10px;background:#fafbfc;font-size:32px;font-weight:700;letter-spacing:8px;\">{code}</div></div><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;margin-bottom:6px;\"><strong>Ev kod ji bo 15 xulekan derbasdar e.</strong></p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\"><strong>Zû be, heval 😄</strong></p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;color:#5b6169;\">Heke te ev daxwaz nekiriye, tu dikarî vê peyamê paşguh bikî. Hesabê te ewle ye.</p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\">Spas ji bo ku te <strong>Hevalo</strong> hilbijart.</p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;margin-bottom:0;\">— <strong>Tîma Hevalo</strong></p></div></div>" },
  },
  'password-reset': {
    en: { subject: "Reset your password", text: "Hello!\n\nWe received a request to update the password on your Hevalo account.\n\nTo update your password, use this link:\n\n{link}\n\nThis link is valid for a short time.\nBe quick, friend 😄\n\nFor the security of your account, this link can only be used once.\n\nIf you didn't ask to reset your password, you can ignore this message.\nYour password will not change unless you use this link.\n\nIf several password-reset requests were sent without your knowledge,\nplease contact us about the security of your account.\n\n— The Hevalo team", html: "<div style=\"background:#f5f6f8;padding:24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;\"><div style=\"max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;color:#14171c;\"><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;font-size:20px;font-weight:700;\">Hello!</p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\">We received a request to <strong>update the password on your Hevalo account</strong>.</p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\">To update your password, tap the button below:</p><div style=\"text-align:center;margin:0 0 24px;\"><a href=\"{link}\" style=\"display:inline-block;background:#b8922e;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 28px;border-radius:10px;\">Update password</a></div><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;margin-bottom:6px;\"><strong>This link is valid for a short time.</strong></p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\"><strong>Be quick, friend 😄</strong></p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\">For the security of your account, this link can only be used once.</p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\">If you didn't ask to reset your password, you can ignore this message. <strong>Your password will not change unless you use this link.</strong></p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;color:#5b6169;\">If several password-reset requests were sent without your knowledge, please contact us about the security of your account.</p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\">— <strong>The Hevalo team</strong></p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;font-size:13px;color:#8a9099;margin-bottom:0;word-break:break-all;\">If the button doesn't work, copy this link: {link}</p></div></div>" },
    ku: { subject: "Şîfreya xwe ji nû ve saz bike", text: "Silav!\n\nMe daxwazek ji bo nûvekirina şîfreya hesabê te yê Hevalo wergirt.\n\nJi bo nûvekirina şîfreya xwe, vê girêdanê bikar bîne:\n\n{link}\n\nEv girêdan ji bo demek kin derbasdar e.\nZû be, heval 😄\n\nJi bo ewlehiya hesabê te, ev girêdan tenê carekê dikare were bikaranîn.\n\nHeke te daxwaza nûvekirina şîfreyê nekiriye, tu dikarî vê peyamê paşguh bikî.\nŞîfreya te wê neyê guhertin heta ku tu vê girêdanê bikar neynî.\n\nHeke bêyî destûra te çend daxwazên nûvekirina şîfreyê hatibin şandin, ji kerema xwe ji bo\newlehiya hesabê xwe bi me re têkilî daynin.\n\n— Tîma Hevalo", html: "<div style=\"background:#f5f6f8;padding:24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;\"><div style=\"max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;color:#14171c;\"><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;font-size:20px;font-weight:700;\">Silav!</p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\">Me daxwazek ji bo <strong>nûvekirina şîfreya hesabê te yê Hevalo</strong> wergirt.</p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\">Ji bo nûvekirina şîfreya xwe, li bişkoka jêrîn bitikîne:</p><div style=\"text-align:center;margin:0 0 24px;\"><a href=\"{link}\" style=\"display:inline-block;background:#b8922e;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 28px;border-radius:10px;\">Şîfreyê Nû Bike</a></div><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;margin-bottom:6px;\"><strong>Ev girêdan ji bo demek kin derbasdar e.</strong></p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\"><strong>Zû be, heval 😄</strong></p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\">Ji bo ewlehiya hesabê te, ev girêdan tenê carekê dikare were bikaranîn.</p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\">Heke te daxwaza nûvekirina şîfreyê nekiriye, tu dikarî vê peyamê paşguh bikî. <strong>Şîfreya te wê neyê guhertin heta ku tu vê girêdanê bikar neynî.</strong></p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;color:#5b6169;\">Heke bêyî destûra te çend daxwazên nûvekirina şîfreyê hatibin şandin, ji kerema xwe ji bo ewlehiya hesabê xwe bi me re têkilî daynin.</p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\">— <strong>Tîma Hevalo</strong></p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;font-size:13px;color:#8a9099;margin-bottom:0;word-break:break-all;\">Heke bişkok naxebite, vê girêdanê kopî bike: {link}</p></div></div>" },
  },
  'password-changed': {
    en: {
      subject: 'Your password was changed',
      text: 'Your Hevalo password was just changed. If this wasn’t you, reset it immediately and contact support.',
    },
    ku: {
      subject: 'Şîfreya te hate guhertin',
      text: 'Şîfreya te ya Hevalo nû hate guhertin. Eger ev ne tu bûyî, tavilê wê ji nû ve saz bike û bi piştgiriyê re têkilî deyne.',
    },
  },
  'oauth-no-password': {
    en: {
      subject: 'Set a password for your account',
      text: 'You signed in with a social account. Set a password so you can also log in directly: {link}',
    },
    ku: {
      subject: 'Ji bo hesabê xwe şîfreyekê saz bike',
      text: 'Te bi hesabekî civakî têketin kir. Şîfreyekê saz bike da ku tu rasterast jî têkevî: {link}',
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
  'deletion-notice': {
    en: {
      subject: 'Your account is scheduled for deletion',
      text: 'Your Hevalo account will be deleted on {date}. Log in before then to cancel and keep your progress.',
    },
    ku: {
      subject: 'Hesabê te dê were jêbirin',
      text: 'Hesabê te yê Hevalo dê di {date} de were jêbirin. Berî wê têkeve da ku betal bikî û pêşketina xwe biparêzî.',
    },
  },
};

/** `{name}` placeholders shared by the text and HTML interpolators. */
const TOKEN_RE = /\{(\w+)\}/g;

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(TOKEN_RE, (whole, key: string) => (key in vars ? vars[key]! : whole));
}

/**
 * Interpolated values can be user-controlled (a username, say), so escape them
 * before they reach markup — the template is trusted, the values are not.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function interpolateHtml(template: string, vars: Record<string, string>): string {
  return template.replace(TOKEN_RE, (whole, key: string) =>
    key in vars ? escapeHtml(vars[key]!) : whole,
  );
}

/** Render a template in a locale (fallback English), interpolating `vars`. */
export function renderEmail(
  template: EmailTemplate,
  locale: EmailLocale,
  vars: Record<string, string> = {},
): RenderedEmail {
  const entry = CATALOG[template][locale] ?? CATALOG[template].en;
  return {
    subject: interpolate(entry.subject, vars),
    text: interpolate(entry.text, vars),
    ...(entry.html ? { html: interpolateHtml(entry.html, vars) } : {}),
  };
}
