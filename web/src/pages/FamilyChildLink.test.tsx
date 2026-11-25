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
  // mail programs open links by themselves, so the page waits for the parent's press
  it('deletes the profile only when the button is pressed', async () => {
    const calls: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/family/child-link')) {
          calls.push(init?.body ? JSON.parse(init.body as string) : null);
          return jsonResponse(200, { done: 'removed' });
        }
        return jsonResponse(200, {});
      }),
    );
    renderApp(<FamilyChildLink />, ['/family/child?action=remove&token=tok-123']);
    expect(await screen.findByText(en['family.link.removeTitle'])).toBeInTheDocument();
    expect(calls).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: en['family.link.removeAction'] }));
    await waitFor(() => expect(calls).toEqual([{ token: 'tok-123' }]));
    expect(await screen.findByText(en['family.link.removed'])).toBeInTheDocument();
  });

  it('keeps an unused profile, and says when a link no longer works', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/family/child-link') ? jsonResponse(404, { code: 'FAMILY_LINK_INVALID', message: 'no' }) : jsonResponse(200, {}),
      ),
    );
    renderApp(<FamilyChildLink />, ['/family/child?action=keep&token=tok-456']);
    await userEvent.click(await screen.findByRole('button', { name: en['family.link.keepAction'] }));
    expect(await screen.findByText(en['family.link.invalid'])).toBeInTheDocument();
  });
});
