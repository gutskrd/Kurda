/** "1:05": a point in a recording as minutes and seconds, the same in every language, for players' clocks and seek lines. */
export function clockText(ms: number): string {
  const whole = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}
