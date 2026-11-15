import { describe, it, expect, afterEach, vi } from 'vitest';
import { useState } from 'react';
import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UsernameField } from './UsernameField';
import { renderApp } from '../test/utils';
import { en } from '../i18n/en';

afterEach(() => {
  vi.restoreAllMocks();
});

/** The field as a form holds it: the text in the form's own state, and an outside problem when one is given. */
function Form({ problem = null }: { problem?: string | null }): React.JSX.Element {
  const [name, setName] = useState('');
  return (
    <>
      <UsernameField id="name" label="Username" value={name} onChange={setName} problem={problem} />
      <button type="button">elsewhere</button>
    </>
  );
}

const field = (): HTMLInputElement => screen.getByLabelText('Username');

describe('the username field', () => {
  it('is typed as a name is meant: no capital put on it, nothing corrected, left to right', () => {
    renderApp(<Form />);
    expect(field()).toHaveAttribute('autocapitalize', 'none');
    expect(field()).toHaveAttribute('autocorrect', 'off');
    expect(field()).toHaveAttribute('spellcheck', 'false');
    expect(field()).toHaveAttribute('dir', 'ltr');
    // no length of its own: a name too long is said, not cut short at the next key
    expect(field()).not.toHaveAttribute('maxlength');
    expect(field()).toHaveAccessibleDescription(en['auth.usernameRule'].replace('{min}', '3').replace('{max}', '30'));
  });

  it('writes capitals as lowercase letters as they are typed, the Kurdish ones too', async () => {
    renderApp(<Form />);
    await userEvent.type(field(), 'Hamo ŞÊR');
    expect(field()).toHaveValue('hamo şêr');
  });

  it('keeps the caret where it was when a capital is lowercased in the middle', async () => {
    renderApp(<Form />);
    await userEvent.type(field(), 'hamo');
    field().setSelectionRange(2, 2);
    fireEvent.change(field(), { target: { value: 'haXmo', selectionStart: 3, selectionEnd: 3 } });
    expect(field()).toHaveValue('haxmo');
    expect(field().selectionStart).toBe(3);
  });

  it('reads the capital dotted I as a plain i', async () => {
    renderApp(<Form />);
    await userEvent.type(field(), 'İbrahîm');
    expect(field()).toHaveValue('ibrahîm');
  });

  it('keeps a character it cannot take, and names it under the field at once', async () => {
    renderApp(<Form />);
    await userEvent.type(field(), 'hamo!');
    expect(field()).toHaveValue('hamo!');
    expect(screen.getByText('“!” can’t be in a username.')).toHaveClass('field-problem');
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    await userEvent.clear(field());
    await userEvent.type(field(), 'ha mo');
    expect(screen.getByText(en['error.code.usernameSpaces'])).toBeInTheDocument();
  });

  it('waits until the field is left to say what more typing may still mend', async () => {
    renderApp(<Form />);
    await userEvent.type(field(), 'ha');
    expect(document.querySelector('.field-problem')).toBeNull();
    await userEvent.type(field(), 'mo.');
    expect(document.querySelector('.field-problem')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'elsewhere' }));
    expect(screen.getByText(en['error.code.usernameEdge'])).toHaveClass('field-problem');
    // and stops saying it the moment the name is being mended
    await userEvent.type(field(), 'k');
    expect(document.querySelector('.field-problem')).toBeNull();
  });

  it('says a mark at the start, or two side by side, as soon as it is typed', async () => {
    renderApp(<Form />);
    await userEvent.type(field(), '.h');
    expect(screen.getByText(en['error.code.usernameEdge'])).toBeInTheDocument();
    await userEvent.clear(field());
    await userEvent.type(field(), 'ha._');
    expect(screen.getByText(en['error.code.usernameSideBySide'])).toBeInTheDocument();
  });

  it('types a Kurdish letter from its key where the caret is, and keeps the field', async () => {
    renderApp(<Form />);
    await userEvent.type(field(), 'sr');
    field().setSelectionRange(1, 1);
    await userEvent.click(screen.getByRole('button', { name: en['lesson.keys.insert'].replace('{letter}', 'ê') }));
    expect(field()).toHaveValue('sêr');
    expect(field()).toHaveFocus();
    expect(field().selectionStart).toBe(2);
    // the five letters, lowercase, and no shift
    const keys = screen.getAllByRole('button', { name: /^Type / }).map((b) => b.textContent);
    expect(keys).toEqual(['ç', 'ê', 'î', 'ş', 'û']);
  });

  it('shows a problem from the form in place of its own', async () => {
    renderApp(<Form problem={en['error.code.usernameTaken']} />);
    expect(screen.getByText(en['error.code.usernameTaken'])).toHaveClass('field-problem');
    expect(field().closest('.field')).toHaveClass('has-problem');
  });
});
