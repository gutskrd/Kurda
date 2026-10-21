/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** the build's version, sent with feedback ("web-<this>"); optional */
  readonly VITE_APP_VERSION?: string;
  /** the sign-in challenge's public site key (auth/challenge.ts); optional */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
