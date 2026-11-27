import { z } from "zod";
import type { ApiErrorCode } from "../../shared/moods.js";
import {
  CUISINE_SEARCH_TERMS,
  MAX_PLACE_RESULTS,
  NEARBY_RADIUS_METERS,
  type Place,
  type PlaceSearchResponse,
} from "../../shared/places.js";
import type { CuisineTag } from "../../shared/restaurants.js";

/** Google Places API (New) Text Search endpoint path. */
const TEXT_SEARCH_PATH = "/v1/places:searchText";
export const DEFAULT_PLACES_BASE_URL = "https://places.googleapis.com";

/**
 * Only the fields TasteSync displays. All are in the Text Search Pro SKU;
 * adding rating, price, hours, phone, or website would move requests to the
 * more expensive Enterprise SKU.
 */
export const PLACES_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.googleMapsUri",
].join(",");

export const PLACES_TIMEOUT_MS = 8000;

export type PlaceSearchArea =
  { kind: "city"; city: string } | { kind: "coordinates"; lat: number; lng: number };

export interface PlacesConfig {
  apiKey: string;
  /** Override for tests (e.g. a local mock server). Defaults to Google. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** A failure the API route turns into a JSON error response. */
export class PlacesError extends Error {
  override name = "PlacesError";
  constructor(
    readonly code: ApiErrorCode,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Rounds coordinates to 3 decimal places (about 100 m) before they leave the
 * server, which is plenty for a restaurant search and avoids sending a
 * precise position to Google.
 */
export function roundCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Builds the Text Search request body from known cuisine terms only. */
export function buildTextSearchBody(cuisine: CuisineTag, area: PlaceSearchArea) {
  const term = CUISINE_SEARCH_TERMS[cuisine];
  if (area.kind === "city") {
    // A location inside textQuery takes priority over locationBias, so none is sent.
    return {
      textQuery: `${term} in ${area.city}`,
      pageSize: MAX_PLACE_RESULTS,
      languageCode: "en",
    };
  }
  return {
    textQuery: term,
    pageSize: MAX_PLACE_RESULTS,
    languageCode: "en",
    locationBias: {
      circle: {
        center: { latitude: roundCoordinate(area.lat), longitude: roundCoordinate(area.lng) },
        radius: NEARBY_RADIUS_METERS,
      },
    },
  };
}

const googlePlaceSchema = z.object({
  id: z.string().min(1).optional(),
  displayName: z.object({ text: z.string().optional() }).optional(),
  formattedAddress: z.string().optional(),
  location: z
    .object({ latitude: z.number().optional(), longitude: z.number().optional() })
    .optional(),
  googleMapsUri: z.string().optional(),
});

const googleResponseSchema = z.object({ places: z.array(z.unknown()).optional() });

function isGoogleMapsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "maps.google.com" ||
        url.hostname === "www.google.com" ||
        url.hostname === "google.com" ||
        url.hostname === "goo.gl" ||
        url.hostname === "maps.app.goo.gl")
    );
  } catch {
    return false;
  }
}

/** A documented Google Maps URL that opens a specific place. */
export function placeSearchUrl(name: string, placeId: string): string {
  const params = new URLSearchParams({ api: "1", query: name, query_place_id: placeId });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

/**
 * Converts Google's response into TasteSync's Place shape. Places without an
 * id, name, or valid coordinates are dropped (they can't be shown on the map),
 * duplicates are removed, and the list is capped.
 */
export function normalizePlaces(data: unknown): Place[] {
  const parsed = googleResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new PlacesError("PLACES_PROVIDER_ERROR", 502, "Google returned an unexpected response.");
  }

  const seen = new Set<string>();
  const places: Place[] = [];
  for (const raw of parsed.data.places ?? []) {
    const result = googlePlaceSchema.safeParse(raw);
    if (!result.success) continue;
    const { id, displayName, formattedAddress, location, googleMapsUri } = result.data;
    const name = displayName?.text?.trim();
    const lat = location?.latitude;
    const lng = location?.longitude;
    if (!id || !name || lat === undefined || lng === undefined) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || seen.has(id)) continue;
    seen.add(id);
    places.push({
      id,
      name,
      address: formattedAddress?.trim() || "Address not provided",
      location: { lat, lng },
      googleMapsUri:
        googleMapsUri && isGoogleMapsUrl(googleMapsUri) ? googleMapsUri : placeSearchUrl(name, id),
    });
    if (places.length >= MAX_PLACE_RESULTS) break;
  }
  return places;
}

function errorFromGoogle(status: number, body: unknown): PlacesError {
  const googleStatus =
    typeof body === "object" && body !== null && "error" in body
      ? (body as { error?: { status?: unknown } }).error?.status
      : undefined;

  if (status === 429 || googleStatus === "RESOURCE_EXHAUSTED") {
    return new PlacesError(
      "PLACES_QUOTA_EXCEEDED",
      503,
      "Google restaurant search has hit its usage limit. Try again later or use the demo list.",
    );
  }
  if (status === 400 || status === 401 || status === 403) {
    return new PlacesError(
      "PLACES_PROVIDER_ERROR",
      502,
      "Google rejected the restaurant search. The server's Places API key, its restrictions, or billing may need attention.",
    );
  }
  return new PlacesError(
    "PLACES_PROVIDER_ERROR",
    502,
    "Google restaurant search isn't responding properly right now. Please try again.",
  );
}

/** Calls Google Places Text Search (New) and returns normalized results. */
export async function searchPlaces(
  config: PlacesConfig,
  cuisine: CuisineTag,
  area: PlaceSearchArea,
): Promise<PlaceSearchResponse> {
  const body = buildTextSearchBody(cuisine, area);
  const fetchImpl = config.fetchImpl ?? fetch;
  const url = `${config.baseUrl ?? DEFAULT_PLACES_BASE_URL}${TEXT_SEARCH_PATH}`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": config.apiKey,
        "X-Goog-FieldMask": PLACES_FIELD_MASK,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeoutMs ?? PLACES_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new PlacesError(
        "PLACES_TIMEOUT",
        504,
        "Google restaurant search took too long. Please try again.",
      );
    }
    throw new PlacesError(
      "PLACES_PROVIDER_ERROR",
      502,
      "The server couldn't reach Google restaurant search. Please try again.",
    );
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // Handled below.
  }

  if (!response.ok) {
    // Log only the status, never the key or request headers.
    console.warn(`Google Places search failed with HTTP ${response.status}`);
    throw errorFromGoogle(response.status, data);
  }

  return {
    provider: "google",
    cuisine,
    query: body.textQuery,
    location:
      area.kind === "city"
        ? { kind: "city", city: area.city }
        : { kind: "coordinates", label: "your current location" },
    places: normalizePlaces(data),
  };
}
