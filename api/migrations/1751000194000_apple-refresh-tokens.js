/**
 * The refresh token Sign in with Apple issues, kept so it can be revoked.
 *
 * - `oauth_identities.refresh_token_sealed`: for an Apple identity, the
 *   refresh token the server got by exchanging the authorization code the app
 *   sent at sign-in, encrypted (api/src/security/at-rest.ts; never stored in
 *   the clear). When the account is deleted for good it is handed back to
 *   Apple to revoke, as App Store guideline 5.1.1(v) requires, and the row is
 *   deleted with it. Null for Google, for identities linked before this, and
 *   wherever Apple's key is not configured or the exchange failed.
 */

export const up = (pgm) => {
  pgm.addColumns('oauth_identities', {
    refresh_token_sealed: { type: 'text' },
  });
};

export const down = (pgm) => {
  pgm.dropColumns('oauth_identities', ['refresh_token_sealed']);
};
