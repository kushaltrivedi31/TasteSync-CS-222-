import type {
  ApiErrorResponse,
  Mood,
  MoodSource,
  RecommendationResponse,
} from "../../shared/moods";
import type { Place, PlaceSearchResponse } from "../../shared/places";
import {
  DEMO_AREA,
  type CuisineTag,
  type Restaurant,
  type RestaurantSearchResponse,
} from "../../shared/restaurants";

/** An error with a message that is safe to show to the user. */
export class RecommendationError extends Error {
  override name = "RecommendationError";
}

function isErrorResponse(value: unknown): value is ApiErrorResponse {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const error = value.error;
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  );
}

function isRecommendationResponse(
  value: unknown,
  mood: Mood,
  source: MoodSource,
): value is RecommendationResponse {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Partial<RecommendationResponse>;
  return (
    body.mood === mood &&
    body.source === source &&
    Array.isArray(body.recommendations) &&
    body.recommendations.length === 3 &&
    body.recommendations.every(
      (r) =>
        typeof r?.id === "string" &&
        typeof r.name === "string" &&
        typeof r.explanation === "string" &&
        typeof r.cuisine === "string",
    )
  );
}

/**
 * Asks the TasteSync backend for recommendations. In development, Vite
 * proxies /api to the Express server (see vite.config.ts).
 */
export async function fetchRecommendations(
  mood: Mood,
  signal?: AbortSignal,
  source: MoodSource = "manual",
): Promise<RecommendationResponse> {
  let response: Response;
  try {
    response = await fetch("/api/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mood, source }),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new RecommendationError(
      "We couldn't reach the TasteSync server. Check that the backend is running, then try again.",
    );
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Fall through: handled below as an unexpected response.
  }

  if (!response.ok) {
    const detail = isErrorResponse(body) ? ` (${body.error.message})` : "";
    throw new RecommendationError(
      `The server couldn't load recommendations right now${detail}. Please try again.`,
    );
  }

  if (!isRecommendationResponse(body, mood, source)) {
    throw new RecommendationError("The server sent back an unexpected response. Please try again.");
  }

  return body;
}

export type RestaurantErrorKind = "unsupported-city" | "invalid-city" | "failed";

/** A restaurant lookup error with a message that is safe to show to the user. */
export class RestaurantLookupError extends Error {
  override name = "RestaurantLookupError";
  constructor(
    readonly kind: RestaurantErrorKind,
    message: string,
  ) {
    super(message);
  }
}

function isRestaurant(value: unknown): value is Restaurant {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Partial<Restaurant>;
  return (
    typeof r.id === "string" &&
    typeof r.name === "string" &&
    typeof r.address === "string" &&
    Array.isArray(r.cuisines) &&
    Array.isArray(r.sources) &&
    r.sources.every((s) => typeof s?.label === "string" && typeof s.url === "string")
  );
}

function isRestaurantSearchResponse(
  value: unknown,
  cuisine: CuisineTag,
  cityQuery: string,
): value is RestaurantSearchResponse {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Partial<RestaurantSearchResponse>;
  return (
    body.area?.id === DEMO_AREA.id &&
    body.cuisine === cuisine &&
    body.cityQuery === cityQuery &&
    body.dataset?.kind === "demo" &&
    Array.isArray(body.restaurants) &&
    body.restaurants.every(
      (restaurant) => isRestaurant(restaurant) && restaurant.cuisines.includes(cuisine),
    )
  );
}

/** Looks up demo restaurants for a cuisine in the given city. */
export async function fetchRestaurants(
  cuisine: CuisineTag,
  city: string,
  signal?: AbortSignal,
): Promise<RestaurantSearchResponse> {
  const cityQuery = city.trim();
  const params = new URLSearchParams({ cuisine, city: cityQuery });

  let response: Response;
  try {
    response = await fetch(`/api/restaurants?${params.toString()}`, { signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new RestaurantLookupError(
      "failed",
      "We couldn't reach the TasteSync server. Check that the backend is running, then try again.",
    );
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Handled below as an unexpected response.
  }

  if (!response.ok) {
    const code = isErrorResponse(body) ? body.error.code : undefined;
    if (code === "UNSUPPORTED_CITY") {
      throw new RestaurantLookupError("unsupported-city", (body as ApiErrorResponse).error.message);
    }
    if (code === "INVALID_CITY") {
      throw new RestaurantLookupError("invalid-city", (body as ApiErrorResponse).error.message);
    }
    throw new RestaurantLookupError(
      "failed",
      "The server couldn't look up restaurants right now. Please try again.",
    );
  }

  if (!isRestaurantSearchResponse(body, cuisine, cityQuery)) {
    throw new RestaurantLookupError(
      "failed",
      "The server sent back an unexpected response. Please try again.",
    );
  }

  return body;
}

export type PlacesErrorKind = "not-configured" | "quota" | "invalid-location" | "failed";

/** A Google restaurant search error with a message that is safe to show to the user. */
export class PlacesLookupError extends Error {
  override name = "PlacesLookupError";
  constructor(
    readonly kind: PlacesErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export type GoogleSearchArea =
  { kind: "city"; city: string } | { kind: "coordinates"; lat: number; lng: number };

function isPlace(value: unknown): value is Place {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Partial<Place>;
  return (
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    typeof p.address === "string" &&
    typeof p.googleMapsUri === "string" &&
    p.googleMapsUri.startsWith("https://") &&
    typeof p.location?.lat === "number" &&
    typeof p.location.lng === "number"
  );
}

function isPlaceSearchResponse(
  value: unknown,
  cuisine: CuisineTag,
  area: GoogleSearchArea,
): value is PlaceSearchResponse {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Partial<PlaceSearchResponse>;
  const locationMatches =
    area.kind === "city"
      ? body.location?.kind === "city" && body.location.city === area.city
      : body.location?.kind === "coordinates";
  return (
    body.provider === "google" &&
    body.cuisine === cuisine &&
    typeof body.query === "string" &&
    locationMatches &&
    Array.isArray(body.places) &&
    body.places.every(isPlace)
  );
}

/** Searches Google Places (through the TasteSync server) for a cuisine in an area. */
export async function fetchGooglePlaces(
  cuisine: CuisineTag,
  area: GoogleSearchArea,
  signal?: AbortSignal,
): Promise<PlaceSearchResponse> {
  const params = new URLSearchParams({ cuisine });
  if (area.kind === "city") {
    params.set("city", area.city);
  } else {
    params.set("lat", String(area.lat));
    params.set("lng", String(area.lng));
  }

  let response: Response;
  try {
    response = await fetch(`/api/places/search?${params.toString()}`, { signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new PlacesLookupError(
      "failed",
      "We couldn't reach the TasteSync server. Check that the backend is running, then try again.",
    );
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Handled below.
  }

  if (!response.ok) {
    const error = isErrorResponse(body) ? body.error : undefined;
    switch (error?.code) {
      case "PLACES_NOT_CONFIGURED":
        throw new PlacesLookupError(
          "not-configured",
          "Google restaurant search isn't set up on this server yet.",
        );
      case "PLACES_QUOTA_EXCEEDED":
        throw new PlacesLookupError("quota", error.message);
      case "INVALID_LOCATION":
        throw new PlacesLookupError("invalid-location", error.message);
      case "RATE_LIMITED":
      case "PLACES_TIMEOUT":
      case "PLACES_PROVIDER_ERROR":
        throw new PlacesLookupError("failed", error.message);
      default:
        throw new PlacesLookupError(
          "failed",
          "The server couldn't search for restaurants right now. Please try again.",
        );
    }
  }

  if (!isPlaceSearchResponse(body, cuisine, area)) {
    throw new PlacesLookupError(
      "failed",
      "The server sent back an unexpected response. Please try again.",
    );
  }
  return body;
}
