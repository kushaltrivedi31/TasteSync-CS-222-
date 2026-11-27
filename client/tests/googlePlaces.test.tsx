import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecommendationResponse } from "../../shared/moods";
import type { PlaceSearchResponse } from "../../shared/places";
import type { CuisineTag } from "../../shared/restaurants";
import { App } from "../src/App";

// Frontend tests mock HTTP; the server's Google calls are covered by server tests.
const CALM: RecommendationResponse = {
  mood: "calm",
  source: "manual",
  recommendations: [
    { id: "calm-ramen", name: "Ramen", explanation: "Warm.", cuisine: "ramen" },
    {
      id: "calm-mezze",
      name: "Mediterranean mezze",
      explanation: "Plates.",
      cuisine: "mediterranean",
    },
    {
      id: "calm-cafe",
      name: "Café soup and sandwich",
      explanation: "Lunch.",
      cuisine: "cafe-soup-sandwich",
    },
  ],
};

type PlacesQuery = { cuisine: CuisineTag; city?: string; lat?: string; lng?: string };

function placesResult(query: PlacesQuery, names: string[]): PlaceSearchResponse {
  return {
    provider: "google",
    cuisine: query.cuisine,
    query: query.city
      ? `${query.cuisine} restaurant in ${query.city}`
      : `${query.cuisine} restaurant`,
    location: query.city
      ? { kind: "city", city: query.city }
      : { kind: "coordinates", label: "your current location" },
    places: names.map((name, index) => ({
      id: `${name}-${index}`,
      name,
      address: `${index + 1} Main St, Somewhere, USA`,
      location: { lat: 41.88 + index / 100, lng: -87.63 },
      googleMapsUri: `https://maps.google.com/?cid=${index + 1}`,
    })),
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type Handler = (query: PlacesQuery) => Promise<Response>;

function mockApi(onPlaces: Handler, onDemo?: (city: string) => Promise<Response>) {
  const placesQueries: PlacesQuery[] = [];
  const demoCities: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/recommendations") return json(CALM);
      if (url.pathname === "/api/places/search") {
        const query: PlacesQuery = { cuisine: url.searchParams.get("cuisine") as CuisineTag };
        for (const key of ["city", "lat", "lng"] as const) {
          const value = url.searchParams.get(key);
          if (value !== null) query[key] = value;
        }
        placesQueries.push(query);
        return new Promise<Response>((resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
          onPlaces(query).then(resolve, reject);
        });
      }
      if (url.pathname === "/api/restaurants" && onDemo) {
        const city = url.searchParams.get("city") ?? "";
        demoCities.push(city);
        return onDemo(city);
      }
      throw new Error(`Unexpected request ${url.pathname}`);
    }),
  );
  return { placesQueries, demoCities };
}

function deferred() {
  const pending: { query: PlacesQuery; resolve: (r: Response) => void }[] = [];
  const handler: Handler = (query) => new Promise((resolve) => pending.push({ query, resolve }));
  return { pending, handler };
}

function mockGeolocation(
  impl: (
    success: PositionCallback,
    error: PositionErrorCallback,
    options?: PositionOptions,
  ) => void,
) {
  const getCurrentPosition = vi.fn(impl);
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });
  return getCurrentPosition;
}

function positionError(code: number): GeolocationPositionError {
  return { code, message: "x", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
}

afterEach(() => {
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
});

async function showCalm() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("radio", { name: "Calm" }));
  await user.click(screen.getByRole("button", { name: "Get recommendations" }));
  await screen.findByRole("heading", { name: /feeling calm/i });
  return user;
}

function cityInput() {
  return screen.getByRole("textbox", { name: /city for restaurant ideas/i });
}

function panel() {
  return screen.getByRole("region", { name: /^places for/i });
}

describe("Google restaurant search", () => {
  it("defaults to Google search, with the city input and a location button", async () => {
    const getCurrentPosition = mockGeolocation(() => {});
    mockApi(async () => json({}));
    await showCalm();

    expect(screen.getByRole("radio", { name: "Google Maps search" })).toBeChecked();
    expect(cityInput()).toHaveValue("Champaign-Urbana");
    expect(screen.getByRole("button", { name: "Use my location" })).toBeInTheDocument();
    // Location is never requested without an explicit click.
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("searches any city and shows names, addresses, Google Maps links, and attribution", async () => {
    const { placesQueries } = mockApi(async (query) =>
      json(placesResult(query, ["Ramen Place", "Noodle Bar"])),
    );
    const user = await showCalm();

    await user.clear(cityInput());
    await user.type(cityInput(), "Chicago, IL");
    await user.click(screen.getByRole("button", { name: "Find restaurants for Ramen" }));

    const region = await screen.findByRole("region", { name: "Places for ramen" });
    expect(await within(region).findByText("Ramen Place")).toBeInTheDocument();
    expect(placesQueries).toEqual([{ cuisine: "ramen", city: "Chicago, IL" }]);

    expect(within(region).getByText("Google Maps search")).toBeInTheDocument();
    expect(
      within(region).getByText(/2 places from google maps near “chicago, il”/i),
    ).toBeInTheDocument();
    const items = within(region).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("1 Main St, Somewhere, USA");
    const link = within(items[0]!).getByRole("link", { name: /open in google maps/i });
    expect(link).toHaveAttribute("href", "https://maps.google.com/?cid=1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(within(region).getByText(/doesn't guarantee they serve ramen/i)).toBeInTheDocument();
    expect(within(region).getByLabelText("Google Maps")).toHaveAttribute("translate", "no");
    // No browser key in tests, so the map explains itself and the list still works.
    expect(within(region).getByText(/map preview isn't set up/i)).toBeInTheDocument();
  });

  it("uses the browser location only after 'Use my location' and searches near it", async () => {
    const getCurrentPosition = mockGeolocation((success) =>
      success({ coords: { latitude: 40.1164, longitude: -88.2434 } } as GeolocationPosition),
    );
    const { placesQueries } = mockApi(async (query) =>
      json(placesResult(query, ["Near Me Ramen"])),
    );
    const user = await showCalm();

    await user.click(screen.getByRole("button", { name: "Find restaurants for Ramen" }));
    await within(panel()).findByText("Near Me Ramen");
    await user.click(screen.getByRole("button", { name: "Use my location" }));

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition.mock.calls[0]![2]).toMatchObject({ timeout: 10_000 });
    expect(await within(panel()).findByText(/near your current location/i)).toBeInTheDocument();
    expect(placesQueries.at(-1)).toEqual({ cuisine: "ramen", lat: "40.1164", lng: "-88.2434" });
    expect(screen.getByText(/searching near/i)).toHaveTextContent(
      "Searching near your current location.",
    );
    expect(JSON.stringify({ ...window.localStorage })).not.toContain("40.1164");

    // Typing a city switches back to city search.
    await user.clear(cityInput());
    await user.type(cityInput(), "Urbana");
    await user.click(screen.getByRole("button", { name: "Find restaurants for Ramen" }));
    await within(panel()).findByText(/near “urbana”/i);
    expect(placesQueries.at(-1)).toEqual({ cuisine: "ramen", city: "Urbana" });
  });

  it.each([
    [1, /location access was blocked/i],
    [2, /location isn't available/i],
    [3, /took too long/i],
  ])("handles location error code %i and keeps city search working", async (code, message) => {
    mockGeolocation((_success, error) => error(positionError(code)));
    const { placesQueries } = mockApi(async (query) => json(placesResult(query, ["City Ramen"])));
    const user = await showCalm();

    await user.click(screen.getByRole("button", { name: "Use my location" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(placesQueries).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Find restaurants for Ramen" }));
    expect(await within(panel()).findByText("City Ramen")).toBeInTheDocument();
    expect(placesQueries).toEqual([{ cuisine: "ramen", city: "Champaign-Urbana" }]);
  });

  it("explains when the browser can't share location", async () => {
    mockApi(async () => json({}));
    const user = await showCalm();
    await user.click(screen.getByRole("button", { name: "Use my location" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/can't share your location/i);
  });

  it("explains when Google isn't configured and offers the labeled demo list instead", async () => {
    const { demoCities } = mockApi(
      async () => json({ error: { code: "PLACES_NOT_CONFIGURED", message: "x" } }, 503),
      async (city) =>
        json({
          area: { id: "champaign-urbana", name: "Champaign-Urbana, IL" },
          cuisine: "ramen",
          cityQuery: city,
          dataset: { kind: "demo", lastVerified: "2026-11-25" },
          restaurants: [
            {
              id: "oozu",
              name: "Oozu Ramen Bar",
              address: "601 S 6th St, Ste 102, Champaign, IL 61820",
              city: "Champaign",
              cuisines: ["ramen"],
              sources: [{ label: "Online ordering page", url: "https://example.com" }],
            },
          ],
        }),
    );
    const user = await showCalm();
    await user.clear(cityInput());
    await user.type(cityInput(), "Chicago");
    await user.click(screen.getByRole("button", { name: "Find restaurants for Ramen" }));

    const alert = await within(panel()).findByRole("alert");
    expect(alert).toHaveTextContent(/google restaurant search isn't available/i);
    // The demo list is never used without the user choosing it.
    expect(demoCities).toEqual([]);

    await user.click(
      within(alert).getByRole("button", { name: /use the champaign-urbana, il demo list/i }),
    );
    expect(await within(panel()).findByText("Oozu Ramen Bar")).toBeInTheDocument();
    expect(within(panel()).getByText("Demo data · Champaign-Urbana, IL only")).toBeInTheDocument();
    expect(demoCities).toEqual(["Champaign-Urbana"]);
    expect(screen.getByRole("radio", { name: /demo list/i })).toBeChecked();
    expect(cityInput()).toHaveValue("Champaign-Urbana");
  });

  it("explains quota errors with a retry", async () => {
    let calls = 0;
    mockApi(async (query) => {
      calls += 1;
      return calls === 1
        ? json(
            {
              error: {
                code: "PLACES_QUOTA_EXCEEDED",
                message: "Google restaurant search has hit its usage limit.",
              },
            },
            503,
          )
        : json(placesResult(query, ["Retry Ramen"]));
    });
    const user = await showCalm();
    await user.click(screen.getByRole("button", { name: "Find restaurants for Ramen" }));

    const alert = await within(panel()).findByRole("alert");
    expect(alert).toHaveTextContent(/usage limit/i);
    expect(screen.getByRole("heading", { name: "Ramen" })).toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await within(panel()).findByText("Retry Ramen")).toBeInTheDocument();
  });

  it("shows an empty state when Google finds nothing", async () => {
    mockApi(async (query) => json(placesResult(query, [])));
    const user = await showCalm();
    await user.click(screen.getByRole("button", { name: "Find restaurants for Ramen" }));
    expect(await within(panel()).findByText(/didn't find any matches/i)).toBeInTheDocument();
  });

  it("never shows results for an earlier food", async () => {
    const { pending, handler } = deferred();
    mockApi(handler);
    const user = await showCalm();

    await user.click(screen.getByRole("button", { name: "Find restaurants for Ramen" }));
    await user.click(
      screen.getByRole("button", { name: "Find restaurants for Mediterranean mezze" }),
    );
    pending[1]!.resolve(json(placesResult(pending[1]!.query, ["Mezze Spot"])));
    pending[0]!.resolve(json(placesResult(pending[0]!.query, ["Late Ramen"])));

    expect(
      await screen.findByRole("region", { name: "Places for mediterranean mezze" }),
    ).toBeInTheDocument();
    expect(await within(panel()).findByText("Mezze Spot")).toBeInTheDocument();
    expect(screen.queryByText("Late Ramen")).not.toBeInTheDocument();
  });

  it("never shows results for an earlier location", async () => {
    mockGeolocation((success) =>
      success({ coords: { latitude: 40, longitude: -88 } } as GeolocationPosition),
    );
    const { pending, handler } = deferred();
    mockApi(handler);
    const user = await showCalm();

    await user.click(screen.getByRole("button", { name: "Find restaurants for Ramen" }));
    await user.click(screen.getByRole("button", { name: "Use my location" }));
    expect(pending.map((p) => p.query.city ?? "coords")).toEqual(["Champaign-Urbana", "coords"]);

    pending[1]!.resolve(json(placesResult(pending[1]!.query, ["Nearby Ramen"])));
    pending[0]!.resolve(json(placesResult(pending[0]!.query, ["Old City Ramen"])));

    expect(await within(panel()).findByText("Nearby Ramen")).toBeInTheDocument();
    expect(screen.queryByText("Old City Ramen")).not.toBeInTheDocument();
  });

  it("rejects a response for a different city than requested", async () => {
    mockApi(async (query) => json(placesResult({ ...query, city: "Elsewhere" }, ["Wrong City"])));
    const user = await showCalm();
    await user.click(screen.getByRole("button", { name: "Find restaurants for Ramen" }));
    expect(await within(panel()).findByRole("alert")).toHaveTextContent(/unexpected response/i);
    expect(screen.queryByText("Wrong City")).not.toBeInTheDocument();
  });

  it("notes when the source changes after results are shown", async () => {
    mockApi(async (query) => json(placesResult(query, ["Ramen Place"])));
    const user = await showCalm();
    await user.click(screen.getByRole("button", { name: "Find restaurants for Ramen" }));
    await within(panel()).findByText("Ramen Place");

    await user.click(screen.getByRole("radio", { name: /demo list/i }));
    expect(
      within(panel()).getByText(/you switched to the champaign-urbana, il demo list/i),
    ).toBeInTheDocument();
    expect(within(panel()).getByText("Google Maps search")).toBeInTheDocument();
  });
});
