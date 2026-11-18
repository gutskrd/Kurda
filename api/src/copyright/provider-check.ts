import { PROVIDER, isProviderPlaceholder, type ProviderIdentity } from '@kurda/shared';

/**
 * Warnings for provider details the copyright emails show rights holders that still hold their [placeholder] text
 * in production; notifiers are told to write to `copyrightEmail`, so a placeholder leaves them no way to reach
 * us. Logged at boot rather than refusing to start, because the local docker-compose stack also runs as
 * production.
 */
export function providerPlaceholderWarnings(nodeEnv: string, provider: ProviderIdentity = PROVIDER): string[] {
  if (nodeEnv !== 'production') return [];
  const fields: Array<[string, string]> = [
    ['copyrightEmail', provider.copyrightEmail],
    ['dmcaAgent.email', provider.dmcaAgent.email],
  ];
  return fields
    .filter(([, value]) => isProviderPlaceholder(value))
    .map(
      ([name, value]) =>
        `PROVIDER.${name} in shared/src/provider.ts is still the placeholder ${value}: copyright emails tell rights holders to write there. Fill it in before launch.`,
    );
}
