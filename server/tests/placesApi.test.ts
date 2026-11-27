import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { ApiErrorResponse } from "../../shared/moods.js";
import type { PlaceSearchResponse } from "../../shared/places.js";
import { createApp } from "../src/app.js";

const PLACE = {
  id: "abc",
  displayName: { text: "Oozu Ramen Bar" },
  formattedAddress: "601 S 6th St, Champaign, IL 61820, USA",
  location: { latitude: 40.11, longitude: -88.23 },
  googleMapsUri: "https://maps.google.com/?cid=1",
};

function appWithGoogle(
  response: () => Promise<Response> = async () => Response.json({ places: [PLACE] }),
) {
  const fetchImpl = vi.fn(response);
  const app = createApp({
    places: { apiKey: "server-secret", fetchImpl },
    placesRateLimit: { windowMs: 60_000, max: 100 },
  });
  return { app, fetchImpl };
}

function errorOf(body: unknown) {
  return (body as ApiErrorResponse).error;
}

describe("GET /api/places/search", () => {
  it("returns normalized Google results for a city", async () => {
    const { app, fetchImpl } = appWithGoogle();
    const res = await request(app)
      .get("/api/places/search")
      .query({ cuisine: "ramen", city: "Chicago, IL" });

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    const body = res.body as PlaceSearchResponse;
    expect(body).toMatchObject({
      provider: "google",
      cuisine: "ramen",
      query: "ramen restaurant in Chicago, IL",
      location: { kind: "city", city: "Chicago, IL" },
    });
    expect(body.places).toEqual([
      {
        id: "abc",
        name: "Oozu Ramen Bar",
        address: "601 S 6th St, Champaign, IL 61820, USA",
        location: { lat: 40.11, lng: -88.23 },
        googleMapsUri: "https://maps.google.com/?cid=1",
      },
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(res.body)).not.toContain("server-secret");
  });

  it("supports coordinates for 'Use my location'", async () => {
    const { app, fetchImpl } = appWithGoogle();
    const res = await request(app)
      .get("/api/places/search")
      .query({ cuisine: "pho", lat: "40.116489", lng: "-88.243512" });

    expect(res.status).toBe(200);
    expect((res.body as PlaceSearchResponse).location).toEqual({
      kind: "coordinates",
      label: "your current location",
    });
    const sent = JSON.parse(
      String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    );
    expect(sent.locationBias.circle.center).toEqual({ latitude: 40.116, longitude: -88.244 });
  });

  it("explains when Google search isn't configured, without calling Google", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/api/places/search")
      .query({ cuisine: "ramen", city: "Chicago" });
    expect(res.status).toBe(503);
    expect(errorOf(res.body).code).toBe("PLACES_NOT_CONFIGURED");
  });

  it.each([
    [{ city: "Chicago" }, "INVALID_CUISINE"],
    [{ cuisine: "sushi", city: "Chicago" }, "INVALID_CUISINE"],
    [{ cuisine: "ramen" }, "INVALID_LOCATION"],
    [{ cuisine: "ramen", city: "C" }, "INVALID_LOCATION"],
    [{ cuisine: "ramen", city: "x".repeat(101) }, "INVALID_LOCATION"],
    [{ cuisine: "ramen", city: "Chicago<script>" }, "INVALID_LOCATION"],
    [{ cuisine: "ramen", city: "Chicago", lat: "40", lng: "-88" }, "INVALID_LOCATION"],
    [{ cuisine: "ramen", lat: "40" }, "INVALID_LOCATION"],
    [{ cuisine: "ramen", lat: "91", lng: "0" }, "INVALID_LOCATION"],
    [{ cuisine: "ramen", lat: "0", lng: "-181" }, "INVALID_LOCATION"],
    [{ cuisine: "ramen", lat: "abc", lng: "0" }, "INVALID_LOCATION"],
    [{ cuisine: "ramen", lat: "", lng: "" }, "INVALID_LOCATION"],
  ])("rejects invalid input %j", async (query, code) => {
    const { app, fetchImpl } = appWithGoogle();
    const res = await request(app).get("/api/places/search").query(query);
    expect(res.status).toBe(400);
    expect(errorOf(res.body).code).toBe(code);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("accepts international city names", async () => {
    const { app } = appWithGoogle();
    const res = await request(app)
      .get("/api/places/search")
      .query({ cuisine: "ramen", city: "São Paulo, Brazil" });
    expect(res.status).toBe(200);
  });

  it("returns an empty list when Google finds nothing", async () => {
    const { app } = appWithGoogle(async () => Response.json({}));
    const res = await request(app)
      .get("/api/places/search")
      .query({ cuisine: "peruvian", city: "Boise" });
    expect(res.status).toBe(200);
    expect((res.body as PlaceSearchResponse).places).toEqual([]);
  });

  it("reports quota errors", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { app } = appWithGoogle(
      async () =>
        new Response(JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED" } }), { status: 429 }),
    );
    const res = await request(app)
      .get("/api/places/search")
      .query({ cuisine: "ramen", city: "Chicago" });
    expect(res.status).toBe(503);
    expect(errorOf(res.body).code).toBe("PLACES_QUOTA_EXCEEDED");
  });

  it("reports provider errors without exposing details", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { app } = appWithGoogle(
      async () =>
        new Response(
          JSON.stringify({
            error: { status: "PERMISSION_DENIED", message: "key server-secret bad" },
          }),
          {
            status: 403,
          },
        ),
    );
    const res = await request(app)
      .get("/api/places/search")
      .query({ cuisine: "ramen", city: "Chicago" });
    expect(res.status).toBe(502);
    expect(errorOf(res.body).code).toBe("PLACES_PROVIDER_ERROR");
    expect(JSON.stringify(res.body)).not.toContain("server-secret");
  });

  it("rate limits repeated searches from one client", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ places: [] }));
    const app = createApp({
      places: { apiKey: "k", fetchImpl },
      placesRateLimit: { windowMs: 60_000, max: 2 },
    });
    const query = { cuisine: "ramen", city: "Chicago" };
    expect((await request(app).get("/api/places/search").query(query)).status).toBe(200);
    expect((await request(app).get("/api/places/search").query(query)).status).toBe(200);
    const limited = await request(app).get("/api/places/search").query(query);
    expect(limited.status).toBe(429);
    expect(errorOf(limited.body).code).toBe("RATE_LIMITED");
    expect(limited.headers["retry-after"]).toBeDefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("POST /api/recommendations source", () => {
  const app = createApp();

  it("defaults to manual", async () => {
    const res = await request(app).post("/api/recommendations").send({ mood: "calm" });
    expect(res.body.source).toBe("manual");
  });

  it("echoes a quiz source", async () => {
    const res = await request(app)
      .post("/api/recommendations")
      .send({ mood: "calm", source: "quiz" });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe("quiz");
  });

  it("rejects an unknown source", async () => {
    const res = await request(app)
      .post("/api/recommendations")
      .send({ mood: "calm", source: "spotify" });
    expect(res.status).toBe(400);
    expect(errorOf(res.body).code).toBe("INVALID_REQUEST");
  });
});
