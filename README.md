# TasteSync

TasteSync helps college students decide what to eat based on their mood. Pick one of five moods
and TasteSync suggests three kinds of food or cuisine, each with a short reason it fits.

The mood-to-food pairings are **curated design choices** written by the team. They are not
scientific findings and are not medical or nutritional advice.

CS 222 project. **Current status: Phase 1 (manual mood → food recommendations) is implemented.**
Music and restaurant integrations are planned for Phase 2 and are **not** implemented yet.

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
- Keyboard support, visible focus states, light and dark color schemes, and a mobile layout.
- Unit, API, and component tests (Vitest, Supertest, React Testing Library) plus one Playwright
  browser smoke test.
- ESLint, Prettier, strict TypeScript, and a GitHub Actions workflow.

### Planned (Phase 2, not implemented)

- Spotify-based mood inference with manual confirmation or correction.
- Restaurant suggestions near the user.
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

Copy `.env.example` to `.env` to change the ports. Phase 1 needs no secrets or API keys.

| Variable      | Default | Used by                                   |
| ------------- | ------- | ----------------------------------------- |
| `PORT`        | `3001`  | Express server, and the Vite proxy target |
| `CLIENT_PORT` | `5173`  | Vite dev and preview server               |

`.env` is gitignored. Never commit real credentials.

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

## Architecture

```
.
├── shared/moods.ts          # Mood list, labels, and request/response/error types (no dependencies)
├── server/                  # Express + TypeScript API
│   ├── src/
│   │   ├── data/mood-mappings.json  # Curated mood → food data (edit this to change recommendations)
│   │   ├── engine.ts        # Validates the JSON at startup; getRecommendations(mood)
│   │   ├── app.ts           # createApp(): routes, Zod validation, error handling (no listen)
│   │   └── index.ts         # Reads PORT and starts the server
│   └── tests/               # Engine unit tests + Supertest API tests (use the real engine)
├── client/                  # React + TypeScript + Vite
│   ├── src/
│   │   ├── App.tsx          # Page layout and request state machine
│   │   ├── api.ts           # fetch wrapper for POST /api/recommendations
│   │   └── components/      # MoodPicker, RecommendationList
│   ├── tests/               # React Testing Library tests (HTTP is mocked)
│   └── vite.config.ts       # Dev/preview proxy for /api and Vitest config
├── e2e/                     # Playwright smoke test against the real servers
└── .github/workflows/ci.yml # Lint, format, typecheck, tests, build, e2e
```

How the pieces fit:

- `shared/` holds only types and constants, so the client and server agree on mood names and the
  API shape. Both import it by relative path. npm workspaces are used only for `client` and
  `server`.
- The engine is a plain function with no network calls. Spotify or restaurant code added later
  should sit beside it and pass a mood into it, so manual recommendations keep working when an
  integration fails.
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

Request body: `{ "mood": "upbeat" | "calm" | "stressed" | "low-energy" | "adventurous" }`.
Extra fields are ignored.

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
      "explanation": "A warm bowl you eat slowly, which suits an unhurried evening when you have time to sit and enjoy it."
    },
    { "id": "calm-mediterranean-mezze", "name": "Mediterranean mezze", "explanation": "…" },
    { "id": "calm-cafe-soup-and-sandwich", "name": "Café soup and sandwich", "explanation": "…" }
  ]
}
```

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

| Status | `code`              | When                                                                    |
| ------ | ------------------- | ----------------------------------------------------------------------- |
| 400    | `INVALID_MOOD`      | `mood` is missing (`"mood is required"`) or not one of the five moods   |
| 400    | `INVALID_JSON`      | The body is not valid JSON                                              |
| 400    | `INVALID_REQUEST`   | No body, or the body is not a JSON object (e.g. an array or plain text) |
| 413    | `PAYLOAD_TOO_LARGE` | The body is larger than 10 KB                                           |
| 404    | `NOT_FOUND`         | Unknown `/api` route                                                    |
| 500    | `INTERNAL_ERROR`    | Unexpected server error                                                 |

## Editing the mood mappings

Recommendations live in `server/src/data/mood-mappings.json`:

```json
{
  "calm": [
    { "id": "calm-ramen", "name": "Ramen", "explanation": "A warm bowl you eat slowly, …" },
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

If the file breaks a rule, the server refuses to start and prints which rule failed. Restart
`npm run dev` after editing, or it restarts automatically when you save.

Adding a new mood means updating `MOODS` and `MOOD_DETAILS` in `shared/moods.ts` as well as the
JSON file.

## Known limitations

- Recommendations are fixed. Each mood always returns the same three items in the same order,
  with no variety, personalization, or dietary filtering.
- There is no restaurant lookup, music integration, saved history, or accounts (see Phase 2).
- No production hosting is set up. `npm start` serves only the API, and the built client is
  served by `vite preview` for local checks only.
- The Playwright test covers one happy path in Chromium. Error states are covered by component
  tests with mocked HTTP.
- The mood pairings are subjective team choices and have not been evaluated with users yet.

## Phase 2 checklist

- [ ] Verify which Spotify data is actually available (scopes, endpoints, and rate limits for
      student accounts) before choosing inference rules.
- [ ] Implement music-derived mood confirmation with manual correction, or an honest
      "unavailable" state when Spotify data can't be used.
- [ ] Add restaurant lookup with city input and optional location, or clearly labeled
      Champaign-Urbana demonstration data.
- [ ] Keep manual recommendations usable when any integration fails.
- [ ] Add integration failure tests, security checks (OAuth/token handling, secrets, input
      validation), final browser tests, and a usability evaluation.
