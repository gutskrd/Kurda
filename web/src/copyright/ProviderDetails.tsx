import { PROVIDER, isProviderPlaceholder } from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import './copyright.css';

/*
 * Who provides Hevalo and how to reach them, read from the one file the owner
 * fills in (shared/src/provider.ts). The Terms, About and /copyright show the
 * same block, so a changed address is changed everywhere at once.
 *
 * A detail still in [square brackets] is shown exactly as it is, marked: a
 * missing KvK number should be obvious on the page, not quietly left out.
 */

/**
 * One detail; a placeholder keeps its brackets and is marked as one. Its
 * direction is its own (a Dutch address under a Soranî label still reads left
 * to right), and numbers are always left to right.
 */
function Value({ value, ltr = false }: { value: string; ltr?: boolean }): React.JSX.Element {
  const placeholder = isProviderPlaceholder(value);
  return (
    <span className={placeholder ? 'cr-placeholder' : undefined} dir={ltr ? 'ltr' : 'auto'} data-placeholder={placeholder || undefined}>
      {value}
    </span>
  );
}

/** An email address, as a link once it is a real one. */
export function Email({ address }: { address: string }): React.JSX.Element {
  if (isProviderPlaceholder(address)) return <Value value={address} ltr />;
  return (
    <a className="doc-link" href={`mailto:${address}`} dir="ltr">
      {address}
    </a>
  );
}

/** Name, address, KvK, VAT, email (Art. 3:15d BW). */
export function ProviderIdentityBlock(): React.JSX.Element {
  const t = useT();
  return (
    <dl className="cr-facts">
      <dt>{t('provider.name')}</dt>
      <dd>
        <Value value={PROVIDER.legalName} />
        <span className="cr-langs">{t('provider.tradingAs', { name: PROVIDER.tradingName })}</span>
      </dd>
      <dt>{t('provider.address')}</dt>
      <dd>
        <Value value={PROVIDER.address} />
      </dd>
      <dt>{t('provider.kvk')}</dt>
      <dd>
        <Value value={PROVIDER.kvk} ltr />
      </dd>
      <dt>{t('provider.vat')}</dt>
      <dd>
        <Value value={PROVIDER.vat} ltr />
      </dd>
      <dt>{t('provider.email')}</dt>
      <dd>
        <Email address={PROVIDER.email} />
      </dd>
    </dl>
  );
}

/** The contact points for members (DSA Art. 12) and for authorities (Art. 11), with their languages. */
export function ContactPoints(): React.JSX.Element {
  const t = useT();
  return (
    <dl className="cr-facts">
      <dt>{t('provider.forMembers')}</dt>
      <dd>
        <Email address={PROVIDER.userContact.email} />
        <span className="cr-langs">{t('provider.languages', { languages: PROVIDER.userContact.languages.join(', ') })}</span>
      </dd>
      <dt>{t('provider.forAuthorities')}</dt>
      <dd>
        <Email address={PROVIDER.authorityContact.email} />
        <span className="cr-langs">
          {t('provider.languages', { languages: PROVIDER.authorityContact.languages.join(', ') })}
        </span>
      </dd>
      <dt>{t('provider.forCopyright')}</dt>
      <dd>
        <Email address={PROVIDER.copyrightEmail} />
      </dd>
    </dl>
  );
}

/** The DMCA designated agent, as registered with the US Copyright Office. */
export function DmcaAgent(): React.JSX.Element {
  const t = useT();
  const a = PROVIDER.dmcaAgent;
  return (
    <dl className="cr-facts">
      <dt>{t('provider.agentName')}</dt>
      <dd>
        <Value value={a.name} />
      </dd>
      <dt>{t('provider.address')}</dt>
      <dd>
        <Value value={a.address} />
      </dd>
      <dt>{t('provider.email')}</dt>
      <dd>
        <Email address={a.email} />
      </dd>
      <dt>{t('provider.phone')}</dt>
      <dd>
        <Value value={a.phone} ltr />
      </dd>
    </dl>
  );
}
