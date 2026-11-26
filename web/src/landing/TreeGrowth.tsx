import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { TREE_FIRST_WATER, TREE_GROWTH, TREE_STAGES, TREE_WATER_PER_LESSON, treeSvg, type TreeStage } from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import { stageName } from '../tree/names';
import { prefersReducedMotion } from '../lib/motion';

/**
 * The tree section's picture: a pomegranate tree (a kind anyone can plant first) grown through its seven stages by the
 * scroll itself, as the section passes under the reader, with how many lessons each stage takes by the shared growth
 * rules. The stage dots jump to a stage. Under Reduce Motion the section does not hold the screen, the great tree
 * shows, and the dots choose the stage.
 */
const SPECIES = 'hinar';
const STAGES = Array.from({ length: TREE_STAGES }, (_, i) => i as TreeStage);

/** Lessons since planting to reach a stage: the planting water brings the seed up, then every lesson pours two drops. */
export function lessonsFor(stage: TreeStage): number {
  return Math.max(0, Math.round((TREE_GROWTH[stage] - TREE_FIRST_WATER) / TREE_WATER_PER_LESSON));
}

export function TreeGrowth(): React.JSX.Element {
  const t = useT();
  const id = useId().replace(/[^A-Za-z0-9]/g, '');
  const [still] = useState(prefersReducedMotion);
  const [stage, setStage] = useState<TreeStage>(still ? 6 : 0);
  const box = useRef<HTMLDivElement>(null);
  const layers = useMemo(() => STAGES.map((s) => ({ __html: treeSvg({ species: SPECIES, stage: s, size: 360, idPrefix: `lt${id}${s}` }) })), [id]);

  // The section is taller than the screen and its inside stays put, so how far it has been scrolled through is the stage.
  useEffect(() => {
    const section = box.current?.closest('section');
    if (still || !section || typeof IntersectionObserver === 'undefined') return;
    let frame = 0;
    const read = (): void => {
      frame = 0;
      const r = section.getBoundingClientRect();
      // A jump far past the section (to the top of the page, say) leaves the tree as it last grew.
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      const run = r.height - window.innerHeight;
      const p = run > 0 ? Math.min(1, Math.max(0, -r.top / run)) : 1;
      setStage(Math.min(TREE_STAGES - 1, Math.floor(p * TREE_STAGES)) as TreeStage);
    };
    const onScroll = (): void => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    const io = new IntersectionObserver((entries) => {
      const on = entries[entries.length - 1]?.isIntersecting ?? false;
      if (on) {
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll, { passive: true });
        onScroll();
      } else {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
      }
    });
    io.observe(section);
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [still]);

  /** A dot scrolls to its stage's stretch of the section, or, held still, shows that stage. */
  const show = (s: TreeStage): void => {
    const section = box.current?.closest('section');
    if (still || !section) {
      setStage(s);
      return;
    }
    const top = section.getBoundingClientRect().top + window.scrollY;
    const run = section.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + (run * (s + 0.5)) / TREE_STAGES, behavior: 'smooth' });
  };

  const lessons = lessonsFor(stage);
  return (
    <div className="fp-tree-scene" ref={box}>
      <div className="fp-tree-art" role="img" aria-label={t('landing.tree.label', { stage: stageName(t, stage) })}>
        {layers.map((l, i) => (
          <span key={i} className={`fp-tree-layer${i === stage ? ' is-on' : i < stage ? ' is-past' : ''}`} dangerouslySetInnerHTML={l} />
        ))}
      </div>
      <p className="fp-tree-caption" aria-live="polite">
        <strong>{stageName(t, stage)}</strong>
        <span>{lessons === 0 ? t('landing.tree.firstDay') : t('landing.tree.after', { count: lessons })}</span>
      </p>
      <div className="fp-tree-dots" role="group" aria-label={t('tree.stages')}>
        {STAGES.map((s) => (
          <button key={s} type="button" className={`fp-tree-dot${s === stage ? ' is-on' : s < stage ? ' is-past' : ''}`} aria-pressed={s === stage} aria-label={stageName(t, s)} onClick={() => show(s)} />
        ))}
      </div>
    </div>
  );
}
