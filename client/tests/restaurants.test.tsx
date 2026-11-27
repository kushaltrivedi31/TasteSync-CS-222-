import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RecommendationResponse } from "../../shared/moods";
import type { CuisineTag, RestaurantSearchResponse } from "../../shared/restaurants";
import { App } from "../src/App";

// Frontend tests mock HTTP. The real lookup is covered by the server tests.
const CALM_RESULT: RecommendationResponse = {
  mood: "calm",
  source: "manual",
  recommendations: [
    { id: "calm-ramen", name: "Ramen", explanation: "Warm and slow.", cuisine: "ramen" },
    {
      id: "calm-mezze",
      name: "Mediterranean mezze",
      explanation: "Small plates.",
      cuisine: "mediterranean",
    },
    {
      id: "calm-cafe",
      name: "Café soup and sandwich",
      explanation: "Simple lunch.",
      cuisine: "cafe-soup-sandwich",
    },
  ],
};

function restaurantResult(
  cuisine: CuisineTag,
  cityQuery: string,
  names: string[],
): RestaurantSearchResponse {
  return {
    area: { id: "champaign-urbana", name: "Champaign-Urbana, IL" },
    cuisine,
    cityQuery,
    dataset: { kind: "demo", lastVerified: "2026-11-25" },
    restaurants: names.map((name, index) => ({
      id: `${cuisine}-${index}`,
      name,
      address: `${100 + index} Green St, Champaign, IL 61820`,
      city: "Champaign",
      cuisines: [cuisine],
      sources: [{ label: "Official website", url: `https://example.com/${cuisine}/${index}` }],
    })),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type RestaurantHandler = (query: { cuisine: CuisineTag; city: string }) => Promise<Response>;

/** Routes /api/recommendations to a fixed result and restaurant lookups to the handler. */
function mockApi(onRestaurants: RestaurantHandler) {
  const restaurantQueries: { cuisine: string; city: string }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname === "/api/recommendations") return jsonResponse(CALM_RESULT);
    if (url.pathname === "/api/restaurants") {
      const query = {
        cuisine: url.searchParams.get("cuisine") as CuisineTag,
        city: url.searchParams.get("city") ?? "",
      };
      restaurantQueries.push(query);
      return new Promise<Response>((resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
        onRestaurants(query).then(resolve, reject);
      });
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, restaurantQueries };
}

/** Lets a test resolve each restaurant request by hand. */
function deferredRestaurants() {
  const pending: { cuisine: CuisineTag; city: string; resolve: (r: Response) => void }[] = [];
  const handler: RestaurantHandler = (query) =>
    new Promise<Response>((resolve) => pending.push({ ...query, resolve }));
  return { pending, handler };
}

async function showCalmRecommendations() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("radio", { name: "Calm" }));
  await user.click(screen.getByRole("button", { name: "Get recommendations" }));
  await screen.findByRole("heading", { name: /feeling calm/i });
  // These tests cover the curated demo list; Google search is the default source.
  await user.click(screen.getByRole("radio", { name: /champaign-urbana, il demo list/i }));
  return user;
}

function cityInput() {
  return screen.getByRole("textbox", { name: /city for restaurant ideas/i });
}

function panel() {
  return screen.getByRole("region", { name: /^places for/i });
}

describe("restaurant suggestions (demo list)", () => {
  it("shows a city input that defaults to Champaign-Urbana and is labeled as demo data", async () => {
    mockApi(async () => jsonResponse({}));
    await showCalmRecommendations();

    expect(screen.getByRole("radio", { name: /champaign-urbana, il demo list/i })).toBeChecked();
    expect(screen.queryByRole("button", { name: /use my location/i })).not.toBeInTheDocument();

    expect(cityInput()).toHaveValue("Champaign-Urbana");
    expect(cityInput()).toHaveAccessibleDescription(/demo list for champaign-urbana/i);
    expect(screen.getAllByRole("button", { name: /^find restaurants for/i })).toHaveLength(3);
  });

  it("finds restaurants for a recommendation and shows names, addresses, and sources", async () => {
    const { restaurantQueries } = mockApi(async ({ cuisine, city }) =>
      jsonResponse(restaurantResult(cuisine, city, ["Oozu Ramen Bar", "Susuru Ramen Bar"])),
    );
    const user = await showCalmRecommendations();

    await user.click(screen.getByRole("button", { name: "Find restaurants for Ramen" }));

    const region = await screen.findByRole("region", { name: "Places for ramen" });
    expect(await within(region).findByText("Oozu Ramen Bar")).toBeInTheDocument();
    expect(restaurantQueries).toEqual([{ cuisine: "ramen", city: "Champaign-Urbana" }]);

    const items = within(region).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("100 Green St, Champaign, IL 61820");
    const link = within(items[0]!).getByRole("link", { name: /official website/i });
    expect(link).toHaveAttribute("href", "https://example.com/ramen/0");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");

    expect(within(region).getByText(/demo data · champaign-urbana, il only/i)).toBeInTheDocument();
    expect(within(region).getByText(/not a live search/i)).toBeInTheDocument();
    expect(within(region).getByText(/2 places/i)).toBeInTheDocument();
  });

  it("shows a loading state while looking up restaurants", async () => {
    const { pending, handler } = deferredRestaurants();
    mockApi(handler);
    const user = await showCalmRecommendations();

    await user.click(screen.getByRole("button", { name: "Find restaurants for Ramen" }));

    expect(within(panel()).getByText(/looking up ramen near “champaign-urbana”/i)).toBeVisible();
    expect(panel()).toHaveAttribute("aria-busy", "true");

    pending[0]!.resolve(jsonResponse(restaurantResult("ramen", "Champaign-Urbana", ["Oozu"])));
    expect(await within(panel()).findByText("Oozu")).toBeInTheDocument();
    expect(panel()).toHaveAttribute("aria-busy", "false");
  });

  it("explains when the demo list has no matches", async () => {
    mockApi(async ({ cuisine, city }) => jsonResponse(restaurantResult(cuisine, city, [])));
    const user = await showCalmRecommendations();

    await user.click(
      screen.getByRole("button", { name: "Find restaurants for Café soup and sandwich" }),
    );

    expect(
      await screen.findByText(/no café soup and sandwich spots are in our champaign-urbana/i),
    ).toBeInTheDocument();
    expect(within(panel()).queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("explains that other cities aren't covered and offers Champaign-Urbana", async () => {
    const { restaurantQueries } = mockApi(async ({ cuisine, city }) => {
      if (city === "Chicago") {
        return jsonResponse(
          {
            error: {
              code: "UNSUPPORTED_CITY",
              message: "Restaurant suggestions are demo data that only cover Champaign-Urbana, IL.",
            },
          },
          422,
        );
      }
      return jsonResponse(restaurantResult(cuisine, city, ["Oozu Ramen Bar"]));
    });
    const user = await showCalmRecommendations();

    await user.clear(cityInput());
    await user.type(cityInput(), "Chicago");
    await user.click(screen.getByRole("button", { name: "Find restaurants for Ramen" }));

    const alert = await within(panel()).findByRole("alert");
    expect(alert).toHaveTextContent("“Chicago” isn't covered yet.");
    expect(alert).toHaveTextContent(/only cover champaign-urbana/i);
    expect(within(panel()).queryByRole("listitem")).not.toBeInTheDocument();

    await user.click(within(alert).getByRole("button", { name: /search champaign-urbana/i }));
    expect(cityInput()).toHaveValue("Champaign-Urbana");
    expect(await within(panel()).findByText("Oozu Ramen Bar")).toBeInTheDocument();
    expect(restaurantQueries.map((q) => q.city)).toEqual(["Chicago", "Champaign-Urbana"]);
  });

  it("asks for a city instead of calling the API when the input is empty", async () => {
    const { restaurantQueries } = mockApi(async () => jsonResponse({}));
    const user = await showCalmRecommendations();

    await user.clear(cityInput());
    await user.click(screen.getByRole("button", { name: "Find restaurants for Ramen" }));

    expect(within(panel()).getByRole("alert")).toHaveTextContent(/enter a city/i);
    expect(restaurantQueries).toEqual([]);
  });

  it("keeps food recommendations visible when lookup fails, and recovers with Try again", async () => {
    let calls = 0;
    mockApi(async ({ cuisine, city }) => {
      calls += 1;
      if (calls === 1)
        return jsonResponse({ error: { code: "INTERNAL_ERROR", message: "x" } }, 500);
      return jsonResponse(restaurantResult(cuisine, city, ["Shiquan"]));
    });
    const user = await showCalmRecommendations();

    await user.click(screen.getByRole("button", { name: "Find restaurants for Ramen" }));

    const alert = await within(panel()).findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't look up places for ramen/i);
    // The recommendation cards are untouched.
    expect(screen.getByRole("heading", { name: /feeling calm/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mediterranean mezze" })).toBeInTheDocument();

    await user.click(within(alert).getByRole("button", { name: /try again/i }));
    expect(await within(panel()).findByText("Shiquan")).toBeInTheDocument();
    expect(within(panel()).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains when the server can't be reached", async () => {
    mockApi(async () => {
      throw new TypeError("Failed to fetch");
    });
    const user = await showCalmRecommendations();

    await user.click(screen.getByRole("button", { name: "Find restaurants for Ramen" }));

    expect(await within(panel()).findByRole("alert")).toHaveTextContent(
      /couldn't reach the tastesync server/i,
    );
  });

  it("never shows results for the wrong cuisine when lookups overlap", async () => {
    const { pending, handler } = deferredRestaurants();
    mockApi(handler);
    const user = await showCalmRecommendations();

    await user.click(screen.getByRole("button", { name: "Find restaurants for Ramen" }));
    await user.click(
      screen.getByRole("button", { name: "Find restaurants for Mediterranean mezze" }),
    );
    expect(pending.map((p) => p.cuisine)).toEqual(["ramen", "mediterranean"]);

    pending[1]!.resolve(
      jsonResponse(restaurantResult("mediterranean", "Champaign-Urbana", ["Dubai Grill"])),
    );
    pending[0]!.resolve(jsonResponse(restaurantResult("ramen", "Champaign-Urbana", ["Oozu"])));

    const region = await screen.findByRole("region", { name: "Places for mediterranean mezze" });
    expect(await within(region).findByText("Dubai Grill")).toBeInTheDocument();
    expect(screen.queryByText("Oozu")).not.toBeInTheDocument();
  });

  it("never shows results for the wrong city when lookups overlap", async () => {
    const { pending, handler } = deferredRestaurants();
    mockApi(handler);
    const user = await showCalmRecommendations();

    await user.click(screen.getByRole("button", { name: "Find restaurants for Ramen" }));
    await user.clear(cityInput());
    await user.type(cityInput(), "Urbana");
    await user.click(screen.getByRole("button", { name: "Find restaurants for Ramen" }));
    expect(pending.map((p) => p.city)).toEqual(["Champaign-Urbana", "Urbana"]);

    pending[1]!.resolve(jsonResponse(restaurantResult("ramen", "Urbana", ["Urbana Ramen"])));
    pending[0]!.resolve(
      jsonResponse(restaurantResult("ramen", "Champaign-Urbana", ["Old Champaign Ramen"])),
    );

    expect(await within(panel()).findByText("Urbana Ramen")).toBeInTheDocument();
    expect(within(panel()).getByText(/for “urbana”/i)).toBeInTheDocument();
    expect(screen.queryByText("Old Champaign Ramen")).not.toBeInTheDocument();
  });

  it("rejects a response for a different cuisine than requested", async () => {
    mockApi(async ({ city }) => jsonResponse(restaurantResult("pho", city, ["Pho Place"])));
    const user = await showCalmRecommendations();

    await user.click(screen.getByRole("button", { name: "Find restaurants for Ramen" }));

    expect(await within(panel()).findByRole("alert")).toHaveTextContent(/unexpected response/i);
    expect(screen.queryByText("Pho Place")).not.toBeInTheDocument();
  });

  it("notes when the city changes after results are shown, and re-searches on Enter", async () => {
    const { restaurantQueries } = mockApi(async ({ cuisine, city }) =>
      jsonResponse(restaurantResult(cuisine, city, [`${city} spot`])),
    );
    const user = await showCalmRecommendations();

    await user.click(screen.getByRole("button", { name: "Find restaurants for Ramen" }));
    await within(panel()).findByText("Champaign-Urbana spot");

    await user.clear(cityInput());
    await user.type(cityInput(), "Urbana");
    expect(within(panel()).getByText(/you changed the city/i)).toHaveTextContent("“Urbana”");
    // Results stay labeled with the city they came from.
    expect(within(panel()).getByText("Champaign-Urbana spot")).toBeInTheDocument();

    await user.keyboard("[Enter]");
    expect(await within(panel()).findByText("Urbana spot")).toBeInTheDocument();
    expect(within(panel()).queryByText(/you changed the city/i)).not.toBeInTheDocument();
    expect(restaurantQueries.map((q) => q.city)).toEqual(["Champaign-Urbana", "Urbana"]);
  });

  it("clears restaurant results when new recommendations are requested", async () => {
    mockApi(async ({ cuisine, city }) => jsonResponse(restaurantResult(cuisine, city, ["Oozu"])));
    const user = await showCalmRecommendations();

    await user.click(screen.getByRole("button", { name: "Find restaurants for Ramen" }));
    await within(panel()).findByText("Oozu");

    await user.click(screen.getByRole("button", { name: "Get recommendations" }));
    await screen.findByRole("heading", { name: /feeling calm/i });
    expect(screen.queryByRole("region", { name: /^places for/i })).not.toBeInTheDocument();
  });
});
