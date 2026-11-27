/**
 * Types and constants for restaurant lookup, shared by the client and server.
 * Must stay dependency-free.
 */

/**
 * Cuisine tags that connect food recommendations to restaurants. Every
 * recommendation has exactly one tag, and a restaurant matches only if its
 * own tag list contains that exact tag (no fuzzy matching).
 */
export const CUISINE_TAGS = [
  "street-tacos",
  "poke",
  "korean-fried-chicken",
  "ramen",
  "mediterranean",
  "cafe-soup-sandwich",
  "mac-and-cheese",
  "pizza-by-the-slice",
  "burrito-bowl",
  "pho",
  "chicken-and-rice",
  "bagels",
  "ethiopian",
  "sichuan",
  "peruvian",
] as const;

export type CuisineTag = (typeof CUISINE_TAGS)[number];

export function isCuisineTag(value: unknown): value is CuisineTag {
  return typeof value === "string" && (CUISINE_TAGS as readonly string[]).includes(value);
}

/** The only area the Phase 2 demo dataset covers. */
export const DEMO_AREA = {
  id: "champaign-urbana",
  name: "Champaign-Urbana, IL",
} as const;

/** City shown in the city input by default. */
export const DEFAULT_CITY_INPUT = "Champaign-Urbana";

export interface RestaurantSource {
  /** Where the details were checked, e.g. "Official website". */
  label: string;
  url: string;
}

export interface Restaurant {
  id: string;
  name: string;
  /** Street address as published by the cited sources. */
  address: string;
  city: "Champaign" | "Urbana";
  cuisines: CuisineTag[];
  sources: RestaurantSource[];
}

/** Successful response from GET /api/restaurants. */
export interface RestaurantSearchResponse {
  area: typeof DEMO_AREA;
  cuisine: CuisineTag;
  /** The city text the user searched for, trimmed. */
  cityQuery: string;
  dataset: {
    kind: "demo";
    /** ISO date (YYYY-MM-DD) the listings were last checked. */
    lastVerified: string;
  };
  restaurants: Restaurant[];
}
