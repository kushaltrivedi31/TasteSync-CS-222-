# TasteSync

TasteSync helps college students decide what to eat based on their mood. Pick one of five moods,
or take a short music quiz to find your "food vibe". TasteSync suggests three kinds of food or
cuisine, each with a short reason it fits, and then finds restaurants for them.

**Flow:** pick a mood _or_ take the music quiz → see a suggested food vibe → confirm or change it →
get food recommendations → find restaurants for one of them (Google Maps search with a map, or
the labeled Champaign-Urbana demo list).

The mood-to-food pairings are **curated design choices** written by the team. They are not
scientific findings and are not medical or nutritional advice.

CS 222 project. **Current status:** Phase 1 (manual mood → food recommendations) is done. From
Phase 2, **restaurant suggestions from a curated Champaign-Urbana demo dataset** are done.
Spotify-based mood suggestions were researched and are **not implemented**: Spotify's current
Developer Policy and API access don't permit them for this app. The UI shows an honest
"Not available" note instead (see [Spotify integration](#spotify-integration-not-available)).
The **food vibe quiz** and **Google restaurant search with a map** are implemented and tested with
mocked Google responses. **Live Google verification is still pending** (no real API keys were
used; see [Google verification status](#google-verification-status)).

## Features

### Implemented (Phase 1)

- Five moods: `upbeat`, `calm`, `stressed`, `low-energy`, `adventurous`.
- A deterministic recommendation engine that returns exactly three distinct recommendations per
  mood, read from a version-controlled JSON file.
- An Express API: `POST /api/recommendations` and `GET /api/health`, with Zod validation and a
  consistent JSON error format.
- A responsive React UI. You pick a mood, request recommendations, and see three cards plus a
  "Mood chosen manually" label. It has initial, validation, loading, and error states, and a
  **Try again** button after failures.
- Overlapping requests are handled safely. Only the most recent request updates the screen, and
  results are always labeled with the mood that produced them.
- The last selected mood is remembered in `localStorage` after a refresh (selection only; results
  are not saved or fetched automatically).
- Keyboard support, visible focus states, light and dark color schemes, and a mobile layout.
- Unit, API, and component tests (Vitest, Supertest, React Testing Library) plus Playwright
  browser smoke tests.
- ESLint, Prettier, strict TypeScript, and a GitHub Actions workflow.

### Implemented (Phase 2: restaurant demo)

- A **Find restaurants** button on each food recommendation.
- A city input that defaults visibly to **Champaign-Urbana**. "Champaign", "Urbana",
  "Champaign-Urbana", "Urbana-Champaign", "C-U", and "Chambana" (with or without ", IL") all
  mean the same demo area. Any other city gets an explanation that the demo only covers
  Champaign-Urbana, never made-up results.
- Restaurant results with names, addresses, and source links, labeled **Demo data** and "not a
  live search".
- Loading, no-results, unsupported-city, empty-city, failure, and **Try again** states. Food
  recommendations stay usable when a lookup fails.
- Overlapping lookups are safe: only the latest search updates the screen, and results always show
  the cuisine and city they were searched for. Editing the city after a search shows a note
  instead of relabeling old results.
- `GET /api/restaurants` with Zod validation and exact cuisine-tag matching.

### Implemented: food vibe quiz

- Two starting choices: **Pick your mood** (the original flow, shown by default) and **Find your
  food vibe**.
- A five-question quiz covering music preferences, preferred energy, familiar favorites vs
  discovery, listening occasion, and what you want right now. It shows progress, has **Back**
  (answers are kept) and **Restart quiz**, and asks for an answer before moving on.
- Deterministic, documented scoring in `client/src/quiz/foodVibeQuiz.ts` (see
  [Food vibe quiz scoring](#food-vibe-quiz-scoring)). The suggested vibe is shown with an
  explanation built from your own answers, and with a note when a tie had to be settled.
- You confirm the suggestion or pick a different vibe before any recommendations load. Results
  are labeled "Mood from the food vibe quiz", or "Mood chosen manually (quiz suggested …)" if you
  changed it. The API records this as `source: "quiz"` or `"manual"`.
- The quiz never changes the remembered manual mood. Only the manual mood picker saves a mood.
- It's presented as a playful food match, not a psychological or mood assessment. No Spotify or
  external music data is used.

### Implemented: Google restaurant search and map

- **Google Maps search** is the default restaurant source. Search the selected food in any city,
  or select **Use my location**. The browser asks for your location only after that click, and
  the position is kept in memory only, never saved.
- Results appear as accessible, numbered cards (name, address, **Open in Google Maps** link) and
  as numbered markers on a Google Map that fits all results. **Show on map** highlights a card's
  marker and pans to it. Selecting a marker highlights the matching card and moves focus to it.
- The searched food and location are always shown ("3 places from Google Maps near “Chicago,
  IL”" or "near your current location"). Results never claim a place serves the dish; they say it
  matched a Google search, and to check the menu.
- Places calls and the server key stay on Express (`GET /api/places/search`). The browser only
  gets a separate, referrer-restricted Maps JavaScript key for the map.
- Clear states for: missing server key (with an explicit button to switch to the labeled demo
  list), quota errors, provider errors, timeouts, rate limiting, empty results, denied, timed-out,
  or unavailable location, and a map that is not configured or fails to load. The list always
  works without the map.
- Overlapping searches are safe: only the most recent search can update the screen, and the
  response must match the requested food and city.
- The curated **Champaign-Urbana demo list** is still available as an explicitly selected source,
  labeled "Demo data". It is never shown as Google results or for another city.

### Phase 2: Spotify (researched, shown as unavailable)

- A "Music-based mood suggestions: Not available" note under the mood picker explains why, and
  links to Spotify's Developer Policy. It has no connect button, makes no Spotify requests, and
  never changes the selected or remembered mood.

### Not implemented

- Spotify sign-in, listening data, or music-based mood inference. See
  [Spotify integration](#spotify-integration-not-available) for the specific reasons.
- Restaurant ratings, hours, prices, distance sorting, favorites, or dietary filters.
- Deployment or production hosting.
- See the [Phase 2 checklist](#phase-2-checklist).

## Requirements

- Node.js **22.12 or newer** (the version used in CI is in `.nvmrc`).
- npm 10 or newer (included with Node).

## Getting started

```bash
git clone https://github.com/kushaltrivedi31/TasteSync-CS-222-.git
cd TasteSync-CS-222-
npm ci            # clean install from package-lock.json
npm run dev       # starts the API (port 3001) and the web app (port 5173)
```

Then open <http://localhost:5173>.

During development, Vite forwards every `/api/*` request to the Express server, so the frontend
and backend work together without code changes or CORS setup.

### Optional configuration

Copy `.env.example` to `.env` to change ports or turn on Google search. Everything except Google
search works with no keys at all.

| Variable                   | Default       | Used by                                                                                      |
| -------------------------- | ------------- | -------------------------------------------------------------------------------------------- |
| `PORT`                     | `3001`        | Express server, and the Vite proxy target                                                    |
| `CLIENT_PORT`              | `5173`        | Vite dev and preview server                                                                  |
| `GOOGLE_PLACES_API_KEY`    | _(unset)_     | **Server only.** Places API (New) Text Search. Without it, Google search shows "not set up". |
| `VITE_GOOGLE_MAPS_API_KEY` | _(unset)_     | **Public browser key** for the map. Without it, results show as a list only.                 |
| `VITE_GOOGLE_MAPS_MAP_ID`  | `DEMO_MAP_ID` | Map ID required by Advanced Markers. `DEMO_MAP_ID` is Google's testing ID.                   |

`.env` is gitignored. Never commit real credentials. Only variables starting with `VITE_` reach
the browser, so **never** give the server key a `VITE_` name. Restart `npm run dev` after editing
`.env`. See [Google Maps setup](#google-maps-setup) for how to create the keys.

`GOOGLE_PLACES_API_BASE_URL` is also read by the server, **for automated tests only**: Playwright
points it at a local mock of the Text Search endpoint. Leave it unset otherwise.

## Commands

Run these from the repository root.

| Command                | What it does                                                           |
| ---------------------- | ---------------------------------------------------------------------- |
| `npm run dev`          | Starts the API (auto-restarts on change) and the Vite dev server       |
| `npm test`             | Runs all Vitest suites (server and client)                             |
| `npm run test:e2e`     | Runs the Playwright smoke test (starts both servers itself)            |
| `npm run lint`         | Runs ESLint                                                            |
| `npm run format`       | Formats files with Prettier                                            |
| `npm run format:check` | Checks formatting without changing files                               |
| `npm run typecheck`    | Type-checks the client, server, shared code, and e2e tests             |
| `npm run build`        | Production build: `server/dist` (compiled JS) and `client/dist`        |
| `npm start`            | Runs the built API server (run `npm run build` first)                  |
| `npm run preview`      | Runs the built API and serves the built client (with the `/api` proxy) |
| `npm run check`        | Lint, format check, typecheck, tests, and build in one go              |

Before the first Playwright run, install the browser once:

```bash
npx playwright install chromium
```

You can also run one workspace's tests, for example `npm test -w server` or `npm test -w client`.

## Manual verification

1. Run `npm run dev` and open <http://localhost:5173>.
2. Select **Get recommendations** without choosing a mood. A "Choose a mood first" message
   appears and focus moves to the mood options.
3. Choose **Calm** and select **Get recommendations**. Three cards appear under "Ideas for when
   you're feeling calm", along with **Calm** and **Mood chosen manually** labels.
4. Select **Choose a different mood**, then pick **Adventurous**. The old results stay labeled
   "calm", and a note says you've selected Adventurous. Request again to update the results.
5. Keyboard only: Tab into the mood group, use the arrow keys to change the mood, Tab to the
   button, and press Enter.
6. Error state: stop the dev server with Ctrl+C, restart only the client with
   `npm run dev -w client`, and request recommendations. A "couldn't reach the TasteSync server"
   error appears with a **Try again** button. Start the API again with `npm run dev -w server`
   and select **Try again**.
7. Demo restaurants: with Calm results showing, choose **Champaign-Urbana, IL demo list**, check
   that the city box says "Champaign-Urbana", then select **Find restaurants** on **Ramen**. Oozu
   Ramen Bar and Susuru Ramen Bar appear with addresses, source links, and a "Demo data" label.
8. Select **Find restaurants** on **Café soup and sandwich**. A "no spots in our demo list yet"
   message appears.
9. Change the city to `Chicago` and search again. An explanation says the demo only covers
   Champaign-Urbana, with a button to search Champaign-Urbana instead. Change the city to
   `Urbana` and press Enter to re-run the search.
10. Restaurant failure: with results showing, stop only the API and select **Find restaurants**.
    An error with **Try again** appears, and the food cards stay visible.
11. Quiz: reload, select **Find your food vibe**, and answer the five questions (try **Back**
    partway through; your answer is still selected). The result shows a suggested vibe with an
    explanation. Select **Choose a different vibe**, pick another, then request food ideas. The
    results say "Mood chosen manually (quiz suggested …)". Switch to **Pick your mood**: your
    remembered manual mood is unchanged.
12. Google search **without keys**: choose **Google Maps search** and **Find restaurants**. A
    "Google restaurant search isn't available" message appears, with a button to switch to the
    labeled demo list.
13. Google search **with keys** (pending live verification): see the checklist in
    [Google verification status](#google-verification-status).

## Architecture

```
.
├── shared/
│   ├── moods.ts             # Mood list, labels, mood sources, request/response/error types
│   ├── restaurants.ts       # Cuisine tags, demo area, and demo restaurant response types
│   └── places.ts            # Google search terms per cuisine tag and Places response types
├── server/                  # Express + TypeScript API
│   ├── src/
│   │   ├── data/mood-mappings.json  # Curated mood → food data (edit this to change recommendations)
│   │   ├── data/champaign-urbana-restaurants.json  # Curated demo restaurants with sources
│   │   ├── engine.ts        # Validates the JSON at startup; getRecommendations(mood)
│   │   ├── restaurants.ts   # Validates restaurant data; city aliases; findRestaurants(cuisine)
│   │   ├── places.ts        # Google Places Text Search (New): request, timeout, normalization
│   │   ├── rateLimit.ts     # Small per-client rate limit for /api/places
│   │   ├── app.ts           # createApp(options): routes, Zod validation, error handling (no listen)
│   │   └── index.ts         # Reads PORT and GOOGLE_PLACES_API_KEY and starts the server
│   └── tests/               # Engine unit tests + Supertest API tests (use the real engine)
├── client/                  # React + TypeScript + Vite
│   ├── src/
│   │   ├── App.tsx          # Page layout, start choices, request state machine
│   │   ├── api.ts           # fetch wrappers for recommendations, demo list, and Google search
│   │   ├── quiz/foodVibeQuiz.ts    # Quiz questions and deterministic scoring (pure functions)
│   │   ├── useRestaurantSearch.ts  # Restaurant lookup state (demo or Google); ignores stale responses
│   │   ├── geolocation.ts   # "Use my location" wrapper with typed errors
│   │   ├── maps/googleMaps.ts      # Maps JavaScript API loader and browser config
│   │   ├── moodStorage.ts   # Remembers the last manually selected mood in localStorage
│   │   └── components/      # MoodPicker, FoodVibeQuiz, RecommendationList, RestaurantPanel, RestaurantMap
│   ├── tests/               # React Testing Library tests (HTTP is mocked)
│   └── vite.config.ts       # Dev/preview proxy for /api and Vitest config
├── e2e/                     # Playwright tests against the real servers (+ a mock Google Text Search server)
└── .github/workflows/ci.yml # Lint, format, typecheck, tests, build, e2e
```

How the pieces fit:

- `shared/` holds only types and constants, so the client and server agree on mood names and the
  API shape. Both import it by relative path. npm workspaces are used only for `client` and
  `server`.
- The engine is a plain function with no network calls. Restaurant lookup sits beside it and is
  linked only through each recommendation's `cuisine` tag, so recommendations keep working when
  a lookup fails.
- `createApp()` is separate from `index.ts`, so the API tests call the app through Supertest
  without opening a port.

## API

All responses are JSON.

### `GET /api/health`

```bash
curl http://localhost:3001/api/health
```

```json
{ "status": "ok" }
```

### `POST /api/recommendations`

Request body: `{ "mood": "upbeat" | "calm" | "stressed" | "low-energy" | "adventurous", "source"?: "manual" | "quiz" }`.
`source` defaults to `"manual"` and is echoed back. The quiz sends `"quiz"` only when its
suggestion is confirmed unchanged. Extra fields are ignored.

```bash
curl -X POST http://localhost:3001/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"mood":"calm"}'
```

```json
{
  "mood": "calm",
  "source": "manual",
  "recommendations": [
    {
      "id": "calm-ramen",
      "name": "Ramen",
      "explanation": "A warm bowl you eat slowly, which suits an unhurried evening when you have time to sit and enjoy it.",
      "cuisine": "ramen"
    },
    {
      "id": "calm-mediterranean-mezze",
      "name": "Mediterranean mezze",
      "explanation": "…",
      "cuisine": "mediterranean"
    },
    {
      "id": "calm-cafe-soup-and-sandwich",
      "name": "Café soup and sandwich",
      "explanation": "…",
      "cuisine": "cafe-soup-sandwich"
    }
  ]
}
```

### `GET /api/restaurants`

Query parameters (both required):

- `cuisine`: one of the cuisine tags in `shared/restaurants.ts` (e.g. `ramen`, `pho`, `sichuan`).
  Each recommendation's `cuisine` field is the tag to send.
- `city`: free text, up to 100 characters. Champaign/Urbana aliases are accepted. Any other city
  returns `422 UNSUPPORTED_CITY`.

```bash
curl "http://localhost:3001/api/restaurants?cuisine=ramen&city=Urbana"
```

```json
{
  "area": { "id": "champaign-urbana", "name": "Champaign-Urbana, IL" },
  "cuisine": "ramen",
  "cityQuery": "Urbana",
  "dataset": { "kind": "demo", "lastVerified": "2026-11-25" },
  "restaurants": [
    {
      "id": "oozu-ramen-bar",
      "name": "Oozu Ramen Bar",
      "address": "601 S 6th St, Ste 102, Champaign, IL 61820",
      "city": "Champaign",
      "cuisines": ["ramen"],
      "sources": [
        {
          "label": "Online ordering page",
          "url": "https://pos.chowbus.com/online-ordering/store/15609"
        },
        { "label": "Yelp listing", "url": "https://www.yelp.com/biz/oozu-ramen-bar-champaign" }
      ]
    },
    { "id": "susuru-ramen-bar", "name": "Susuru Ramen Bar", "…": "…" }
  ]
}
```

A cuisine with no matches returns `200` with `"restaurants": []`. Matching is exact: a restaurant
is returned only if its `cuisines` list contains the requested tag. The searched city (Champaign
or Urbana) does not filter results, because the two cities are treated as one demo area.

### `GET /api/places/search`

Google restaurant search. Requires `GOOGLE_PLACES_API_KEY` on the server.

Query parameters:

- `cuisine` (required): a cuisine tag. The text sent to Google comes only from
  `CUISINE_SEARCH_TERMS` in `shared/places.ts`, so users can't change the search terms.
- **Either** `city` (2–100 characters; letters, numbers, spaces, and `. , ' ( ) -`) **or** both
  `lat` (−90 to 90) and `lng` (−180 to 180).

```bash
curl "http://localhost:3001/api/places/search?cuisine=ramen&city=Chicago,%20IL"
```

```json
{
  "provider": "google",
  "cuisine": "ramen",
  "query": "ramen restaurant in Chicago, IL",
  "location": { "kind": "city", "city": "Chicago, IL" },
  "places": [
    {
      "id": "ChIJ…",
      "name": "…",
      "address": "…",
      "location": { "lat": 41.88, "lng": -87.63 },
      "googleMapsUri": "https://maps.google.com/?cid=…"
    }
  ]
}
```

How the server calls Google:

- `POST https://places.googleapis.com/v1/places:searchText` (Places API **(New)**; the legacy
  Places API can't be enabled for new projects as of October 2026).
- Field mask `places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri`
  only. These fields are in the Text Search **Pro** SKU. Ratings, hours, phone, and website are
  deliberately not requested because they move each call to the more expensive Enterprise SKU.
- `pageSize: 10`, `languageCode: "en"`, an 8-second timeout, and a limit of 20 searches per minute
  per client.
- City searches put the city in `textQuery`, e.g. "ramen restaurant in Chicago, IL". Location
  searches send just the food term with a `locationBias` circle (8 km radius) around coordinates
  rounded to 3 decimal places (about 100 m). Coordinates are not logged, stored, or echoed back.
- Results without an id, name, or valid coordinates are dropped, and duplicates are removed.
  A missing address shows "Address not provided". A missing or non-Google link is replaced
  with a documented `https://www.google.com/maps/search/?api=1&query=…&query_place_id=…` URL.
- Responses are sent with `Cache-Control: no-store`, and nothing from Google is saved on the
  server.

### Errors

Every error has this shape:

```json
{
  "error": {
    "code": "INVALID_MOOD",
    "message": "mood must be one of: upbeat, calm, stressed, low-energy, adventurous",
    "details": [
      {
        "field": "mood",
        "message": "mood must be one of: upbeat, calm, stressed, low-energy, adventurous"
      }
    ]
  }
}
```

`details` appears only on validation errors.

| Status | `code`                  | When                                                                    |
| ------ | ----------------------- | ----------------------------------------------------------------------- |
| 400    | `INVALID_MOOD`          | `mood` is missing (`"mood is required"`) or not one of the five moods   |
| 400    | `INVALID_JSON`          | The body is not valid JSON                                              |
| 400    | `INVALID_REQUEST`       | No body, or the body is not a JSON object (e.g. an array or plain text) |
| 400    | `INVALID_CUISINE`       | `cuisine` is missing or not a known cuisine tag                         |
| 400    | `INVALID_CITY`          | `city` is missing, blank, repeated, or longer than 100 characters       |
| 422    | `UNSUPPORTED_CITY`      | The city is outside the Champaign-Urbana demo area                      |
| 400    | `INVALID_LOCATION`      | `/api/places/search` got a bad city, bad coordinates, or both/neither   |
| 429    | `RATE_LIMITED`          | More than 20 Google searches per minute from one client                 |
| 503    | `PLACES_NOT_CONFIGURED` | `GOOGLE_PLACES_API_KEY` is not set on the server                        |
| 503    | `PLACES_QUOTA_EXCEEDED` | Google returned HTTP 429 or `RESOURCE_EXHAUSTED`                        |
| 504    | `PLACES_TIMEOUT`        | Google didn't answer within 8 seconds                                   |
| 502    | `PLACES_PROVIDER_ERROR` | Google rejected the request (key, restrictions, billing) or failed      |
| 413    | `PAYLOAD_TOO_LARGE`     | The body is larger than 10 KB                                           |
| 404    | `NOT_FOUND`             | Unknown `/api` route                                                    |
| 500    | `INTERNAL_ERROR`        | Unexpected server error                                                 |

## Food vibe quiz scoring

The quiz lives in `client/src/quiz/foodVibeQuiz.ts`. Questions, answer points, and the
explanation phrases are plain data, and `scoreQuiz(answers)` is a pure function with its own unit
tests.

| #   | Topic                           | Question                                    |
| --- | ------------------------------- | ------------------------------------------- |
| 1   | Music preferences               | What would you put on right now?            |
| 2   | Preferred energy                | How much energy should your next song have? |
| 3   | Familiar favorites vs discovery | Familiar favorites or something new?        |
| 4   | Listening occasion              | Where is this music playing?                |
| 5   | What you want right now         | What do you want from your next meal?       |

Rules:

1. Each answer gives 0–2 points to one or more of the five moods. For example, "Studying or
   working on a deadline" gives `stressed` +2, and "Lo-fi, acoustic, or ambient" gives `calm` +2
   and `low-energy` +1.
2. The mood with the most points is suggested.
3. **Ties** go to whichever tied mood got more points from the **most recent** question: Q5
   first, then Q4, and so on back to Q1. Later questions ask what you want right now, so they
   carry the most weight in a tie.
4. If no question separates them, the earlier mood in the fixed order wins: upbeat, calm,
   stressed, low-energy, adventurous.
5. The explanation lists up to three answers that gave the suggested mood points, strongest
   first. When a tie was settled, the result says which question decided it.
6. A result is only produced once all five questions are answered.

No single answer decides the result, and nothing claims an answer reveals how someone feels. The
moods are labels for a food vibe, and the UI says the match is playful and can be changed. The
answer options were written by the team and haven't been tested with users.

## Editing the mood mappings

Recommendations live in `server/src/data/mood-mappings.json`:

```json
{
  "calm": [
    {
      "id": "calm-ramen",
      "name": "Ramen",
      "explanation": "A warm bowl you eat slowly, …",
      "cuisine": "ramen"
    },
    …
  ],
  …
}
```

Rules, enforced when the server starts and by `npm test`:

- All five moods must be present, and no other keys are allowed.
- Each mood has **exactly three** recommendations, with distinct names within the mood.
- `id` is lowercase kebab-case (e.g. `calm-ramen`), unique across the whole file, and should not
  change once published so it stays stable for the frontend and future features.
- `name` and `explanation` must not be empty. Keep explanations short and specific, and don't
  make health, medical, or nutritional claims.
- `cuisine` must be one of `CUISINE_TAGS` in `shared/restaurants.ts`. It decides which
  restaurants the **Find restaurants** button shows. Each tag is currently used by exactly one
  recommendation, and a test checks this.

If the file breaks a rule, the server refuses to start and prints which rule failed. Restart
`npm run dev` after editing, or it restarts automatically when you save.

Adding a new mood means updating `MOODS` and `MOOD_DETAILS` in `shared/moods.ts` as well as the
JSON file.

## Restaurant demo data

Restaurants live in `server/src/data/champaign-urbana-restaurants.json`. It is a small,
hand-curated list for **Champaign-Urbana, IL only**, last checked on **2026-11-25**. It is not a
live search and was not collected from any API.

How entries were chosen:

- Each restaurant's name and address were checked on 2026-11-25 against the source(s) linked in
  its `sources` list: the restaurant's own website, its official location or ordering page, or
  at least two independent public listings (Yelp, Tripadvisor, delivery apps, local press such as
  Smile Politely) that agreed.
- Places that listings marked as closed, places only announced as "coming soon", and places
  with a single unconfirmed listing were left out. ZIP codes are included only when a source
  gave one.
- Nobody visited these restaurants. Hours, menus, and whether a place is still open can change at
  any time, and the UI tells users to confirm before going.
- Three food types have **no** verified match and intentionally show the no-results state: café
  soup and sandwich, mac and cheese, and chicken and rice. (Candidates found were closed, had
  domains that no longer worked, or didn't clearly serve the dish.)

| Food type                                   | Restaurants in the demo list                 |
| ------------------------------------------- | -------------------------------------------- |
| Street tacos                                | Cancún Taqueria, Juanito's Tacos             |
| Poke bowl                                   | Pokelab                                      |
| Korean fried chicken                        | bb.q Chicken, CM Chicken                     |
| Ramen                                       | Oozu Ramen Bar, Susuru Ramen Bar             |
| Mediterranean mezze                         | Dubai Grill, Mezza House                     |
| Pizza by the slice                          | Vinny's By The Slice & More                  |
| Burrito bowl                                | Chipotle Mexican Grill (Green St)            |
| Pho                                         | Bangkok Thai and Pho 911, Pho Noodle Station |
| Bagel sandwich                              | Good Judys Espresso & Bagel Bar              |
| Ethiopian                                   | Blue Ethiopian Cuisine & Cafe                |
| Sichuan                                     | Shiquan                                      |
| Peruvian                                    | Encanto Restaurant & Bar (Mexican-Peruvian)  |
| Café soup, mac and cheese, chicken and rice | None yet (shows the no-results state)        |

### Editing the restaurant data

Each entry looks like this:

```json
{
  "id": "oozu-ramen-bar",
  "name": "Oozu Ramen Bar",
  "address": "601 S 6th St, Ste 102, Champaign, IL 61820",
  "city": "Champaign",
  "cuisines": ["ramen"],
  "sources": [
    {
      "label": "Online ordering page",
      "url": "https://pos.chowbus.com/online-ordering/store/15609"
    }
  ]
}
```

Rules, enforced when the server starts and by `npm test`:

- `id` is lowercase kebab-case and unique.
- `city` is `"Champaign"` or `"Urbana"`.
- `cuisines` has at least one tag from `CUISINE_TAGS`.
- `sources` has at least one entry, and every `url` is `https`.
- `lastVerified` (top of the file) is a `YYYY-MM-DD` date. Update it whenever you re-check the
  list.

Only add a restaurant after checking its address against a source you can link. Don't fill in
details from memory.

## Spotify integration: not available

**Status:** researched on 2026-11-26 and deliberately not implemented. No Spotify credentials,
OAuth flow, tokens, or API calls exist in this codebase, so there is nothing to verify with a real
Spotify account. `.env.example` has no Spotify variables for the same reason.

### Why

The plan was to suggest a tentative mood from a user's listening, then let them confirm or change
it. Spotify's current official documentation rules this out for TasteSync, for two independent
reasons.

**1. Policy: inferring a mood from listening data counts as prohibited analysis.**

- [Spotify Developer Policy](https://developer.spotify.com/policy) (effective 15 May 2025),
  section III, item 13: "Do not analyze the Spotify Content or the Spotify Service for any
  purpose, including without limitation," followed by a list that includes building user
  profiles.
- The [Developer Terms](https://developer.spotify.com/terms) (v10, section II.8) define "Spotify
  Content" to include "user data including Spotify Personal Data", which covers a user's
  listening history.
- Suggesting a mood from someone's recently played or top tracks is analyzing their Spotify data
  to infer something about them. We read that as prohibited.
- Developer Terms section V.4 separately requires "explicit consent from the user" for any use of
  Spotify Personal Data beyond displaying it back to them. Consent would address V.4, but Policy
  III.13 has no consent exception.

This is the team's reading of the published text, not legal advice or a ruling from Spotify.

**2. Data: what a new app can still access is too thin for a meaningful mood signal.**

| Data                                                                       | Status for a new development-mode app                                                                                                                                    |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Audio Features (valence, energy, tempo), Audio Analysis                    | Unavailable to apps created after 27 Nov 2024 ([announcement](https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api))                                     |
| Recommendations, Related Artists                                           | Unavailable since the same change                                                                                                                                        |
| Track and artist `popularity`, artist `followers`                          | Removed for development-mode apps ([February 2026 changelog](https://developer.spotify.com/documentation/web-api/references/changes/february-2026))                      |
| Get Several Artists / Tracks (batch lookups)                               | Removed for development-mode apps (same changelog)                                                                                                                       |
| Artist `genres` (single Get Artist only)                                   | Still returned but marked **Deprecated**, and empty for unclassified artists ([Get Artist](https://developer.spotify.com/documentation/web-api/reference/get-an-artist)) |
| Recently Played (`user-read-recently-played`), Top Items (`user-top-read`) | Still available, but they return track/artist names, `explicit`, and `duration_ms`, which say nothing reliable about mood                                                |

Development-mode apps are also limited to **5 allowlisted users**, and the app owner needs Spotify
Premium ([quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)).
Extended quota is only granted to organizations with at least 250k monthly active users.

### What would have to change

Reconsider only if one of these happens, and record the decision here first:

- Spotify publishes policy text or gives written permission that allows mood suggestions from
  listening data, or
- the course staff decide on a **display-only** feature, such as showing a user their recently
  played tracks as context while they pick a mood themselves, with no inference.

Either path needs the Authorization Code flow with the client secret kept on the server, a
loopback redirect URI (Spotify no longer accepts `localhost`; use
`http://127.0.0.1:<port>/...` in development), minimal scopes, Spotify attribution and links
(Policy II.4), and a disconnect action that deletes the user's Spotify data (Policy I.1).

## Google Maps setup

TasteSync never creates Google Cloud resources for you. Follow these steps in your own Google
Cloud account. They are based on Google's documentation as read on 2026-11-26; Google's console
labels can change.

1. **Project:** in the [Google Cloud console](https://console.cloud.google.com/), create or select
   a project for TasteSync.
2. **Billing:** link a billing account to the project. Google requires billing for these APIs.
   Text Search Pro (the tier TasteSync uses) listed 5,000 free calls per month, then about
   $32 per 1,000 calls, on the
   [pricing page](https://developers.google.com/maps/billing-and-pricing/pricing). Check current
   prices yourself, and set a budget alert under **Billing → Budgets & alerts**. Alerts notify you
   but don't cap spending.
3. **Enable APIs** (APIs & Services → Library):
   - **Places API (New)**, not the legacy "Places API".
   - **Maps JavaScript API**.
4. **Server key** (APIs & Services → Credentials → Create credentials → API key):
   - API restrictions: **Places API (New)** only.
   - Application restrictions: **IP addresses**, set to the public IP of the machine running
     Express. On a laptop whose IP changes, you can temporarily use no application restriction
     for local testing, but keep the API restriction, and add the IP restriction before sharing
     or deploying.
   - Put it in `.env` as `GOOGLE_PLACES_API_KEY=…`. Never commit it, and never prefix it with
     `VITE_`.
5. **Browser key** (a second, separate API key):
   - Application restrictions: **Websites**. Add `http://localhost:5173/*` for development (also
     `http://127.0.0.1:5173/*` if you open the app that way, and your real origin later).
   - API restrictions: **Maps JavaScript API** only.
   - Put it in `.env` as `VITE_GOOGLE_MAPS_API_KEY=…`. This key is visible in the browser by
     design; the restrictions are what protect it.
6. **Map ID** (needed for Advanced Markers): leave `VITE_GOOGLE_MAPS_MAP_ID` blank to use
   Google's `DEMO_MAP_ID` while testing. For anything beyond testing, create a JavaScript map ID
   in the console's map management page, following
   [Google's map ID guide](https://developers.google.com/maps/documentation/get-map-id), and set
   `VITE_GOOGLE_MAPS_MAP_ID`.
7. **Quotas:** under APIs & Services → Places API (New) → Quotas, lower the Text Search
   per-minute and per-day limits to something small for a class project (for example 100 per
   day). TasteSync also limits each client to 20 searches per minute, but that doesn't replace
   Google-side quotas.
8. Restart `npm run dev` and run the checklist in
   [Google verification status](#google-verification-status).

**Attribution and storage:**

- When results are on the Google Map, the map shows Google's attribution. The results list also
  shows the text "Google Maps" (untranslated, Roboto, in an approved color), so attribution stays
  visible if the map can't load.
- TasteSync doesn't store any Places content. Results live in the page's memory until the next
  search or reload. The server sends them with `Cache-Control: no-store` and keeps nothing.
  Google allows place IDs to be stored indefinitely, but TasteSync doesn't need to.

## Google verification status

**Not verified against live Google.** No real API keys were available, so:

- Server tests call the Places code with mocked `fetch` responses (request shape, field mask,
  normalization, error mapping, timeout, rate limiting).
- Client tests mock `/api/places/search`, the browser geolocation API, and the Maps JavaScript
  classes (markers, bounds, selection, auth failure).
- Playwright runs the real Express server against a local mock of the Text Search endpoint
  (`e2e/mock-google-places.ts`). The map is tested only in its "no browser key" state.

Things that only a real key can confirm (pending):

- [ ] A city search returns real places with names, addresses, and working Google Maps links.
- [ ] **Use my location** returns nearby places after you allow location access.
- [ ] The map loads with your browser key and map ID. Markers appear and the map fits them.
      Clicking a marker highlights its card, and **Show on map** highlights and pans to a marker.
- [ ] A browser key with the wrong referrer shows "The map couldn't load" (via `gm_authFailure`)
      while the list still works.
- [ ] Removing the server key's API access, or exceeding a tiny quota, shows the matching error
      message. The exact Google error statuses are mapped from documentation and HTTP codes and
      haven't been observed live.
- [ ] Results for common foods look reasonable (search terms are in `shared/places.ts`).

## Known limitations

- Recommendations are fixed. Each mood always returns the same three items in the same order,
  with no variety, personalization, or dietary filtering.
- The demo restaurant list only covers a small, manually checked Champaign-Urbana list, and it can
  go out of date. Champaign and Urbana are treated as one area, and the city aliases are a fixed
  list (nearby towns such as Savoy aren't recognized).
- Google search is **not verified live** (see above). It returns up to 10 results, with no
  ratings, hours, prices, or distance sorting. A Google match doesn't mean a place serves the
  exact dish.
- Location searches use a fixed 8 km bias around your rounded position. Google may still return
  places outside it.
- The quiz is a short, team-written food match. Its scoring hasn't been evaluated with users and
  doesn't measure mood.
- There is no music integration (see above), saved history, or accounts.
- No production hosting is set up. `npm start` serves only the API, and the built client is
  served by `vite preview` for local checks only.
- The Playwright tests cover the main flows in Chromium only, with mocked Google responses and no
  real map. Network and server error states are covered by component tests with mocked HTTP.
- The mood pairings are subjective team choices and have not been evaluated with users yet.

## Phase 2 checklist

- [x] Verify which Spotify data is actually available (scopes, endpoints, and rate limits for
      student accounts) before choosing inference rules. (Done 2026-11-26: inference isn't
      permitted, and the useful audio data isn't available. See
      [Spotify integration](#spotify-integration-not-available).)
- [x] Implement music-derived mood confirmation with manual correction, or an honest
      "unavailable" state when Spotify data can't be used. (Honest unavailable state.)
- [x] Add restaurant lookup with city input and optional location, or clearly labeled
      Champaign-Urbana demonstration data. (Both: Google search with city or location, plus the
      labeled demo list. Live Google verification is pending.)
- [x] Keep manual recommendations usable when any integration fails. (Restaurant lookup failures
      leave recommendations visible; Spotify is not called at all.)
- [ ] Add integration failure tests, security checks (OAuth/token handling, secrets, input
      validation), final browser tests, and a usability evaluation. (Failure tests, input
      validation, and mocked browser tests are done. Live Google checks and a usability evaluation
      remain.)
