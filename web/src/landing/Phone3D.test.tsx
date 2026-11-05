import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Phone3D, wantsModelledPhone } from './Phone3D';

/**
 * Which phone the front page draws. The modelled one needs WebGL and is not
 * worth its download on a connection that asked to save data or is slow; in
 * every other case, and in a test, the CSS phone stands as it always has.
 */
describe('the front page phone', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window, 'WebGL2RenderingContext');
    Reflect.deleteProperty(navigator, 'connection');
  });

  const withWebGl = (): void => {
    Object.defineProperty(window, 'WebGL2RenderingContext', { value: function WebGL2RenderingContext() {}, configurable: true });
  };
  const withConnection = (connection: { saveData?: boolean; effectiveType?: string }): void => {
    Object.defineProperty(navigator, 'connection', { value: connection, configurable: true });
  };

  it('keeps the CSS phone where there is no WebGL', () => {
    expect(wantsModelledPhone()).toBe(false);
    const { container } = render(<Phone3D>screen</Phone3D>);
    expect(container.querySelector('.p3d')).not.toHaveClass('is-modelled');
    expect(container.querySelectorAll('.p3d-slab').length).toBeGreaterThan(0);
  });

  it('offers the modelled phone where WebGL is there and the connection is not asked to be spared', () => {
    withWebGl();
    expect(wantsModelledPhone()).toBe(true);
    withConnection({ effectiveType: '4g' });
    expect(wantsModelledPhone()).toBe(true);
  });

  it('spares a reader who asked to save data, or who is on a slow connection', () => {
    withWebGl();
    withConnection({ saveData: true, effectiveType: '4g' });
    expect(wantsModelledPhone()).toBe(false);
    withConnection({ effectiveType: '3g' });
    expect(wantsModelledPhone()).toBe(false);
  });

  it('keeps the screen in the page for a screen reader, whichever body is drawn', () => {
    const { getByText, container } = render(<Phone3D>the path</Phone3D>);
    expect(getByText('the path')).toBeInTheDocument();
    expect(container.querySelector('canvas')).toHaveAttribute('aria-hidden', 'true');
  });
});
