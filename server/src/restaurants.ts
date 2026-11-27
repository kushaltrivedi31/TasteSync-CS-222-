import { z } from "zod";
import rawData from "./data/champaign-urbana-restaurants.json" with { type: "json" };
import {
  CUISINE_TAGS,
  DEMO_AREA,
  type CuisineTag,
  type Restaurant,
  type RestaurantSearchResponse,
} from "../../shared/restaurants.js";

const restaurantSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id must be lowercase kebab-case"),
  name: z.string().trim().min(1, "name must not be empty"),
  address: z.string().trim().min(1, "address must not be empty"),
  city: z.enum(["Champaign", "Urbana"]),
  cuisines: z.array(z.enum(CUISINE_TAGS)).min(1, "each restaurant needs at least one cuisine tag"),
  sources: z
    .array(
      z.object({
        label: z.string().trim().min(1, "source label must not be empty"),
        url: z.url({ protocol: /^https$/, error: "source url must be an https URL" }),
      }),
    )
    .min(1, "each restaurant needs at least one source link"),
});

const datasetSchema = z.strictObject({
  lastVerified: z.iso.date("lastVerified must be a YYYY-MM-DD date"),
  restaurants: z
    .array(restaurantSchema)
    .refine(
      (items) => new Set(items.map((item) => item.id)).size === items.length,
      "restaurant ids must be unique",
    ),
});

export type RestaurantDataset = z.infer<typeof datasetSchema>;

/** Validates restaurant data. Throws a readable error if the JSON file is edited incorrectly. */
export function parseRestaurantData(data: unknown): RestaurantDataset {
  const result = datasetSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Invalid restaurant data:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

// Validated once at startup, so the server refuses to start with bad data.
const dataset = parseRestaurantData(rawData);

/**
 * City names (after normalizeCity) that mean the Champaign-Urbana demo area.
 * The two cities are treated as one area because they border each other.
 */
const DEMO_AREA_ALIASES = new Set([
  "champaign",
  "urbana",
  "champaign urbana",
  "urbana champaign",
  "c u",
  "cu",
  "chambana",
]);

/** Lowercases and strips punctuation, accents, ZIP codes, and state names. */
export function normalizeCity(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,/]/g, " ")
    .replace(/\b\d{5}\b/g, " ")
    .replace(/\b(il|ill|illinois|usa|us)\b/g, " ")
    .replace(/[\s\-\u2013\u2014]+/g, " ")
    .trim();
}

/** True if the city text refers to Champaign, Urbana, or Champaign-Urbana. */
export function isDemoAreaCity(input: string): boolean {
  return DEMO_AREA_ALIASES.has(normalizeCity(input));
}

/**
 * Returns demo restaurants whose cuisine tags include the exact tag, sorted
 * by name. Callers must check the city with isDemoAreaCity first.
 */
export function findRestaurants(cuisine: CuisineTag, cityQuery: string): RestaurantSearchResponse {
  const restaurants: Restaurant[] = dataset.restaurants
    .filter((restaurant) => restaurant.cuisines.includes(cuisine))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((restaurant) => structuredClone(restaurant));

  return {
    area: DEMO_AREA,
    cuisine,
    cityQuery,
    dataset: { kind: "demo", lastVerified: dataset.lastVerified },
    restaurants,
  };
}
