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
      text: 'Welcome to MyKurda!\n\nConfirm your email to get started: {link}\n\nIf you didn’t sign up, ignore this message.',
    },
    ku: {
      subject: 'E-nameya xwe piştrast bike',
      text: 'Bi xêr hatî MyKurda!\n\nJi bo destpêkê e-nameya xwe piştrast bike: {link}\n\nEger te tomar nekiriye, vê peyamê pişguh bike.',
    },
  },
  'verify-email-code': {
    en: { subject: "Your MyKurda verification code", text: "Welcome to MyKurda!\n\nTo finish setting up your account, please use this code:\n\n{code}\n\nThis code is valid for 15 minutes.\nBe quick, friend 😄\n\nIf you didn't ask for this, you can ignore this message. Your account is safe.\n\nThank you for choosing MyKurda.\n\n— The MyKurda team", html: "<div style=\"background:#f5f6f8;padding:24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;\"><div style=\"max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;color:#14171c;\"><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;font-size:20px;font-weight:700;\">Welcome to <strong>MyKurda</strong>!</p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\">To finish setting up your account, please use this code:</p><div style=\"text-align:center;margin:0 0 20px;\"><div style=\"display:inline-block;padding:16px 28px;border:1px solid #e3e6ea;border-radius:10px;background:#fafbfc;font-size:32px;font-weight:700;letter-spacing:8px;\">{code}</div></div><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;margin-bottom:6px;\"><strong>This code is valid for 15 minutes.</strong></p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\"><strong>Be quick, friend 😄</strong></p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;color:#5b6169;\">If you didn't ask for this, you can ignore this message. Your account is safe.</p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\">Thank you for choosing <strong>MyKurda</strong>.</p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;margin-bottom:0;\">— <strong>The MyKurda team</strong></p></div></div>" },
    ku: { subject: "Koda piştrastkirinê ya MyKurda", text: "Bi xêr hatî MyKurda!\n\nJi bo temamkirina tomarkirina xwe, ji kerema xwe vê kodê bikar bîne:\n\n{code}\n\nEv kod ji bo 15 xulekan derbasdar e.\nZû be, heval 😄\n\nHeke te ev daxwaz nekiriye, tu dikarî vê peyamê paşguh bikî. Hesabê te ewle ye.\n\nSpas ji bo ku te MyKurda hilbijart.\n\n— Tîma MyKurda", html: "<div style=\"background:#f5f6f8;padding:24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;\"><div style=\"max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;color:#14171c;\"><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;font-size:20px;font-weight:700;\">Bi xêr hatî <strong>MyKurda</strong>!</p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\">Ji bo temamkirina tomarkirina xwe, ji kerema xwe vê kodê bikar bîne:</p><div style=\"text-align:center;margin:0 0 20px;\"><div style=\"display:inline-block;padding:16px 28px;border:1px solid #e3e6ea;border-radius:10px;background:#fafbfc;font-size:32px;font-weight:700;letter-spacing:8px;\">{code}</div></div><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;margin-bottom:6px;\"><strong>Ev kod ji bo 15 xulekan derbasdar e.</strong></p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\"><strong>Zû be, heval 😄</strong></p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;color:#5b6169;\">Heke te ev daxwaz nekiriye, tu dikarî vê peyamê paşguh bikî. Hesabê te ewle ye.</p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\">Spas ji bo ku te <strong>MyKurda</strong> hilbijart.</p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;margin-bottom:0;\">— <strong>Tîma MyKurda</strong></p></div></div>" },
  },
  'password-reset': {
    en: { subject: "Reset your password", text: "Hello!\n\nWe received a request to update the password on your MyKurda account.\n\nTo update your password, use this link:\n\n{link}\n\nThis link is valid for a short time.\nBe quick, friend 😄\n\nFor the security of your account, this link can only be used once.\n\nIf you didn't ask to reset your password, you can ignore this message.\nYour password will not change unless you use this link.\n\nIf several password-reset requests were sent without your knowledge,\nplease contact us about the security of your account.\n\n— The MyKurda team", html: "<div style=\"background:#f5f6f8;padding:24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;\"><div style=\"max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;color:#14171c;\"><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;font-size:20px;font-weight:700;\">Hello!</p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\">We received a request to <strong>update the password on your MyKurda account</strong>.</p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\">To update your password, tap the button below:</p><div style=\"text-align:center;margin:0 0 24px;\"><a href=\"{link}\" style=\"display:inline-block;background:#b8922e;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 28px;border-radius:10px;\">Update password</a></div><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;margin-bottom:6px;\"><strong>This link is valid for a short time.</strong></p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\"><strong>Be quick, friend 😄</strong></p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\">For the security of your account, this link can only be used once.</p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\">If you didn't ask to reset your password, you can ignore this message. <strong>Your password will not change unless you use this link.</strong></p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;color:#5b6169;\">If several password-reset requests were sent without your knowledge, please contact us about the security of your account.</p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\">— <strong>The MyKurda team</strong></p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;font-size:13px;color:#8a9099;margin-bottom:0;word-break:break-all;\">If the button doesn't work, copy this link: {link}</p></div></div>" },
    ku: { subject: "Şîfreya xwe ji nû ve saz bike", text: "Silav!\n\nMe daxwazek ji bo nûvekirina şîfreya hesabê te yê MyKurda wergirt.\n\nJi bo nûvekirina şîfreya xwe, vê girêdanê bikar bîne:\n\n{link}\n\nEv girêdan ji bo demek kin derbasdar e.\nZû be, heval 😄\n\nJi bo ewlehiya hesabê te, ev girêdan tenê carekê dikare were bikaranîn.\n\nHeke te daxwaza nûvekirina şîfreyê nekiriye, tu dikarî vê peyamê paşguh bikî.\nŞîfreya te wê neyê guhertin heta ku tu vê girêdanê bikar neynî.\n\nHeke bêyî destûra te çend daxwazên nûvekirina şîfreyê hatibin şandin, ji kerema xwe ji bo\newlehiya hesabê xwe bi me re têkilî daynin.\n\n— Tîma MyKurda", html: "<div style=\"background:#f5f6f8;padding:24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;\"><div style=\"max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;color:#14171c;\"><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;font-size:20px;font-weight:700;\">Silav!</p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\">Me daxwazek ji bo <strong>nûvekirina şîfreya hesabê te yê MyKurda</strong> wergirt.</p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\">Ji bo nûvekirina şîfreya xwe, li bişkoka jêrîn bitikîne:</p><div style=\"text-align:center;margin:0 0 24px;\"><a href=\"{link}\" style=\"display:inline-block;background:#b8922e;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 28px;border-radius:10px;\">Şîfreyê Nû Bike</a></div><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;margin-bottom:6px;\"><strong>Ev girêdan ji bo demek kin derbasdar e.</strong></p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\"><strong>Zû be, heval 😄</strong></p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\">Ji bo ewlehiya hesabê te, ev girêdan tenê carekê dikare were bikaranîn.</p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\">Heke te daxwaza nûvekirina şîfreyê nekiriye, tu dikarî vê peyamê paşguh bikî. <strong>Şîfreya te wê neyê guhertin heta ku tu vê girêdanê bikar neynî.</strong></p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;color:#5b6169;\">Heke bêyî destûra te çend daxwazên nûvekirina şîfreyê hatibin şandin, ji kerema xwe ji bo ewlehiya hesabê xwe bi me re têkilî daynin.</p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;\">— <strong>Tîma MyKurda</strong></p><p style=\"margin:0 0 18px;font-size:16px;line-height:1.6;font-size:13px;color:#8a9099;margin-bottom:0;word-break:break-all;\">Heke bişkok naxebite, vê girêdanê kopî bike: {link}</p></div></div>" },
  },
  'password-changed': {
    en: {
      subject: 'Your password was changed',
      text: 'Your MyKurda password was just changed. If this wasn’t you, reset it immediately and contact support.',
    },
    ku: {
      subject: 'Şîfreya te hate guhertin',
      text: 'Şîfreya te ya MyKurda nû hate guhertin. Eger ev ne tu bûyî, tavilê wê ji nû ve saz bike û bi piştgiriyê re têkilî deyne.',
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
  'deletion-notice': {
    en: {
      subject: 'Your account is scheduled for deletion',
      text: 'Your MyKurda account will be deleted on {date}. Log in before then to cancel and keep your progress.',
    },
    ku: {
      subject: 'Hesabê te dê were jêbirin',
      text: 'Hesabê te yê MyKurda dê di {date} de were jêbirin. Berî wê têkeve da ku betal bikî û pêşketina xwe biparêzî.',
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
