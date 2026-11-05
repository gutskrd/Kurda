import { describe, expect, it } from 'vitest';
import { emailAddress } from './email-address.js';
import { isDisposableEmail } from './disposable-domains.js';
import { loginBodySchema, passwordResetRequestBodySchema, registerBodySchema } from './routes.js';
import { normalizeEmailForRegistry } from '../moderation/pseudonym.js';
import { DISPOSABLE_DOMAINS_SAMPLE, PROVIDER_DOMAINS } from '../test/email-providers.js';

const accepts = (email: string) => emailAddress.safeParse(email).success;

describe('email addresses the forms accept', () => {
  it.each(PROVIDER_DOMAINS)('an address at %s', (domain) => {
    expect(accepts(`fixture.address@${domain}`)).toBe(true);
  });

  it.each([
    ['a plus tag', 'name+tag@example.com'],
    ['dots', 'first.last@example.com'],
    ['capitals', 'Name@Example.com'],
    ['all capitals', 'ROJDA@EXAMPLE.COM'],
    ['digits, hyphens and underscores', 'dil-an_99@example.com'],
    ['a subdomain', 'x@mail.example.co.uk'],
    ['a long top-level domain', 'me@studio.photography'],
    ['an Apple relay address', 'abc123xyz@privaterelay.appleid.com'],
    ['an apostrophe', "o'brien@example.com"],
    ['an internationalised domain in ASCII', 'rojda@xn--80ak6aa92e.com'],
    ['an internationalised top-level domain in ASCII', 'rojda@example.xn--p1ai'],
  ])('%s', (_, email) => {
    expect(accepts(email)).toBe(true);
  });

  it('drops the space a keyboard or password manager puts around an address', () => {
    expect(emailAddress.parse(' name@example.com ')).toBe('name@example.com');
    expect(emailAddress.parse('name@example.com\t')).toBe('name@example.com');
  });

  it('keeps the letter case as typed: the column compares without it', () => {
    expect(emailAddress.parse('Name@Example.com')).toBe('Name@Example.com');
  });

  it.each([
    ['a space inside', 'na me@example.com'],
    ['a line break carrying a header', 'name@example.com\r\nBcc: everyone@example.com'],
    ['a line break alone', 'name\n@example.com'],
    ['a null character', 'name\u0000@example.com'],
    ['a quoted local part', '"name"@example.com'],
    ['angle brackets', '<name@example.com>'],
    ['a display name', 'Rojda <name@example.com>'],
    ['two addresses', 'a@example.com,b@example.com'],
    ['a leading dot', '.name@example.com'],
    ['two dots in a row', 'na..me@example.com'],
    ['no top-level domain', 'name@localhost'],
    ['no domain', 'name@'],
    ['no @', 'name.example.com'],
    ['a trailing dot', 'name@example.com.'],
    ['an address longer than mail allows', `${'a'.repeat(64)}@${'b'.repeat(190)}.com`],
  ])('refuses %s', (_, email) => {
    expect(accepts(email)).toBe(false);
  });

  it('is what sign-up, sign-in and the reset form use', () => {
    const signUp = {
      email: ' Name+hevalo@Example.com ',
      username: 'rojda',
      password: 'a-strong-password1',
      acceptTerms: true,
      birthYear: 1990,
      birthMonth: 6,
    };
    expect(registerBodySchema.parse(signUp).email).toBe('Name+hevalo@Example.com');
    expect(loginBodySchema.parse({ email: 'name@example.com ', password: 'x' }).email).toBe('name@example.com');
    expect(passwordResetRequestBodySchema.parse({ email: ' name@example.com' }).email).toBe('name@example.com');
  });
});

describe('disposable-domain matching', () => {
  it.each(PROVIDER_DOMAINS)('never flags %s', (domain) => {
    expect(isDisposableEmail(`fixture@${domain}`)).toBe(false);
    expect(isDisposableEmail(`Fixture@${domain.toUpperCase()}`)).toBe(false);
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
    const forms = others.map((d) => normalizeEmailForRegistry(`fixture.address@${d}`));
    expect(new Set(forms).size).toBe(others.length);
    expect(normalizeEmailForRegistry('fixture.address@googlemail.com')).toBe(normalizeEmailForRegistry('fixtureaddress@gmail.com'));
    // Apple's three domains are one inbox to Apple but three addresses here
    expect(normalizeEmailForRegistry('fixture@icloud.com')).not.toBe(normalizeEmailForRegistry('fixture@me.com'));
  });

  it('folds only what delivers to the same inbox', () => {
    expect(normalizeEmailForRegistry('Name+tag@Example.com')).toBe('name@example.com');
    expect(normalizeEmailForRegistry('N.a.m.e+x@googlemail.com')).toBe('name@gmail.com');
    // dots are part of the name everywhere but Gmail
    expect(normalizeEmailForRegistry('first.last@example.com')).not.toBe(normalizeEmailForRegistry('firstlast@example.com'));
    expect(normalizeEmailForRegistry('first.last@example.com')).toBe('first.last@example.com');
  });
});
