import { describe, expect, it } from 'vitest';
import { isScannerProbe } from './scanner-paths.js';

describe('a scanner’s probe', () => {
  it('is any PHP or other server script, wherever it sits', () => {
    for (const path of ['/index.php', '/wp-login.php', '/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php', '/a/b/shell.PHP7', '/cgi-bin/luci', '/default.aspx', '/backup.sql', '/config.yml']) {
      expect(isScannerProbe(path), path).toBe(true);
    }
  });

  it('is a dot-file, a WordPress or database page, or another server’s admin', () => {
    for (const path of ['/.env', '/.git/config', '/.aws/credentials', '/wp-admin/', '/wp-content/plugins/x', '/phpmyadmin/', '/server-status', '/actuator/health', '/xmlrpc']) {
      expect(isScannerProbe(path), path).toBe(true);
    }
  });

  it('is a query only an attack on PHP would send', () => {
    expect(isScannerProbe('/', '?-d+allow_url_include%3d1+-d+auto_prepend_file%3dphp://input')).toBe(true);
    expect(isScannerProbe('/app', '?file=../../etc/passwd')).toBe(true);
    expect(isScannerProbe('/%E0%A4%A')).toBe(true);
  });

  it('is never one of Hevalo’s own addresses', () => {
    for (const path of [
      '/',
      '/app/learn',
      '/app/library/6c1f0a7e-4d2b-4a3e-9a51-0e7c2b1f9d10',
      '/ferheng/ku-en/av',
      '/dictionary/en/water',
      '/.well-known/apple-app-site-association',
      '/sitemap.xml',
      '/robots.txt',
      '/assets/index-3f9a2c1b.js',
      '/cosmetics/icons/made-01-hinar.png',
      '/auth/login',
      '/admin/security/events',
      '/u/rojîn_k',
    ]) {
      expect(isScannerProbe(path), path).toBe(false);
    }
    expect(isScannerProbe('/search', '?q=av%20%C3%AA')).toBe(false);
  });
});
