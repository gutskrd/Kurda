# Cultural events (KUR-090)

Cultural celebrations (Newroz first) are **config, not code**. This is the
template for adding new ones — Yalda, Kurdish Language Day (15 May), harvest —
without a deploy.

## Anatomy of a cultural event

An event has three data pieces, wired by shared keys:

1. **Event definition** — a recurring window, theme, quests, and rewards. Lives
   in `api/content/events/<name>.json` as an *annual template*.
2. **Themed banner** — the `theme` string on the definition. Clients map it to a
   banner/skin (KUR-092 limited-time UI themes).
3. **Cultural mini-lesson** — a normal course authored in the standard content
   format (KUR-041), imported via `content:import`. The event's `lesson` quest
   references it by course `slug`.

## Annual template format

`api/content/events/newroz.json`:

```jsonc
{
  "key": "newroz",           // stable id; rows are seeded as `newroz-<year>`
  "name": "Newroz",          // display name (banner title)
  "type": "cultural",
  "theme": "newroz",         // UI theme ref (KUR-092)
  "month": 3, "day": 21,     // fixed calendar day (UTC) — recurs every year
  "durationDays": 3,
  "priority": 10,            // higher wins when events overlap (KUR-089)
  "lessonCourseSlug": "newroz-culture",
  "quests": [ /* opaque quest config read by KUR-091 */ ],
  "rewards": { "completionBadge": "newroz", "gems": 100 }
}
```

`month`/`day`/`durationDays` drive **recurring-annual scheduling**: the seeder
(`api/src/events/recurrence.ts`) expands the template into one concrete
`events` row per upcoming year. Windows are anchored in **UTC**, so "March 21"
is unambiguous regardless of server locale.

## Seeding

```bash
# preview the windows that would be created (no DB writes)
npm run -w @kurda/api events:seed -- --dry-run

# seed the next 3 occurrences of every template in content/events/
npm run -w @kurda/api events:seed

# a specific file / more years ahead
npm run -w @kurda/api events:seed -- content/events/newroz.json --years=5
```

Seeding is **idempotent** — rows are keyed `<key>-<year>`, so re-running only
refreshes existing rows (via `EventService.upsert`). Run it once a year (or a
few years ahead) so the event always activates on time.

Import the mini-lesson so it's playable:

```bash
npm run -w @kurda/api content:import -- content/events/newroz-lesson.json --publish
```

## Adding a new cultural event

1. Copy `newroz.json` → `<name>.json`; set `key`, `name`, `theme`, `month`,
   `day`, `durationDays`, `quests`, `rewards`.
2. (Optional) author `<name>-lesson.json` in the standard content format and
   reference its course slug from the event's `lesson` quest.
3. `events:seed` to materialize the windows; `content:import --publish` the
   lesson. No code change, no deploy.

The event surfaces automatically through `GET /events/active` (KUR-089), which
returns live events priority-ordered and cached to the next boundary.
