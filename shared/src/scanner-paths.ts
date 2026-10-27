/**
 * The addresses vulnerability scanners try on every site they find: PHP
 * scripts (the October 2026 "PHP2Shell" wave sent millions of these to every
 * server on the internet), WordPress and database admin pages, secrets left in
 * dot-files, old CGI and server-status pages.
 *
 * Hevalo runs no PHP, no WordPress and no CGI: the API is Node and the website
 * is static files behind a small script. None of these can ever be a real page
 * here, so a request for one is answered at once with a plain 404, before any
 * page, route or database is touched, and counted (the API's scanner shield,
 * the website's edge script). Answering the website's own app page with 200, as
 * a single-page app does for every unknown address, told scanners that
 * something lived at /wp-login.php and kept them coming back.
 *
 * Deliberately narrow: an address is a probe only by something no Hevalo page
 * or file will ever have. `/.well-known/` is the one dot-folder that is real.
 */

/** File endings of server-side scripts this site never runs. */
const SCRIPT = /\.(php\d?|phtml|phar|inc|asp|aspx|ashx|jsp|jspx|cgi|pl|py|sh|bak|old|sql|swp|env|ini|log|yml|yaml|config)$/i;

/** First path segments that only exist on other kinds of server. */
const PREFIXES = [
  'wp-',
  'wordpress',
  'xmlrpc',
  'phpmyadmin',
  'phpmyadmin2',
  'pma',
  'myadmin',
  'mysqladmin',
  'adminer',
  'cgi-bin',
  'vendor',
  'phpunit',
  'laravel',
  'telescope',
  'server-status',
  'server-info',
  'actuator',
  'boaform',
  'hnap1',
  'owa',
  'autodiscover',
  'ecp',
  'solr',
  'jenkins',
  'manager',
  'shell',
  'webshell',
  'filemanager',
] as const;

/** Text in a query that only an attack on a PHP or CGI server would send. */
const QUERY = /(allow_url_include|auto_prepend_file|php:\/\/|base64_decode|%ADd\+|\beval\(|\/etc\/passwd|\.\.%2f|\.\.\/)/i;

/**
 * Whether a request is a scanner's probe: by its path (a script ending, a
 * dot-file other than `/.well-known/`, a first segment from another kind of
 * server) or by what its query carries.
 */
export function isScannerProbe(pathname: string, search = ''): boolean {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    // a malformed escape is itself a scanner's habit
    return true;
  }
  const segments = path.toLowerCase().split('/').filter(Boolean);
  if (segments.some((s) => SCRIPT.test(s))) return true;
  if (segments.some((s) => s.startsWith('.') && s !== '.well-known')) return true;
  const first = segments[0];
  if (first && PREFIXES.some((p) => (p.endsWith('-') ? first.startsWith(p) : first === p))) return true;
  return search.length > 0 && QUERY.test(search);
}
