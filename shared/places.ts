/**
 * Types and constants for Google Places restaurant search, shared by the
 * client and server. Must stay dependency-free.
 */
import type { CuisineTag } from "./restaurants.js";

/**
 * The text TasteSync sends to Google for each cuisine tag. Queries are only
 * ever built from this table, never from free text, so users can't change
 * what is searched for beyond the location.
 */
export const CUISINE_SEARCH_TERMS: Record<CuisineTag, string> = {
  "street-tacos": "taqueria tacos",
  poke: "poke bowl restaurant",
  "korean-fried-chicken": "Korean fried chicken restaurant",
  ramen: "ramen restaurant",
  mediterranean: "Mediterranean restaurant",
  "cafe-soup-sandwich": "cafe with soup and sandwiches",
  "mac-and-cheese": "restaurant with mac and cheese",
  "pizza-by-the-slice": "pizza by the slice",
  "burrito-bowl": "burrito bowl restaurant",
  pho: "pho restaurant",
  "chicken-and-rice": "halal chicken and rice",
  bagels: "bagel shop",
  ethiopian: "Ethiopian restaurant",
  sichuan: "Sichuan restaurant",
  peruvian: "Peruvian restaurant",
};

/** Maximum results requested from Google and returned to the browser. */
export const MAX_PLACE_RESULTS = 10;

/** Radius used to bias "Use my location" searches, in meters. */
export const NEARBY_RADIUS_METERS = 8000;

export interface Place {
  /** Google place ID (the only Places field that may be stored long-term). */
  id: string;
  name: string;
  address: string;
  location: { lat: number; lng: number };
  /** Link that opens the place in Google Maps. */
  googleMapsUri: string;
}

export type PlaceSearchLocation =
  { kind: "city"; city: string } | { kind: "coordinates"; label: string };

/** Successful response from GET /api/places/search. */
export interface PlaceSearchResponse {
  provider: "google";
  cuisine: CuisineTag;
  /** The exact text query sent to Google. */
  query: string;
  location: PlaceSearchLocation;
  places: Place[];
}
