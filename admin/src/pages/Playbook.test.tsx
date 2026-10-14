// @vitest-environment jsdom
/** The playbook: the hotlines to file with, and the times each priority is given. */
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/dom';
import { CSAM_REPORTING_LINKS } from '@kurda/shared';
import { renderUi } from '../test/render';
import { Playbook } from './Playbook';

describe('the playbook', () => {
  it('links every hotline, says how fast each priority is decided, and never offers a sanction for self-harm', () => {
    renderUi(<Playbook />);
    for (const l of CSAM_REPORTING_LINKS) expect(screen.getByRole('link', { name: l.label })).toHaveAttribute('href', l.url);
    expect(screen.getByText(/decide within 1 h of the first report/)).toBeInTheDocument();
    expect(screen.getByText(/decide within 7 days of the first report/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Someone may hurt themselves' })).toHaveTextContent('helped, never punished');
  });
});
