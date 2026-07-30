/**
 * Transactional email templates (KUR-098), localized Kurdish + English (v1).
 * Pure rendering — subject + plain-text body with `{var}` interpolation. An
 * unknown locale falls back to English so a send never produces a blank email.
 */

export const EMAIL_TEMPLATES = [
  'verify-email',
  'password-reset',
  'password-changed',
  'oauth-no-password',
  'deletion-notice',
] as const;
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];

export const EMAIL_LOCALES = ['en', 'ku'] as const;
export type EmailLocale = (typeof EMAIL_LOCALES)[number];

export interface RenderedEmail {
  subject: string;
  text: string;
}

interface Entry {
  subject: string;
  text: string;
}

const CATALOG: Record<EmailTemplate, Record<EmailLocale, Entry>> = {
  'verify-email': {
    en: {
      subject: 'Verify your email',
      text: 'Welcome to Kurda!\n\nConfirm your email to get started: {link}\n\nIf you didn’t sign up, ignore this message.',
    },
    ku: {
      subject: 'E-nameya xwe piştrast bike',
      text: 'Bi xêr hatî Kurda!\n\nJi bo destpêkê e-nameya xwe piştrast bike: {link}\n\nEger te tomar nekiriye, vê peyamê pişguh bike.',
    },
  },
  'password-reset': {
    en: {
      subject: 'Reset your password',
      text: 'Reset your Kurda password with this link (valid 1 hour): {link}\n\nIf you didn’t request this, you can ignore it.',
    },
    ku: {
      subject: 'Şîfreya xwe ji nû ve saz bike',
      text: 'Bi vê girêdanê şîfreya xwe ji nû ve saz bike (1 saet derbasdar e): {link}\n\nEger te daxwaz nekiriye, tu dikarî pişguh bikî.',
    },
  },
  'password-changed': {
    en: {
      subject: 'Your password was changed',
      text: 'Your Kurda password was just changed. If this wasn’t you, reset it immediately and contact support.',
    },
    ku: {
      subject: 'Şîfreya te hate guhertin',
      text: 'Şîfreya te ya Kurda nû hate guhertin. Eger ev ne tu bûyî, tavilê wê ji nû ve saz bike û bi piştgiriyê re têkilî deyne.',
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
      text: 'Your Kurda account will be deleted on {date}. Log in before then to cancel and keep your progress.',
    },
    ku: {
      subject: 'Hesabê te dê were jêbirin',
      text: 'Hesabê te yê Kurda dê di {date} de were jêbirin. Berî wê têkeve da ku betal bikî û pêşketina xwe biparêzî.',
    },
  },
};

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? vars[key]! : whole));
}

/** Render a template in a locale (fallback English), interpolating `vars`. */
export function renderEmail(
  template: EmailTemplate,
  locale: EmailLocale,
  vars: Record<string, string> = {},
): RenderedEmail {
  const entry = CATALOG[template][locale] ?? CATALOG[template].en;
  return { subject: interpolate(entry.subject, vars), text: interpolate(entry.text, vars) };
}
