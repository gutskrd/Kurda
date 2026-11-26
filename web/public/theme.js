/*
 * The reader's colour scheme, set before the first paint. The front page arrives already drawn (scripts/prerender.ts),
 * so without this a reader who chose light would see it dark until the app starts. The same rules as src/theme/theme.ts:
 * dark unless light was chosen, or "system" was chosen on a light device.
 */
(function () {
  try {
    var choice = localStorage.getItem('hevalo_theme');
    var light = choice === 'light' || (choice === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches);
    var scheme = light ? 'light' : 'dark';
    var root = document.documentElement;
    root.setAttribute('data-theme', scheme);
    root.style.colorScheme = scheme;
    var bar = document.querySelector('meta[name="theme-color"]');
    if (bar && light) bar.setAttribute('content', '#F7F9FA');
  } catch (e) {
    // Site data is blocked: the default, dark, stands until the app starts.
  }
})();
