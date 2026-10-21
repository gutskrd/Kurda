import { describe, expect, it } from 'vitest';
import { emailAddress } from './email-address.js';
import { isDisposableEmail } from './disposable-domains.js';
import { loginBodySchema, passwordResetRequestBodySchema, registerBodySchema } from './routes.js';
import { normalizeEmailForRegistry } from '../moderation/pseudonym.js';
import { DISPOSABLE_DOMAINS_SAMPLE, PROVIDER_DOMAINS } from '../test/email-providers.js';

const accepts = (email: string) => emailAddress.safeParse(email).success;

describe('email addresses the forms accept', () => {
  it.each(PROVIDER_DOMAINS)('an address at %s', (domain) => {
    expect(accepts(`rojda.heval@${domain}`)).toBe(true);
  });

  it.each([
    ['a plus tag', 'name+tag@icloud.com'],
    ['dots', 'first.last@gmail.com'],
    ['capitals', 'Name@iCloud.com'],
    ['all capitals', 'ROJDA@GMAIL.COM'],
    ['digits, hyphens and underscores', 'dil-an_99@outlook.com'],
    ['a subdomain', 'x@mail.example.co.uk'],
    ['a long top-level domain', 'me@studio.photography'],
    ['an Apple relay address', 'abc123xyz@privaterelay.appleid.com'],
    ['an apostrophe', "o'brien@gmail.com"],
    ['an internationalised domain in ASCII', 'rojda@xn--80ak6aa92e.com'],
    ['an internationalised top-level domain in ASCII', 'rojda@example.xn--p1ai'],
  ])('%s', (_, email) => {
    expect(accepts(email)).toBe(true);
  });

  it('drops the space a keyboard or password manager puts around an address', () => {
    expect(emailAddress.parse(' name@icloud.com ')).toBe('name@icloud.com');
    expect(emailAddress.parse('name@icloud.com\t')).toBe('name@icloud.com');
  });

  it('keeps the letter case as typed: the column compares without it', () => {
    expect(emailAddress.parse('Name@iCloud.com')).toBe('Name@iCloud.com');
  });

  it.each([
    ['a space inside', 'na me@icloud.com'],
    ['a line break carrying a header', 'name@icloud.com\r\nBcc: everyone@example.com'],
    ['a line break alone', 'name\n@icloud.com'],
    ['a null character', 'name\u0000@icloud.com'],
    ['a quoted local part', '"name"@icloud.com'],
    ['angle brackets', '<name@icloud.com>'],
    ['a display name', 'Rojda <name@icloud.com>'],
    ['two addresses', 'a@icloud.com,b@icloud.com'],
    ['a leading dot', '.name@icloud.com'],
    ['two dots in a row', 'na..me@icloud.com'],
    ['no top-level domain', 'name@localhost'],
    ['no domain', 'name@'],
    ['no @', 'name.icloud.com'],
    ['a trailing dot', 'name@icloud.com.'],
    ['an address longer than mail allows', `${'a'.repeat(64)}@${'b'.repeat(190)}.com`],
  ])('refuses %s', (_, email) => {
    expect(accepts(email)).toBe(false);
  });

  it('is what sign-up, sign-in and the reset form use', () => {
    const signUp = {
      email: ' Name+hevalo@iCloud.com ',
      username: 'rojda',
      password: 'a-strong-password1',
      acceptTerms: true,
      birthYear: 1990,
      birthMonth: 6,
    };
    expect(registerBodySchema.parse(signUp).email).toBe('Name+hevalo@iCloud.com');
    expect(loginBodySchema.parse({ email: 'name@icloud.com ', password: 'x' }).email).toBe('name@icloud.com');
    expect(passwordResetRequestBodySchema.parse({ email: ' name@me.com' }).email).toBe('name@me.com');
  });
});

describe('disposable-domain matching', () => {
  it.each(PROVIDER_DOMAINS)('never flags %s', (domain) => {
    expect(isDisposableEmail(`rojda@${domain}`)).toBe(false);
    expect(isDisposableEmail(`Rojda@${domain.toUpperCase()}`)).toBe(false);
  });

  it.each(DISPOSABLE_DOMAINS_SAMPLE)('flags %s, a subdomain of it, in any case', (domain) => {
    expect(isDisposableEmail(`bot@${domain}`)).toBe(true);
    expect(isDisposableEmail(`bot@mx.${domain}`)).toBe(true);
    expect(isDisposableEmail(`bot@${domain.toUpperCase()}`)).toBe(true);
  });

  it('matches whole domains, never a piece of one', () => {
    // the blocked name inside a longer label, or as a label of another domain
    expect(isDisposableEmail('a@notmailinator.com')).toBe(false);
    expect(isDisposableEmail('a@mailinator.com.example.org')).toBe(false);
    expect(isDisposableEmail('a@mailinator.co')).toBe(false);
    // `mail.tm` is listed: neither gmail.com nor a .tm address elsewhere is it
    expect(isDisposableEmail('a@gmail.tm')).toBe(false);
    expect(isDisposableEmail('a@mail.tm')).toBe(true);
  });
});

describe('banned-address matching', () => {
  it('keeps every provider apart: one ban never covers an address elsewhere', () => {
    // googlemail.com is gmail.com under its old name, the one deliberate fold
    const others = PROVIDER_DOMAINS.filter((d) => d !== 'googlemail.com');
    const forms = others.map((d) => normalizeEmailForRegistry(`rojda.heval@${d}`));
    expect(new Set(forms).size).toBe(others.length);
    expect(normalizeEmailForRegistry('rojda.heval@googlemail.com')).toBe(normalizeEmailForRegistry('rojdaheval@gmail.com'));
    // Apple's three domains are one inbox to Apple but three addresses here
    expect(normalizeEmailForRegistry('rojda@icloud.com')).not.toBe(normalizeEmailForRegistry('rojda@me.com'));
  });

  it('folds only what delivers to the same inbox', () => {
    expect(normalizeEmailForRegistry('Name+tag@iCloud.com')).toBe('name@icloud.com');
    expect(normalizeEmailForRegistry('N.a.m.e+x@googlemail.com')).toBe('name@gmail.com');
    // dots are part of the name everywhere but Gmail
    expect(normalizeEmailForRegistry('first.last@icloud.com')).not.toBe(normalizeEmailForRegistry('firstlast@icloud.com'));
    expect(normalizeEmailForRegistry('first.last@outlook.com')).toBe('first.last@outlook.com');
  });
});
