import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Meanings } from '@kurda/shared';
import { I18nProvider } from '../i18n/I18nProvider';
import { ForeheadCard } from './WhoAmIStage';

/*
 * Who Am I?'s stage, drawn: Hevalo's silhouette under the card on his
 * forehead. The game itself — asking, guessing, the race — is played in
 * WhoAmI.test.tsx.
 */

// a stand-in word for the card, never shown to a learner
const identity: { word: string; meanings: Meanings } = { word: 'pisîk', meanings: { en: 'cat' } };

function stage(known: typeof identity | null): React.JSX.Element {
  return (
    <I18nProvider>
      <ForeheadCard dialect="kmr" category="animal" identity={known} />
    </I18nProvider>
  );
}

describe('Who Am I?, the stage', () => {
  /**
   * The stage draws itself again with every question asked, and when the card
   * turns over. The silhouette has not changed, so it stays the node it was:
   * put in again, the whole of Hevalo would be parsed afresh under a card that
   * is in the middle of turning.
   */
  it('leaves Hevalo’s silhouette in place when the stage is drawn again and when the card turns over', () => {
    const { rerender, container } = render(stage(null));
    const silhouette = container.querySelector('.wa-silhouette > svg');
    expect(silhouette).not.toBeNull();
    rerender(stage(null));
    expect(container.querySelector('.wa-silhouette > svg')).toBe(silhouette);
    rerender(stage(identity));
    expect(screen.getByText('pisîk')).toBeInTheDocument();
    expect(container.querySelector('.wa-card')).toHaveClass('is-turned');
    expect(container.querySelector('.wa-silhouette > svg')).toBe(silhouette);
    expect(silhouette!.isConnected).toBe(true);
  });
});
