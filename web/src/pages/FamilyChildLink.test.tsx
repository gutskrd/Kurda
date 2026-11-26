import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FamilyChildLink } from './FamilyChildLink';
import { renderApp, jsonResponse } from '../test/utils';
import { en } from '../i18n/en';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('FamilyChildLink', () => {
  // mail programs and link scanners open links by themselves, so the page only reads what the link is about, names the
  // child, and deletes nothing until the parent confirms
  it('names the child and deletes the profile only when the parent confirms', async () => {
    const acted: unknown[] = [];
    const previewed: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(init.body as string) : null;
        if (url.endsWith('/family/child-link/preview')) {
          previewed.push(body);
          return jsonResponse(200, { action: 'remove', child: { name: 'Rojîn' } });
        }
        if (url.endsWith('/family/child-link')) {
          acted.push(body);
          return jsonResponse(200, { done: 'removed' });
        }
        return jsonResponse(200, {});
      }),
    );
    renderApp(<FamilyChildLink />, ['/family/child?action=remove&token=tok-123']);
    expect(await screen.findByText(en['family.link.removeNamed'].replace('{name}', 'Rojîn'))).toBeInTheDocument();
    expect(previewed).toEqual([{ token: 'tok-123' }]);
    expect(acted).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: en['family.link.removeAction'] }));
    await waitFor(() => expect(acted).toEqual([{ token: 'tok-123', confirm: true }]));
    expect(await screen.findByText(en['family.link.removed'])).toBeInTheDocument();
  });

  it('keeps an unused profile by name, says when one is already gone, and when a link no longer works', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/preview') ? jsonResponse(200, { action: 'keep', child: { name: 'Baran' } }) : jsonResponse(404, { code: 'FAMILY_LINK_INVALID', message: 'no' }),
      ),
    );
    renderApp(<FamilyChildLink />, ['/family/child?action=keep&token=tok-456']);
    expect(await screen.findByText(en['family.link.keepNamed'].replace('{name}', 'Baran'))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: en['family.link.keepAction'] }));
    expect(await screen.findByText(en['family.link.invalid'])).toBeInTheDocument();
  });

  it('says a profile was already deleted, and offers nothing to press', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { action: 'remove', child: null })));
    renderApp(<FamilyChildLink />, ['/family/child?action=remove&token=tok-789']);
    expect(await screen.findByText(en['family.link.gone'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en['family.link.removeAction'] })).not.toBeInTheDocument();
  });

  it('says an old or changed link no longer works before anything is offered', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, { code: 'FAMILY_LINK_INVALID', message: 'no' })));
    renderApp(<FamilyChildLink />, ['/family/child?action=remove&token=tok-old']);
    expect(await screen.findByText(en['family.link.invalid'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en['family.link.removeAction'] })).not.toBeInTheDocument();
  });
});
