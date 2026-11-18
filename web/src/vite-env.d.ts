/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** The build's version, sent with feedback ("web-<this>"); optional. */
  readonly VITE_APP_VERSION?: string;
  /** The sign-in challenge's public site key (auth/challenge.ts); optional. */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
