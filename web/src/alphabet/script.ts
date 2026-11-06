import { useSearchParams } from 'react-router-dom';
import type { AlphabetScript, AppLocale } from '@kurda/shared';

/**
 * Which dialect a page teaches in: Kurmancî in Latin letters, or Soranî in
 * its own script. The alphabet and the word sets share the choice's shape so
 * a link can carry it (`?script=ckb`), and a reader whose interface is Soranî
 * starts on Soranî without asking. Anything else the link says is ignored.
 */
export function useScript(locale: AppLocale): [AlphabetScript, (s: AlphabetScript) => void] {
  const [params, setParams] = useSearchParams();
  const asked = params.get('script');
  const script: AlphabetScript = asked === 'ckb' || asked === 'kmr' ? asked : locale === 'ckb' ? 'ckb' : 'kmr';
  const set = (s: AlphabetScript): void => {
    const next = new URLSearchParams(params);
    next.set('script', s);
    setParams(next, { replace: true });
  };
  return [script, set];
}
