// @vitest-environment jsdom
/**
 * A case's evidence picture once the API serves it: fetched with the session when shown and shown as a local copy,
 * never by its storage link, and given back when hidden. The route is mocked so the test sees exactly what is fetched.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import type { CaseMediaItem } from '@kurda/shared';
import { setToken } from '../api';
import { bytes, fakeApi, on } from '../test/fetch';
import { renderUi } from '../test/render';
import { EvidenceCaseId, MediaItem } from './CaseEvidence';

vi.mock('../apiImage', async (original) => ({
  ...(await original<typeof import('../apiImage')>()),
  caseEvidenceImagePath: (caseId: string, key: string) => `/admin/test-evidence/${caseId}/${encodeURIComponent(key)}`,
}));

const item: CaseMediaItem = { key: 'posts/2026/a.webp', url: 'https://storage.test/posts/2026/a.webp?sig=1', contentType: 'image/webp', quarantine: null };

beforeEach(() => {
  setToken('tok');
  URL.createObjectURL = vi.fn(() => 'blob:evidence');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  setToken(null);
  vi.unstubAllGlobals();
});

describe('an evidence picture served by the API', () => {
  it('is fetched with the session only when shown, and never by its storage link', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(on('GET', '/admin/test-evidence/c-1/posts%2F2026%2Fa.webp', bytes(new Uint8Array([1, 2, 3]), 'image/webp')));
    const { container } = renderUi(
      <EvidenceCaseId.Provider value="c-1">
        <MediaItem item={item} alt={null} sensitive={false} />
      </EvidenceCaseId.Provider>,
    );
    expect(calls).toHaveLength(0);
    await user.click(within(container).getByRole('button', { name: 'Show picture' }));
    expect(await screen.findByRole('img')).toHaveAttribute('src', 'blob:evidence');
    expect(calls.map((c) => c.path)).toEqual(['/admin/test-evidence/c-1/posts%2F2026%2Fa.webp']);
    await user.click(within(container).getByRole('button', { name: 'Hide again' }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:evidence');
  });

  it('keeps the signed link outside a case, as before', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi();
    const { container } = renderUi(<MediaItem item={item} alt={null} sensitive={false} />);
    await user.click(within(container).getByRole('button', { name: 'Show picture' }));
    expect(await screen.findByRole('img')).toHaveAttribute('src', item.url);
    expect(calls).toHaveLength(0);
  });
});
