import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { RailToasts } from './RailToasts';
import type { Arrival } from './useSocialRail';

const arrival = (over: Partial<Arrival> = {}): Arrival => ({
  key: 'n1',
  kind: 'notification',
  title: 'A new badge',
  body: 'You earned Agir.',
  who: null,
  ...over,
});

const shown = (a: Arrival) => render(<RailToasts arrivals={[a]} onDismiss={vi.fn()} onOpen={vi.fn()} />).container;

describe('RailToasts', () => {
  it('draws a badge’s own medal, lit and sparkling, instead of a bell', () => {
    const toast = shown(arrival({ picture: { kind: 'badge', key: 'agir', tier: 2 } }));
    expect(toast.querySelector('.rail-toast.is-reward')).not.toBeNull();
    expect(toast.querySelector('.rail-toast-icon .note-picture--badge svg')).not.toBeNull();
    expect(toast.querySelector('.rail-toast-glow .note-picture--badge')).not.toBeNull();
    expect(toast.querySelectorAll('.rail-toast-spark')).toHaveLength(3);
  });

  it('lights a league’s emblem the same way', () => {
    const toast = shown(arrival({ title: 'Promoted', picture: { kind: 'league', tier: 'gol' } }));
    expect(toast.querySelector('.rail-toast.is-reward .note-picture--league svg')).not.toBeNull();
  });

  it('puts no empty mark on a notification’s corner', () => {
    const badge = shown(arrival({ picture: { kind: 'badge', key: 'agir', tier: 1 } }));
    expect(badge.querySelector('.rail-toast-kind')).toBeNull();
    const plain = shown(arrival({ key: 'n2', title: 'News', picture: null }));
    expect(plain.querySelector('.rail-toast-kind')).toBeNull();
    expect(plain.querySelector('.rail-toast.is-reward')).toBeNull();
  });

  it('shows a letter’s envelope without the reward’s glow', () => {
    const toast = shown(arrival({ title: 'A letter', picture: { kind: 'letter' } }));
    expect(toast.querySelector('.rail-toast-icon.has-picture .note-picture--letter')).not.toBeNull();
    expect(toast.querySelector('.rail-toast-glow')).toBeNull();
  });

  it('keeps the invite’s mark on its corner', () => {
    const toast = shown(arrival({ kind: 'challenge', title: 'A game invite' }));
    expect(toast.querySelector('.rail-toast-kind svg')).not.toBeNull();
  });
});
