/**
 * The addresses vulnerability scanners try on every site: PHP scripts, blog-engine and database admin pages, secrets in
 * dot-files, old CGI and server-status pages. Hevalo runs none of these (the API is Node, the website static files behind
 * a small script), so a request for one gets a plain 404 at once, before any route or database is touched, and is counted
 * (the API's scanner shield, the website's edge script). Answering such paths with the app page's 200, as a single-page app
 * does, told scanners something lived there. Deliberately narrow: only what no Hevalo page or file will ever have;
 * `/.well-known/` is the one real dot-folder.
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

/** Query text only an attack on a PHP or CGI server would send. */
const QUERY = /(allow_url_include|auto_prepend_file|php:\/\/|base64_decode|%ADd\+|\beval\(|\/etc\/passwd|\.\.%2f|\.\.\/)/i;

/** Whether a request is a scanner's probe, by its path (a script ending, a dot-file other than `/.well-known/`, another server's segment) or query. */
export function isScannerProbe(pathname: string, search = ''): boolean {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    // A malformed escape is itself a scanner's habit.
    return true;
  }
  const segments = path.toLowerCase().split('/').filter(Boolean);
  if (segments.some((s) => SCRIPT.test(s))) return true;
  if (segments.some((s) => s.startsWith('.') && s !== '.well-known')) return true;
  const first = segments[0];
  if (first && PREFIXES.some((p) => (p.endsWith('-') ? first.startsWith(p) : first === p))) return true;
  return search.length > 0 && QUERY.test(search);
}
