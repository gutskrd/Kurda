// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from './ErrorBoundary';
import { renderUi } from './test/render';

let broken = true;
function Page({ name }: { name: string }): React.JSX.Element {
  if (broken) throw new Error(`${name} fell over`);
  return <h1>{name}</h1>;
}

afterEach(() => {
  broken = true;
  vi.restoreAllMocks();
});

describe('a page that crashes', () => {
  it('says so in the page area, with the message, and tries again on request', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderUi(
      <ErrorBoundary resetKey="economy">
        <Page name="Economy" />
      </ErrorBoundary>,
    );
    expect(screen.getByText('This page hit an error').closest('[role="alert"]')).not.toBeNull();
    expect(screen.getByText('Economy fell over')).toBeInTheDocument();
    broken = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('heading', { name: 'Economy' })).toBeInTheDocument();
  });

  it('clears the error when another page opens', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const page = renderUi(
      <ErrorBoundary resetKey="economy">
        <Page name="Economy" />
      </ErrorBoundary>,
    );
    expect(screen.getByText('This page hit an error')).toBeInTheDocument();
    broken = false;
    page.rerender(
      <ErrorBoundary resetKey="fraud">
        <Page name="Fraud" />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('heading', { name: 'Fraud' })).toBeInTheDocument();
  });
});
