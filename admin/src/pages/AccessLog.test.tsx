// @vitest-environment jsdom
/**
 * The Access log against a fake API: the safety reviews open now with why, then each reading, newest first, saying
 * who opened whose letters or messages and why, never what they said or with whom, and older entries when asked.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import type { AccessLogEntry, AccessLogPage, SafetyReview } from '@kurda/shared';
import { setToken } from '../api';
import { failure, fakeApi, json, on } from '../test/fetch';
import { CASE_ID, SUBJECT_ID } from '../test/moderation';
import { renderUi } from '../test/render';
import { AccessLog } from './AccessLog';

const HOUR = 3_600_000;
const ago = (h: number): string => new Date(Date.now() - h * HOUR).toISOString();
const NOTE = 'The police asked, with an order, for the letters of this account.';

const open: SafetyReview = {
  id: 'rv-1',
  subject: { id: SUBJECT_ID, username: 'baran' },
  reviewer: { id: 'm-1', username: 'rojin' },
  grantedBy: { id: 'o-1', username: 'owner' },
  reason: 'legal_request',
  note: NOTE,
  caseId: null,
  grantedAt: ago(2),
  expiresAt: ago(-22),
  endedAt: null,
  endedBy: null,
  open: true,
  yours: false,
};

const review = { id: 'rv-1', reason: 'legal_request' as const, note: NOTE, reviewer: open.reviewer, grantedBy: open.grantedBy, expiresAt: open.expiresAt };

function entry(over: Partial<AccessLogEntry>): AccessLogEntry {
  return {
    id: 'e',
    at: ago(1),
    kind: 'read',
    staff: { id: 'm-1', username: 'rojin' },
    subject: { id: SUBJECT_ID, username: 'baran' },
    basis: 'safety_review',
    review,
    caseId: null,
    conversation: null,
    messages: null,
    ...over,
  };
}

const page: AccessLogPage = {
  open: [open],
  entries: [
    entry({ id: 'e-3', at: ago(0.5), kind: 'case', basis: 'flag', review: null, caseId: CASE_ID, staff: { id: 'm-2', username: 'jiyan' }, subject: { id: 'u-2', username: 'dilan' } }),
    entry({ id: 'e-2', kind: 'read', conversation: { kind: 'direct' }, messages: 12 }),
    entry({ id: 'e-1', at: ago(2), kind: 'granted', staff: { id: 'o-1', username: 'owner' } }),
  ],
  nextCursor: 'e-1',
};

afterEach(() => {
  setToken(null);
  vi.unstubAllGlobals();
});

describe('the Access log', () => {
  it('shows the reviews open now with why, then who read whose messages, when and why', async () => {
    setToken('tok');
    fakeApi(on('GET', '/admin/message-access/log?limit=50', json(page)));
    renderUi(<AccessLog />);
    const now = await screen.findByRole('table', { name: 'Safety reviews open now' });
    const row = within(now).getAllByRole('row')[1]!;
    expect(within(row).getByRole('link', { name: '@baran' })).toBeInTheDocument();
    expect(within(row).getByText('A legal request from the authorities')).toBeInTheDocument();
    expect(within(row).getByText(NOTE)).toBeInTheDocument();

    const log = screen.getByRole('table', { name: 'Access log entries' });
    const [, flagged, read, granted] = within(log).getAllByRole('row');
    expect(flagged).toHaveTextContent('Read a flagged letter or message in its case');
    expect(flagged).toHaveTextContent('An automatic safety check flagged it');
    expect(within(flagged!).getByRole('link', { name: `Case ${CASE_ID.slice(0, 8)}` })).toHaveAttribute('href', `#/moderation/${CASE_ID}`);
    expect(read).toHaveTextContent('Read 12 messages in direct messages');
    expect(read).toHaveTextContent('A legal request from the authorities');
    expect(granted).toHaveTextContent('Opened a safety review for @rojin to read');
    expect(granted).toHaveTextContent(NOTE);
  });

  it('shows other admins the reason alone, without the note or the case', async () => {
    setToken('tok');
    const hidden: AccessLogPage = {
      open: [{ ...open, note: null }],
      entries: [
        entry({ id: 'e-3', kind: 'case', basis: 'report', review: null, caseId: null }),
        entry({ id: 'e-1', kind: 'granted', staff: { id: 'o-1', username: 'owner' }, review: { ...review, note: null } }),
      ],
      nextCursor: null,
    };
    fakeApi(on('GET', '/admin/message-access/log?limit=50', json(hidden)));
    renderUi(<AccessLog />);
    const log = await screen.findByRole('table', { name: 'Access log entries' });
    expect(within(log).getByText('Read a reported letter or message in its case')).toBeInTheDocument();
    expect(within(log).queryByRole('link', { name: /^Case / })).not.toBeInTheDocument();
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
    expect(screen.getAllByText('A legal request from the authorities').length).toBe(2);
  });

  it('pages back to older entries only when asked', async () => {
    const user = userEvent.setup();
    setToken('tok');
    const { calls } = fakeApi(
      on('GET', '/admin/message-access/log?limit=50', json(page)),
      on('GET', '/admin/message-access/log?limit=50&before=e-1', json({ open: [], entries: [entry({ id: 'e-0', at: ago(30), kind: 'listed' })], nextCursor: null })),
    );
    renderUi(<AccessLog />);
    await user.click(await screen.findByRole('button', { name: 'Older entries' }));
    expect(await screen.findByText('Looked at the list of their conversations')).toBeInTheDocument();
    expect(calls.map((c) => c.path)).toEqual(['/admin/message-access/log?limit=50', '/admin/message-access/log?limit=50&before=e-1']);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Older entries' })).not.toBeInTheDocument());
  });

  it('says a failed load failed, rather than that nobody read anything', async () => {
    setToken('tok');
    fakeApi(on('GET', '/admin/message-access/log?limit=50', failure(500, 'INTERNAL', 'something broke')));
    renderUi(<AccessLog />);
    expect(await screen.findByRole('button', { name: /Try again/ })).toBeInTheDocument();
    expect(screen.queryByText('Nobody has opened anyone’s letters or messages yet.')).not.toBeInTheDocument();
  });
});
