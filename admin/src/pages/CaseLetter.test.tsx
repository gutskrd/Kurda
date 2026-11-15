// @vitest-environment jsdom
/**
 * A reported letter in the case view: its paper and drawing drawn from the
 * shared art, the drawing hidden until the moderator looks, its notes placed
 * on the sheet and listed, and the notes of the letters round it.
 */
import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { PAPER_H, PAPER_W, type EvidenceSnapshot, type LetterDecor } from '@kurda/shared';
import { decorLength, letterDecorOf, notePlacement, paperName } from '../moderation';
import { renderUi } from '../test/render';
import { Snapshot } from './CaseEvidence';

const decor: LetterDecor = {
  paper: { style: 'margin', tone: 'rose', ink: 'crimson' },
  strokes: [{ tool: 'brush', color: 'leaf', width: 30, points: [100, 400, 180, 460, 260, 400] }],
  notes: [
    { text: 'Ji bo te!', x: 500, y: 300, size: 'm', color: 'sun', turn: -8 },
    { text: 'سڵاو', x: 250, y: 900, size: 'l', color: 'navy', turn: 4 },
  ],
};

const snapshot = (over: Partial<EvidenceSnapshot> = {}): EvidenceSnapshot => ({
  targetType: 'letter',
  targetId: '6a1f0000-0000-4000-8000-000000000001',
  capturedAt: new Date().toISOString(),
  author: { id: '7d1c2c1e-0000-4000-8000-0000000000aa', username: 'baran' },
  text: 'Silav! Tu çawa yî?',
  createdAt: new Date().toISOString(),
  status: 'delivered',
  mediaKeys: [],
  decor,
  ...over,
});

/** The sheet's picture, decoded back to the SVG it was drawn from. */
const sheetSvg = (): string => decodeURIComponent((screen.getByRole('img', { name: /Lined with a margin/ }) as HTMLImageElement).src.split(',')[1]!);

describe('the letter’s paper, as data', () => {
  it('reads back a decor only as the letter’s own checks allow, and says when one cannot be drawn', () => {
    expect(letterDecorOf(null)).toEqual({ decor: null, unreadable: false });
    expect(letterDecorOf(undefined)).toEqual({ decor: null, unreadable: false });
    expect(letterDecorOf(decor)).toEqual({ decor, unreadable: false });
    expect(letterDecorOf({ paper: { style: 'lined', tone: 'cream', ink: '"><script>' } })).toEqual({ decor: null, unreadable: true });
    expect(letterDecorOf({ ...decor, strokes: [{ ...decor.strokes[0], points: ['<g/>', 1] }] }).unreadable).toBe(true);
  });

  it('names a paper, and draws as much sheet as the drawing and notes reach', () => {
    expect(paperName(decor.paper)).toBe('Lined with a margin · rose · crimson ink');
    expect(paperName({ style: 'grid', tone: 'night', ink: 'gold' })).toBe('Squared · night · gold ink');
    expect(decorLength(decor)).toBe(PAPER_H);
    expect(decorLength({ ...decor, strokes: [{ ...decor.strokes[0]!, points: [10, 2000] }] })).toBeGreaterThan(2000);
    expect(decorLength({ ...decor, strokes: [{ ...decor.strokes[0]!, points: [10, PAPER_H * 2] }] })).toBe(PAPER_H * 2);
  });

  it('places a note where its writer put it, at its size, turned as it was', () => {
    expect(notePlacement(decor.notes[0]!, PAPER_H)).toEqual({ left: '50%', top: '21.22%', fontSize: '4.2cqw', transform: 'translate(-50%, -50%) rotate(-8deg)' });
    expect(notePlacement({ ...decor.notes[0]!, x: PAPER_W, y: PAPER_H * 2 }, PAPER_H * 2)).toMatchObject({ left: '100%', top: '100%' });
  });
});

describe('a reported letter in the case', () => {
  it('shows its paper and notes at once, and its drawing only when the moderator looks', async () => {
    renderUi(<Snapshot snapshot={snapshot()} media={[]} sensitive={false} />);
    expect(screen.getByText('Silav! Tu çawa yî?')).toBeTruthy();
    expect(screen.getByText('Lined with a margin · rose · crimson ink')).toBeTruthy();
    expect(screen.getByText('Drawn on: 1 line')).toBeTruthy();
    // the paper is drawn, but not yet what is on it
    expect(sheetSvg()).not.toContain('stroke-linecap="round" stroke-linejoin="round"');
    // its notes are on the sheet where they were put, and listed to read
    const list = screen.getByRole('heading', { name: 'The 2 notes on it' }).parentElement!;
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Ji bo te!', 'سڵاو']);
    expect(screen.getAllByText('Ji bo te!')).toHaveLength(2);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Show drawing' }));
    expect(sheetSvg()).toContain('stroke-linecap="round" stroke-linejoin="round"');
    expect(screen.getByRole('img', { name: /drawn on/ })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Hide again' }));
    expect(screen.getByRole('button', { name: 'Show drawing' })).toBeTruthy();
  });

  it('asks first when the case may be about the abuse of a child', async () => {
    renderUi(<Snapshot snapshot={snapshot()} media={[]} sensitive={true} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Show drawing' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/child sexual abuse material/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Show it' }));
    expect(sheetSvg()).toContain('stroke-linecap="round" stroke-linejoin="round"');
  });

  it('says a letter was on the plain paper, or that its paper cannot be drawn, and shows nothing of it for evidence kept before', () => {
    const plain = renderUi(<Snapshot snapshot={snapshot({ decor: null })} media={[]} sensitive={false} />);
    expect(screen.getByText(/plain default paper/)).toBeTruthy();
    plain.unmount();
    const broken = renderUi(<Snapshot snapshot={snapshot({ decor: { paper: 'x' } as never })} media={[]} sensitive={false} />);
    expect(screen.getByText(/cannot be drawn/)).toBeTruthy();
    broken.unmount();
    // evidence frozen before letters had paper has no decor at all
    const older = snapshot();
    delete older.decor;
    renderUi(<Snapshot snapshot={older} media={[]} sensitive={false} />);
    expect(screen.queryByText(/default paper|cannot be drawn|notes on it/)).toBeNull();
  });

  it('lists the notes of the letters round it, and which were drawn on', () => {
    const context = [
      { id: 'a', senderId: 'x', username: 'rojda', kind: 'letter', body: 'Silav!', createdAt: new Date().toISOString(), reported: false, notes: ['Roj baş'], drawn: true },
      { id: 'b', senderId: 'y', username: 'baran', kind: 'letter', body: 'Spas', createdAt: new Date().toISOString(), reported: true },
    ];
    renderUi(<Snapshot snapshot={snapshot({ context })} media={[]} sensitive={false} />);
    const lines = screen.getAllByRole('listitem').filter((li) => li.classList.contains('chat-line'));
    expect(within(lines[0]!).getByText('Roj baş')).toBeTruthy();
    expect(within(lines[0]!).getByText('Drawn on')).toBeTruthy();
    expect(within(lines[1]!).queryByText('Drawn on')).toBeNull();
  });
});
