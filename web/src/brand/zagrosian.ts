/**
 * The Zagrosian mark, for the credit in the footer.
 *
 * Hevalo is a Zagrosian product and the footer should say so, the way a
 * publisher's imprint sits on the last page rather than on the cover.
 *
 * The path is the one zagrosian.com draws itself — its light-on-dark variant,
 * which is the one that belongs on Hevalo's dark footer. Kept as data here
 * rather than as a file in `public/` for one reason: `fill="currentColor"`. An
 * `<img>` cannot inherit a colour, so the mark could not sit muted beside the
 * copyright line and brighten with the rest of the link on hover. Inline SVG
 * can, and it is markup rather than a fetch, so it needs no exception from the
 * `img-src 'self'` the published dictionary is served under.
 *
 * Both footers read it from here — the app's `Footer.tsx` and the dictionary's
 * generated one — so there is one copy of somebody else's trademark in this
 * repository and one place to correct it if they redraw it.
 */

export const ZAGROSIAN_URL = 'https://zagrosian.com';

/** Taller than it is wide; keep the ratio when sizing it. */
export const ZAGROSIAN_VIEWBOX = '0 0 1326 1368';

export const ZAGROSIAN_MARK =
  'm510 34-40 3a593 593 0 0 0-139 19c-4 2-15 5-23 6l-37 12-33 12-45 21c-50 27-95 68-123 112-15 25-25 49-31 81-8 42-8 62 2 102q23 91 125 121c16 5 69 6 92 3 19-4 52-17 67-29a122 122 0 0 0 41-51l6-14 6-16 6-16 5-15 7-17q7-22 26-47a495 495 0 0 0 52-78c7-10 14-24 18-33q10-28 15-31c11-7 29 6 32 25v40c-2 17-5 23-22 59-13 27-14 32-7 36q17 7 93-45l53-37 33-22c59-40 65-44 80-47 27-5 40 15 24 37-9 12-20 21-54 46-11 7-52 40-73 57q-17 13-15 17 2 3 9 1a501 501 0 0 0 71-42l69-42c44-23 46-24 56-24 19 0 31 19 22 35-6 11-24 25-62 47l-23 14-38 26c-55 37-62 42-62 46q1 6 22-3l65-30 48-23c34-17 44-19 55-13s15 19 9 30q-8 12-28 23l-90 51-33 17c-31 16-40 21-42 27q-2 3 1 4 3 5 22-3l19-6 16-5 29-12 13-6 15-6c29-12 48-7 48 12 0 13-8 21-36 35l-99 48a620 620 0 0 0-118 69 308 308 0 0 1-77 30 357 357 0 0 0-57 21c-29 11-144 89-211 142l-28 22c-41 33-93 84-118 115q-33 43-48 76c-6 13-16 42-18 54-2 9-4 40-4 52 2 25 3 29 10 48 6 15 6 17 13 28q42 69 135 101l16 6 23 7 26 6 25 4 32 4c31 4 45 5 274 5a2594 2594 0 0 0 303-8 293 293 0 0 0 62-12l22-6 18-6 37-12 11-4 18-8c21-8 58-28 81-44a342 342 0 0 0 122-147l5-14 10-52c3-26-2-77-12-105-12-35-42-72-75-93-37-22-89-33-128-26-47 8-79 24-108 51-10 10-15 16-39 49-18 25-29 37-45 50-14 11-44 34-57 42-43 28-42 26-120 103l-44 42c-16 12-32 12-40 0-9-12-2-26 29-59q64-66 59-77c-3-6-15 1-45 28q-25 21-36 29c-11 8-21 17-46 39-16 13-42 33-48 36-19 9-37-1-36-21 1-11 3-15 19-30l70-65 22-19c20-16 34-31 33-35q-2-8-36 18a2313 2313 0 0 1-116 81c-42 32-49 35-64 25-11-8-13-26-5-38 5-8 33-31 63-52l24-20 63-49q21-15 22-21 0-6-18 2l-12 5-13 8-41 26c-12 6-36 22-56 35-23 15-34 18-45 15q-15-4-16-19c-1-16 7-26 42-51l85-59c87-59 110-75 112-82 3-8-9-11-28-8-62 12-95 9-116-9q-13-13-9-23c3-7 8-8 26-10q27-3 39-9a381 381 0 0 1 76-22l14-5 22-8c21-9 43-12 87-12q35 0 66-5c19-3 43-13 60-26l17-12a3247 3247 0 0 0 269-200c17-16 40-40 53-56l13-16 24-38c12-22 20-44 27-75 8-38-3-86-28-120a200 200 0 0 0-89-63l-17-7-40-11-26-6c-15-4-33-6-102-11z';
