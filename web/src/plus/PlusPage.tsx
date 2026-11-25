import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  MEMBERS_BOX_FREE_GIFTS,
  MEMBERS_BOX_ZER,
  PLUS_PLANS,
  formatEuros,
  planMonthlyCents,
  planSavingPercent,
  plusHeroFigure,
  plusHeroSky,
  plusHeroSparkles,
  type PlusPlan,
  type PlusPlanId,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useLocale, useT } from '../i18n/I18nProvider';
import { useDarkPage } from '../theme/useDarkPage';
import { CloseButton } from '../components/CloseButton';
import { PlusButton } from '../components/PlusButton';
import { CheckIcon, GiftIcon, IceIcon, MembersIcon, PaletteIcon, SparkleIcon, UsersIcon } from '../components/icons';
import type { MessageKey } from '../i18n/en';
import './plus.css';

/** The most a family plan covers, the buyer included. */
const FAMILY_PEOPLE = PLUS_PLANS.find((p) => p.id === 'family')!.people;
const MONTHLY = PLUS_PLANS.find((p) => p.id === 'monthly')!;

/**
 * The Hevalo+ page: the deer under a warm sky, what members get today, the three plans with the price each one bills
 * standing largest, and the gold button with the renewal terms, restore and the legal links beneath it. The website
 * sells nothing, so the button says where Hevalo+ is bought. A child's profile never sees it.
 */
export function PlusPage(): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const navigate = useNavigate();
  const { user } = useAuth();
  const dark = useDarkPage();
  const [chosen, setChosen] = useState<PlusPlanId>('yearly');
  const [told, setTold] = useState(false);
  const art = useMemo(
    () => ({
      sky: { __html: plusHeroSky({ dark, idPrefix: 'plus-page-sky' }) },
      figure: { __html: plusHeroFigure({ idPrefix: 'plus-page-deer' }) },
      sparkles: { __html: plusHeroSparkles({ dark }) },
    }),
    [dark],
  );
  if (user?.kind === 'child') return <Navigate to="/app/learn" replace />;

  const price = (cents: number): string => formatEuros(cents, locale);
  const perks: { icon: React.JSX.Element; text: string }[] = [
    { icon: <GiftIcon size={22} />, text: t('plus.perk.box', { zer: MEMBERS_BOX_ZER, gifts: MEMBERS_BOX_FREE_GIFTS }) },
    { icon: <SparkleIcon size={22} weight="regular" />, text: t('plus.perk.earn') },
    { icon: <IceIcon size={22} />, text: t('plus.perk.streak') },
    { icon: <PaletteIcon size={22} />, text: t('plus.perk.looks') },
    { icon: <UsersIcon size={22} />, text: t('plus.perk.family', { count: FAMILY_PEOPLE }) },
  ];

  return (
    <main className="plus-page">
      <div className="plus-hero" aria-hidden="true">
        <span className="plus-hero-layer" dangerouslySetInnerHTML={art.sky} />
        <span className="plus-hero-layer plus-hero-figure" dangerouslySetInnerHTML={art.figure} />
        <span className="plus-hero-layer plus-hero-sparkles" dangerouslySetInnerHTML={art.sparkles} />
      </div>
      <CloseButton className="plus-close" label={t('common.close')} onClick={() => navigate(-1)} />
      <div className="plus-body">
        <header className="plus-head">
          <h1 className="plus-wordmark">
            <MembersIcon size={28} />
            {t('profile.premium')}
          </h1>
          <p className="plus-promise">{t('plus.promise')}</p>
        </header>
        <ul className="plus-perks">
          {perks.map((perk) => (
            <li key={perk.text} className="plus-perk">
              <span className="plus-perk-icon">{perk.icon}</span>
              <span>{perk.text}</span>
            </li>
          ))}
        </ul>
        <div className="plus-plans" role="radiogroup" aria-label={t('plus.choosePlan')}>
          {PLUS_PLANS.map((plan) => (
            <PlanCard key={plan.id} plan={plan} chosen={plan.id === chosen} onChoose={() => setChosen(plan.id)} price={price} t={t} />
          ))}
        </div>
        <PlusButton label={t('plus.cta')} onJoin={() => setTold(true)} />
        {told ? (
          <p className="plus-told" role="status">
            {t('plus.webNote')}
          </p>
        ) : null}
        <p className="plus-fine">{t('plus.renews')}</p>
        <p className="plus-links">
          <button type="button" className="plus-link" onClick={() => setTold(true)}>
            {t('plus.restore')}
          </button>
          <span aria-hidden="true">·</span>
          <Link className="plus-link" to="/terms">
            {t('footer.terms')}
          </Link>
          <span aria-hidden="true">·</span>
          <Link className="plus-link" to="/privacy">
            {t('footer.privacy')}
          </Link>
        </p>
      </div>
    </main>
  );
}

/** One plan to choose: what it bills, standing largest, then what that is a month, its saving or the people it covers. */
function PlanCard({
  plan,
  chosen,
  onChoose,
  price,
  t,
}: {
  plan: PlusPlan;
  chosen: boolean;
  onChoose: () => void;
  price: (cents: number) => string;
  t: ReturnType<typeof useT>;
}): React.JSX.Element {
  const name: MessageKey = plan.id === 'yearly' ? 'plus.plan.yearly' : plan.id === 'monthly' ? 'plus.plan.monthly' : 'plus.plan.family';
  const billed = t(plan.period === 'year' ? 'plus.price.year' : 'plus.price.month', { price: price(plan.priceCents) });
  const saving = plan.id === 'yearly' ? planSavingPercent(plan, MONTHLY) : 0;
  const lines = [
    plan.period === 'year' ? t('plus.price.month', { price: price(planMonthlyCents(plan)) }) : null,
    plan.introCents !== undefined ? t('plus.firstMonth', { price: price(plan.introCents) }) : null,
    plan.people > 1 ? t('plus.people', { count: plan.people }) : null,
  ].filter((line): line is string => line !== null);
  return (
    <button type="button" role="radio" aria-checked={chosen} className={`plus-plan${chosen ? ' is-chosen' : ''}`} onClick={onChoose}>
      <span className="plus-plan-top">
        <span className="plus-plan-name">{t(name)}</span>
        {saving > 0 ? <span className="plus-plan-badge">{t('plus.bestValue')}</span> : null}
        <span className="plus-plan-tick" aria-hidden="true">
          {chosen ? <CheckIcon size={14} /> : null}
        </span>
      </span>
      <span className="plus-plan-price">{billed}</span>
      <span className="plus-plan-lines">
        {lines.join(' · ')}
        {saving > 0 ? <span className="plus-plan-save">{t('plus.save', { percent: saving })}</span> : null}
      </span>
    </button>
  );
}
