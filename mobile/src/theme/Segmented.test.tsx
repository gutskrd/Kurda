// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('./Pressable', () => import('../testing/reach'));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { forgetReach, reachOf } from '../testing/reach';
import { Segmented } from './glass';

/*
 * The segmented control (theme/glass.tsx): how far each segment answers a
 * finger. A segment is drawn inside a 3pt ring of track that used to answer
 * nothing, so a tap on the control's own edge was lost; every segment now
 * reaches over the ring and on to a fingertip's 48, and two segments that
 * touch take nothing from each other.
 */

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  forgetReach();
  localStorage.removeItem('kurda_locale_v1');
});

const THREE = ['lessons', 'games', 'stories'] as const;
const label = (v: string) => v[0]!.toUpperCase() + v.slice(1);

/**
 * The line height a label is drawn with. react-native-web sets it through a
 * class whose rule it adds to the page's styles, and the test page does not
 * work a line height out from a class, so the rule is read instead.
 */
function lineHeightOf(el: Element): string | undefined {
  const cls = [...el.classList].find((c) => c.startsWith('r-lineHeight-'));
  if (!cls) return undefined;
  // the rules can sit inside grouping rules (a media block), so every level is looked through
  const find = (rules: CSSRuleList): string | undefined => {
    for (const rule of rules) {
      if (rule.cssText.startsWith(`.${cls}`)) return /line-height:\s*([^;]+);/.exec(rule.cssText)?.[1]?.trim();
      const inner = (rule as CSSGroupingRule).cssRules;
      const found = inner ? find(inner) : undefined;
      if (found) return found;
    }
    return undefined;
  };
  for (const sheet of document.styleSheets) {
    const found = find(sheet.cssRules);
    if (found) return found;
  }
  return undefined;
}

function draw(props: Partial<React.ComponentProps<typeof Segmented<(typeof THREE)[number]>>> = {}) {
  const onChange = vi.fn();
  renderWithProviders(<Segmented options={THREE} value="lessons" onChange={onChange} labelOf={label} {...props} />);
  return onChange;
}

describe('how far a segment answers a finger', () => {
  it('reaches 9 up and down from a regular 30pt segment, to 48 over the ring and past it', () => {
    draw();
    for (const name of ['Lessons', 'Games', 'Stories']) expect(reachOf(name), name).toMatchObject({ top: 9, bottom: 9 });
  });

  it('reaches 4 up and down from a 40pt one, a labelled or large control’s', () => {
    draw({ groupLabel: 'Show' });
    expect(reachOf('Games')).toMatchObject({ top: 4, bottom: 4 });
    cleanup();
    forgetReach();
    draw({ size: 'large' });
    expect(reachOf('Games')).toMatchObject({ top: 4, bottom: 4 });
  });

  it('covers the ring at the two ends of the track and takes nothing between segments that touch', () => {
    draw();
    expect(reachOf('Lessons')).toEqual({ top: 9, bottom: 9, left: 3, right: 0 });
    expect(reachOf('Games')).toEqual({ top: 9, bottom: 9, left: 0, right: 0 });
    expect(reachOf('Stories')).toEqual({ top: 9, bottom: 9, left: 0, right: 3 });
  });

  it('mirrors its ends for a language read from the right, where the first option is on the right', async () => {
    localStorage.setItem('kurda_locale_v1', 'ckb');
    draw();
    await act(async () => undefined);
    expect(reachOf('Lessons')).toEqual({ top: 9, bottom: 9, left: 0, right: 3 });
    expect(reachOf('Stories')).toEqual({ top: 9, bottom: 9, left: 3, right: 0 });
  });

  it('sets every label on an 18pt line, so the segment’s height is known before it is drawn', () => {
    draw();
    for (const name of ['Lessons', 'Games', 'Stories']) expect(lineHeightOf(screen.getByText(name)), name).toBe('18px');
  });

  it('still chooses the option tapped', () => {
    const onChange = draw();
    fireEvent.click(screen.getByRole('button', { name: 'Stories' }));
    expect(onChange).toHaveBeenCalledWith('stories');
  });
});
