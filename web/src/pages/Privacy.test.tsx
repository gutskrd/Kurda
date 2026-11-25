import { afterEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { APP_LOCALES } from '@kurda/shared';
import { preloadCatalogue } from '../i18n/catalogues';
import type { Catalogue } from '../i18n/en';
import { en } from '../i18n/en';
import { ku } from '../i18n/ku';
import { ckb } from '../i18n/ckb';
import { de } from '../i18n/de';
import { es } from '../i18n/es';
import { fr } from '../i18n/fr';
import { nl } from '../i18n/nl';
import { tr } from '../i18n/tr';
import { ar } from '../i18n/ar';
import { renderApp } from '../test/utils';
import { Privacy } from './Privacy';

afterEach(() => localStorage.clear());

const CATALOGUES: Record<string, Catalogue> = { en, ku, ckb, de, es, fr, nl, tr, ar };

describe('the privacy policy on keeping banned people out', () => {
  it('is written for every language the app speaks, in that language', () => {
    expect(Object.keys(CATALOGUES).sort()).toEqual(APP_LOCALES.map((l) => l.code).sort());
    for (const [code, catalogue] of Object.entries(CATALOGUES)) {
      const text = catalogue['privacy.safety.returns'];
      expect(text, code).toBeTruthy();
      if (code !== 'en') expect(text, code).not.toBe(en['privacy.safety.returns']);
      // Hashed, and named so: the word is kept beside each language's own.
      expect(text, code).toMatch(/hash|hach/i);
      // The retention it points to is the section that states it, by that section's own title.
      expect(text, code).toContain(catalogue['privacy.retention.title']!);
    }
  });

  it('says that an address alone never decides, a person does when unsure, and how long it is kept', () => {
    const text = en['privacy.safety.returns'];
    expect(text).toMatch(/internet address alone is never enough/);
    expect(text).toMatch(/whenever a match is unclear, a person decides/);
    expect(text).toMatch(/only while the ban or suspension lasts/);
    expect(text).toMatch(/download a copy of your data or delete your account/);
    // The times it points to are the ones the policy already states.
    expect(en['privacy.retention.body']).toMatch(/90 days.*a year for anything suspicious.*30 days.*180 days/);
  });

  it('sits under Keeping it safe, after how content is checked', () => {
    renderApp(<Privacy />);
    const section = screen.getByRole('heading', { name: 'Keeping it safe' }).closest('section')!;
    const paragraphs = within(section).getAllByText(/./, { selector: 'p' });
    expect(paragraphs.map((p) => p.textContent)).toEqual([en['privacy.safety.body'], en['privacy.safety.returns']]);
  });

  it('reads in Soranî on the page itself', async () => {
    localStorage.setItem('hevalo_locale', 'ckb');
    await preloadCatalogue();
    renderApp(<Privacy />);
    expect(await screen.findByText(ckb['privacy.safety.returns']!)).toBeInTheDocument();
  });
});

describe('the privacy policy on children', () => {
  it('has its own section, linked to directly, with what a child profile holds and how long', () => {
    const { container } = renderApp(<Privacy />);
    const section = container.querySelector('#children')!;
    expect(section).not.toBeNull();
    const paragraphs = within(section as HTMLElement).getAllByText(/./, { selector: 'p' }).map((p) => p.textContent);
    expect(paragraphs).toEqual([
      en['privacy.children.teens'],
      en['privacy.children.profiles'],
      en['privacy.children.use'],
      en['privacy.children.parents'],
    ]);
  });

  it('states the promises the product keeps for children', () => {
    expect(en['privacy.children.profiles']).toMatch(/child of 6 to 12/);
    expect(en['privacy.children.profiles']).toMatch(/never asks a child for an email address, phone number, photo, voice recording or location/);
    expect(en['privacy.children.use']).toMatch(/never used for advertising, never sold/);
    expect(en['privacy.children.use']).toMatch(/Nothing can be bought on a child profile/);
    expect(en['privacy.children.parents']).toMatch(/unused for 12 months is deleted/);
  });

  it('names where the data is kept, how long, and the right to complain', () => {
    expect(en['privacy.processors.body']).toMatch(/United States/);
    expect(en['privacy.processors.body']).toMatch(/standard contractual clauses/);
    expect(en['privacy.control.body']).toMatch(/Autoriteit Persoonsgegevens/);
    expect(en['privacy.retention.body']).toMatch(/14-day grace period/);
  });
});
