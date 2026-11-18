// @vitest-environment jsdom
/**
 * A source's address is text an editor typed, and the phone opens any address it has an app for, so only an https one
 * is a link and any other source reads as plain text.
 */
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { Linking } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoryDetail } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { StorySources } from '../stories/Afterword';
import { SourcesList } from './parts';
import { openableSourceUrl } from './sourceLink';

vi.hoisted(() => {
  window.matchMedia ??= ((media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('openableSourceUrl', () => {
  it('opens an https address, and nothing else', () => {
    expect(openableSourceUrl('https://example.org/dimdim')).toBe('https://example.org/dimdim');
    expect(openableSourceUrl('  HTTPS://example.org/a?b=c#d ')).toBe('HTTPS://example.org/a?b=c#d');
    const refused = ['http://example.org/tale', 'javascript:alert(1)', 'hevalo://app/letters', 'tel:+100', 'example.org/tale', 'https://', 'https:///x'];
    for (const url of [...refused, 'https://exa mple.org', '', null, undefined]) {
      expect(openableSourceUrl(url), String(url)).toBeNull();
    }
  });
});

describe('sources as the reader sees them', () => {
  const sources = [
    { title: 'Dimdim', url: 'https://example.org/dimdim' },
    { title: 'Kitêba kevn', url: 'http://example.org/tale' },
    { title: 'Nameyek', url: 'javascript:alert(1)' },
  ];

  it('makes a link only of the https source of a riddle or a proverb, and opens that one', () => {
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(true);
    renderWithProviders(<SourcesList sources={sources} />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(within(links[0]!).getByText('Dimdim')).toBeTruthy();
    // The others are there, as text.
    expect(screen.getByText('Kitêba kevn')).toBeTruthy();
    expect(screen.getByText('Nameyek')).toBeTruthy();
    fireEvent.click(links[0]!);
    expect(open).toHaveBeenCalledWith('https://example.org/dimdim');
  });

  it('does the same for a story’s sources', () => {
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const story = { sources: sources.map((s) => ({ ...s, type: 'literary' })) } as unknown as StoryDetail;
    renderWithProviders(<StorySources story={story} />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    fireEvent.click(links[0]!);
    expect(open).toHaveBeenCalledWith('https://example.org/dimdim');
    expect(open).toHaveBeenCalledTimes(1);
  });
});
