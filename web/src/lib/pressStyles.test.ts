import { describe, expect, it } from 'vitest';
import postcss, { type AcceptedPlugin } from 'postcss';
import { pressStyles, pressedSelector } from './pressStyles';

const run = (css: string): string => postcss([pressStyles() as unknown as AcceptedPlugin]).process(css, { from: undefined }).css.replace(/\s+/g, ' ').replace(/\s*([{}])\s*/g, '$1').trim();

describe('the styles of pressing and pointing, as the build writes them', () => {
  it('draws a pressed look from the class a real press sets', () => {
    expect(pressedSelector('.btn:active:not(:disabled)')).toBe('.btn.is-pressed:not(:disabled)');
    expect(run('.btn:active{opacity: 0.8}')).toBe('.btn.is-pressed{opacity: 0.8}');
  });

  it('keeps a hover look to pointers that can hover, and leaves the rest of the rule where it was', () => {
    expect(run('.a:hover, .a:focus-visible{color: red}')).toBe('.a:focus-visible{color: red}@media (hover: hover){.a:hover{color: red}}');
    expect(run('.b .c:hover{color: red}')).toBe('@media (hover: hover){.b .c:hover{color: red}}');
  });

  it('leaves a rule already written for hovering or not hovering as it is', () => {
    const touch = '@media (hover: none){.d:hover{color: red}}';
    expect(run(touch)).toBe(touch);
    const fine = '@media (hover: hover) and (pointer: fine){.e:hover{color: red}}';
    expect(run(fine)).toBe(fine);
  });

  it('works inside other conditions too', () => {
    expect(run('@media (max-width: 560px){.f:hover{color: red}}')).toBe('@media (max-width: 560px){@media (hover: hover){.f:hover{color: red}}}');
  });
});
