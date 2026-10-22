// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
import { useState } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { SearchField } from './SearchField';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

function Field({ start = '' }: { start?: string }): React.JSX.Element {
  const [value, setValue] = useState(start);
  return <SearchField value={value} onChangeText={setValue} label="Search words" />;
}

const field = (): HTMLElement => screen.getByLabelText('Search words');
const clearButton = (): HTMLElement | null => screen.queryByRole('button', { name: 'Clear search' });

describe('SearchField', () => {
  it('shows the clear button only while there is something to clear', () => {
    renderWithProviders(<Field />);
    expect(clearButton()).toBeNull();
    fireEvent.change(field(), { target: { value: 'silav' } });
    expect(clearButton()).not.toBeNull();
  });

  it('empties the field and leaves the cursor in it, ready for the next search', () => {
    renderWithProviders(<Field start="silav" />);
    fireEvent.click(clearButton()!);
    expect(field()).toHaveProperty('value', '');
    expect(document.activeElement).toBe(field());
    expect(clearButton()).toBeNull();
  });
});
