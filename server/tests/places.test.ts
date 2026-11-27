import { describe, expect, it, vi } from "vitest";
import { CUISINE_SEARCH_TERMS, MAX_PLACE_RESULTS } from "../../shared/places.js";
import { CUISINE_TAGS } from "../../shared/restaurants.js";
import {
  PLACES_FIELD_MASK,
  PlacesError,
  buildTextSearchBody,
  normalizePlaces,
  placeSearchUrl,
  roundCoordinate,
  searchPlaces,
} from "../src/places.js";

function googlePlace(n: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `place-${n}`,
    displayName: { text: `Place ${n}`, languageCode: "en" },
    formattedAddress: `${n} Main St, Chicago, IL 60601, USA`,
    location: { latitude: 41.88 + n / 1000, longitude: -87.63 },
    googleMapsUri: `https://maps.google.com/?cid=${n}`,
    ...overrides,
  };
}

describe("buildTextSearchBody", () => {
  it("puts the city in the text query and sends no location bias", () => {
    expect(buildTextSearchBody("ramen", { kind: "city", city: "Chicago, IL" })).toEqual({
      textQuery: "ramen restaurant in Chicago, IL",
      pageSize: MAX_PLACE_RESULTS,
      languageCode: "en",
    });
  });

  it("biases coordinate searches to a circle with rounded coordinates", () => {
    const body = buildTextSearchBody("pho", { kind: "coordinates", lat: 40.112345, lng: -88.2071 });
    expect(body).toEqual({
      textQuery: "pho restaurant",
      pageSize: MAX_PLACE_RESULTS,
      languageCode: "en",
      locationBias: { circle: { center: { latitude: 40.112, longitude: -88.207 }, radius: 8000 } },
    });
  });

  it("has a search term for every cuisine tag", () => {
    for (const tag of CUISINE_TAGS) {
      expect(CUISINE_SEARCH_TERMS[tag].trim().length).toBeGreaterThan(2);
    }
  });

  it("rounds coordinates to about 100 m", () => {
    expect(roundCoordinate(40.11649)).toBe(40.116);
    expect(roundCoordinate(-88.24351)).toBe(-88.244);
  });
});

describe("normalizePlaces", () => {
  it("maps Google fields to TasteSync places", () => {
    expect(normalizePlaces({ places: [googlePlace(1)] })).toEqual([
      {
        id: "place-1",
        name: "Place 1",
        address: "1 Main St, Chicago, IL 60601, USA",
        location: { lat: 41.881, lng: -87.63 },
        googleMapsUri: "https://maps.google.com/?cid=1",
      },
    ]);
  });

  it("returns an empty list when Google finds nothing", () => {
    expect(normalizePlaces({})).toEqual([]);
    expect(normalizePlaces({ places: [] })).toEqual([]);
  });

  it("drops places without an id, name, or usable coordinates, and duplicates", () => {
    const places = normalizePlaces({
      places: [
        googlePlace(1),
        googlePlace(2, { id: undefined }),
        googlePlace(3, { displayName: { text: "  " } }),
        googlePlace(4, { location: { latitude: 41.9 } }),
        googlePlace(5, { location: { latitude: 120, longitude: 0 } }),
        googlePlace(1),
        "not an object",
      ],
    });
    expect(places.map((p) => p.id)).toEqual(["place-1"]);
  });

  it("fills a missing address and replaces missing or non-Google links", () => {
    const [noAddress, badLink] = normalizePlaces({
      places: [
        googlePlace(1, { formattedAddress: undefined, googleMapsUri: undefined }),
        googlePlace(2, { googleMapsUri: "https://evil.example.com/maps" }),
      ],
    });
    expect(noAddress!.address).toBe("Address not provided");
    expect(noAddress!.googleMapsUri).toBe(placeSearchUrl("Place 1", "place-1"));
    expect(badLink!.googleMapsUri).toBe(placeSearchUrl("Place 2", "place-2"));
    expect(placeSearchUrl("A & B", "abc")).toBe(
      "https://www.google.com/maps/search/?api=1&query=A+%26+B&query_place_id=abc",
    );
  });

  it("caps the number of results", () => {
    const many = Array.from({ length: 25 }, (_, n) => googlePlace(n));
    expect(normalizePlaces({ places: many })).toHaveLength(MAX_PLACE_RESULTS);
  });

  it("rejects a response that isn't the expected shape", () => {
    expect(() => normalizePlaces({ places: "nope" })).toThrow(PlacesError);
  });
});

describe("searchPlaces", () => {
  it("calls Text Search (New) with the key and a minimal field mask", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ places: [googlePlace(1)] }));

    const result = await searchPlaces(
      { apiKey: "server-key", fetchImpl, baseUrl: "https://places.test" },
      "sichuan",
      { kind: "city", city: "Chicago, IL" },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://places.test/v1/places:searchText");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "X-Goog-Api-Key": "server-key",
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri",
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      textQuery: "Sichuan restaurant in Chicago, IL",
    });
    expect(PLACES_FIELD_MASK).not.toMatch(/rating|priceLevel|websiteUri|regularOpeningHours/);
    expect(result).toMatchObject({
      provider: "google",
      cuisine: "sichuan",
      query: "Sichuan restaurant in Chicago, IL",
      location: { kind: "city", city: "Chicago, IL" },
    });
  });

  it("labels coordinate searches without echoing the coordinates", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ places: [] }));
    const result = await searchPlaces({ apiKey: "k", fetchImpl }, "pho", {
      kind: "coordinates",
      lat: 40.1,
      lng: -88.2,
    });
    expect(result.location).toEqual({ kind: "coordinates", label: "your current location" });
    expect(JSON.stringify(result)).not.toContain("40.1");
  });

  it.each([
    [429, {}, "PLACES_QUOTA_EXCEEDED", 503],
    [403, { error: { status: "RESOURCE_EXHAUSTED" } }, "PLACES_QUOTA_EXCEEDED", 503],
    [403, { error: { status: "PERMISSION_DENIED" } }, "PLACES_PROVIDER_ERROR", 502],
    [400, { error: { status: "INVALID_ARGUMENT" } }, "PLACES_PROVIDER_ERROR", 502],
    [500, null, "PLACES_PROVIDER_ERROR", 502],
  ])("maps Google HTTP %i to %s", async (status, body, code, httpStatus) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    const error = await searchPlaces({ apiKey: "secret-key", fetchImpl }, "ramen", {
      kind: "city",
      city: "Chicago",
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlacesError);
    expect(error).toMatchObject({ code, status: httpStatus });
    expect((error as Error).message).not.toContain("secret-key");
  });

  it("never logs the API key", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 403 }));
    await searchPlaces({ apiKey: "secret-key", fetchImpl }, "ramen", {
      kind: "city",
      city: "Chicago",
    }).catch(() => {});
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret-key");
  });

  it("times out slow responses", async () => {
    const fetchImpl = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const error = await searchPlaces({ apiKey: "k", fetchImpl, timeoutMs: 20 }, "ramen", {
      kind: "city",
      city: "Chicago",
    }).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "PLACES_TIMEOUT", status: 504 });
  });

  it("reports network failures as provider errors", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const error = await searchPlaces({ apiKey: "k", fetchImpl }, "ramen", {
      kind: "city",
      city: "Chicago",
    }).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "PLACES_PROVIDER_ERROR", status: 502 });
  });
});
