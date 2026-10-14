import { PROVIDER, isProviderPlaceholder, type ProviderIdentity } from '@kurda/shared';

/**
 * The provider details the copyright emails put in front of rights holders,
 * still holding their [placeholder] text, in production.
 *
 * The receipt, the decision and the counter-notice's copy all tell the notifier
 * to write to `copyrightEmail` — the counter-notice's copy to say they have gone
 * to court, which is the only way to stop a post coming back. A bracketed
 * placeholder there leaves a real notifier with no way to reach Hevalo.
 *
 * The server logs these at boot rather than refusing to start: the local
 * docker-compose stack runs as production too (config/env.ts), and a contact
 * detail not yet filled in should not take lessons down for everyone. The
 * Terms, About and /copyright pages show the same placeholders as they are.
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
