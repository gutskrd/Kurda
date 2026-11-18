import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { I18nProvider } from '../i18n/I18nProvider';
import { en } from '../i18n/en';
import { dialectName } from '../learn/map';
import { VarietySwitch } from '../lore/LoreParts';
import { SegmentedChoice } from '../shop/ItemBrowser';
import { BoardSwitch } from './BoardSwitch';

/*
 * Segmented controls over real radios. A segment cannot clip itself, since its touch area reaches past its edges
 * (styles/reach.css), so its text sits in a label of its own that does the ellipsis.
 */

/** Each segment of a control, with the words its label holds. */
function labels(container: HTMLElement): Array<string | null> {
  return [...container.querySelectorAll('.seg-btn')].map((segment) => {
    const own = segment.querySelectorAll(':scope > .seg-btn-label');
    return own.length === 1 ? own[0]!.textContent : null;
  });
}

describe('a segmented control', () => {
  it('puts the words of each board in a label of their own', () => {
    const { container } = render(
      <I18nProvider>
        <BoardSwitch value="zer" onChange={() => {}} />
      </I18nProvider>,
    );
    expect(labels(container)).toEqual([en['rankings.board.xp'], 'Zêr', en['rankings.board.gewher']]);
  });

  it('puts the name of each variety in a label of its own', () => {
    const { container } = render(
      <I18nProvider>
        <VarietySwitch value="kmr" onChange={() => {}} />
      </I18nProvider>,
    );
    expect(labels(container)).toEqual([dialectName('kmr'), dialectName('ckb')]);
  });

  it('puts the words of each choice in a label of their own', () => {
    const { container } = render(
      <SegmentedChoice
        label="Show"
        value="all"
        options={[
          { value: 'owned', label: 'Owned' },
          { value: 'all', label: 'All' },
        ]}
        onChange={() => {}}
      />,
    );
    expect(labels(container)).toEqual(['Owned', 'All']);
  });
});
