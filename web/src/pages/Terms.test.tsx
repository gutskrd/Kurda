import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { PROVIDER } from '@kurda/shared';
import { preloadCatalogue } from '../i18n/catalogues';
import { jsonResponse, renderApp } from '../test/utils';
import { Terms } from './Terms';
import { About } from './About';
import { Privacy } from './Privacy';
import { Footer } from '../components/Footer';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const signedOut = () => vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, {})));
const section = (name: string) => screen.getByRole('heading', { level: 2, name }).closest('section')!;

describe('Terms', () => {
  it('opens with the rules in a few short lines', () => {
    signedOut();
    renderApp(<Terms />, ['/terms']);
    const summary = section('In short');
    expect(within(summary).getAllByRole('listitem')).toHaveLength(6);
    expect(within(summary).getByText(/They aren’t real money/)).toBeInTheDocument();
  });

  it('says who provides Hevalo, from the one config file', () => {
    signedOut();
    renderApp(<Terms />, ['/terms']);
    const provider = section('Who provides Hevalo');
    for (const value of [PROVIDER.legalName, PROVIDER.address, PROVIDER.kvk]) {
      expect(within(provider).getByText(value)).toBeInTheDocument();
    }
    expect(within(provider).getByText(`trading as ${PROVIDER.tradingName}`)).toBeInTheDocument();
    // the registered email and telephone, each as a link that opens it
    expect(within(provider).getByRole('link', { name: PROVIDER.email })).toHaveAttribute('href', `mailto:${PROVIDER.email}`);
    expect(within(provider).getByRole('link', { name: PROVIDER.phone })).toHaveAttribute('href', 'tel:+31638066158');
    // the VAT line only once the btw-id is issued, never an empty one
    if (PROVIDER.vat) expect(within(provider).getByText(PROVIDER.vat)).toBeInTheDocument();
    else expect(within(provider).queryByText('VAT number')).toBeNull();
    // nothing still waiting to be filled in
    expect(provider.querySelector('[data-placeholder]')).toBeNull();
  });

  it('has the promise, the narrow licence, notices, repeat infringers, shop art, contacts and the law', () => {
    signedOut();
    renderApp(<Terms />, ['/terms']);
    expect(within(section('Only post what you may')).getByText(/you promise that you made it/)).toBeInTheDocument();
    expect(within(section('What you let us do with it')).getByText(/we don’t sell it or use it in advertising/)).toBeInTheDocument();
    expect(within(section('Copyright notices')).getByRole('link', { name: 'Go to the Copyright page' })).toHaveAttribute('href', '/copyright');
    expect(within(section('Repeated copying')).getByText(/three copyright notices/)).toBeInTheDocument();
    expect(within(section('Shop items')).getByText(/Items you own stay yours/)).toBeInTheDocument();
    // nothing bought with Zêr or gems can be handed back, and the Terms say so
    expect(within(section('Purchases are final')).getByText(/can’t be returned or turned back into Zêr or gems/)).toBeInTheDocument();
    const contact = section('How to reach us');
    expect(within(contact).getByText('For members')).toBeInTheDocument();
    expect(within(contact).getByText(`Write in: ${PROVIDER.authorityContact.languages.join(', ')}`)).toBeInTheDocument();
    expect(within(section('Which law applies')).getByText(/Dutch law/)).toBeInTheDocument();
  });

  it('reads in Soranî too', async () => {
    localStorage.setItem('hevalo_locale', 'ckb');
    await preloadCatalogue();
    signedOut();
    renderApp(<Terms />, ['/terms']);
    expect(screen.getByRole('heading', { level: 2, name: 'بە کورتی' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'کام یاسا جێبەجێ دەکرێت' })).toBeInTheDocument();
  });
});

describe('About', () => {
  it('names the provider and the contact points, and points to the Copyright page', () => {
    signedOut();
    renderApp(<About />, ['/about']);
    const provider = section('Who provides Hevalo');
    expect(within(provider).getByText(PROVIDER.kvk)).toBeInTheDocument();
    expect(within(provider).getByText('For authorities')).toBeInTheDocument();
    expect(within(provider).getByRole('link', { name: 'Copyright' })).toHaveAttribute('href', '/copyright');
  });
});

describe('Privacy', () => {
  it('opens by naming who is responsible for the data and how to reach them', () => {
    signedOut();
    renderApp(<Privacy />, ['/privacy']);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings[0]).toBe('Who is responsible');
    const controller = section('Who is responsible');
    expect(within(controller).getByText(/the “controller” under the GDPR/)).toBeInTheDocument();
    for (const value of [PROVIDER.legalName, PROVIDER.address, PROVIDER.kvk]) {
      expect(within(controller).getByText(value)).toBeInTheDocument();
    }
    expect(within(controller).getByRole('link', { name: PROVIDER.email })).toHaveAttribute('href', `mailto:${PROVIDER.email}`);
  });
});

describe('Footer', () => {
  it('carries the business and its KvK number on every public page, linked to the full details', () => {
    signedOut();
    renderApp(<Footer />, ['/']);
    const imprint = screen.getByRole('link', { name: `${PROVIDER.legalName} · KvK ${PROVIDER.kvk}` });
    expect(imprint).toHaveAttribute('href', '/about#provider');
  });
});
