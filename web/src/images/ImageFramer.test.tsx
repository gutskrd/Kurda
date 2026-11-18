import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ImageFramer } from './ImageFramer';
import { WHOLE_PICTURE, ZOOM_RANGE, type Frame } from './frame';

/** Exercised through the frames it emits; what it paints is `cropRect`, tested on its own. */
function show(frame: Frame = WHOLE_PICTURE) {
  const onChange = vi.fn();
  const onSettled = vi.fn();
  render(
    <ImageFramer
      image={{} as unknown as CanvasImageSource}
      iw={4000}
      ih={2250}
      aspect={1}
      frame={frame}
      onChange={onChange}
      onSettled={onSettled}
    />,
  );
  return { onChange, onSettled };
}

describe('ImageFramer', () => {
  it('offers a way to zoom without a wheel or a touchscreen', () => {
    show();
    expect(screen.getByLabelText('Zoom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeInTheDocument();
  });

  it('zooms in, and reports the gesture as finished', async () => {
    const { onChange, onSettled } = show();
    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].zoom).toBeGreaterThan(1);
    // A click is a whole gesture, so it settles at once: one undo step.
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('will not zoom out past the whole picture', async () => {
    show();
    // At zoom 1 the crop already fills the frame.
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
  });

  it('will not zoom in past the limit', () => {
    show({ zoom: ZOOM_RANGE.max, cx: 0.5, cy: 0.5 });
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled();
  });

  it('has nothing to reset until the picture has been moved', () => {
    show();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled();
  });

  it('resets to the whole picture', async () => {
    const onChange = vi.fn();
    const onSettled = vi.fn();
    render(
      <ImageFramer
        image={{} as unknown as CanvasImageSource}
        iw={4000}
        ih={2250}
        aspect={1}
        frame={{ zoom: 3, cx: 0.2, cy: 0.5 }}
        onChange={onChange}
        onSettled={onSettled}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onChange).toHaveBeenCalledWith(WHOLE_PICTURE);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  // fireEvent rather than userEvent: jsdom does not move a range input on userEvent's keys.
  it('drives the zoom while moving, and settles only when let go', () => {
    const { onChange, onSettled } = show();
    const slider = screen.getByLabelText('Zoom');

    fireEvent.change(slider, { target: { value: '180' } });
    fireEvent.change(slider, { target: { value: '260' } });
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[1]![0].zoom).toBeCloseTo(2.6, 5);
    expect(onSettled).not.toHaveBeenCalled();

    fireEvent.pointerUp(slider);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('says how to work it without a mouse', () => {
    show();
    expect(screen.getByRole('application')).toHaveAccessibleName(/arrow keys/i);
  });

  it('shows the crop through a circle when the picture will be an avatar', () => {
    render(
      <ImageFramer
        image={{} as unknown as CanvasImageSource}
        iw={1000}
        ih={1000}
        aspect={1}
        frame={WHOLE_PICTURE}
        onChange={vi.fn()}
        round
      />,
    );
    expect(screen.getByRole('application').className).toContain('is-round');
  });

  it('does nothing at all while busy', async () => {
    const onChange = vi.fn();
    render(
      <ImageFramer
        image={{} as unknown as CanvasImageSource}
        iw={4000}
        ih={2250}
        aspect={1}
        frame={WHOLE_PICTURE}
        onChange={onChange}
        busy
      />,
    );
    expect(screen.getByLabelText('Zoom')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
