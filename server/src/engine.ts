import { z } from "zod";
import rawMappings from "./data/mood-mappings.json" with { type: "json" };
import {
  MOODS,
  type FoodRecommendation,
  type Mood,
  type MoodSource,
  type RecommendationResponse,
} from "../../shared/moods.js";
import { CUISINE_TAGS } from "../../shared/restaurants.js";

/** Number of recommendations returned for every mood. */
export const RECOMMENDATIONS_PER_MOOD = 3;

const recommendationSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id must be lowercase kebab-case (e.g. calm-ramen)"),
  name: z.string().trim().min(1, "name must not be empty"),
  explanation: z.string().trim().min(1, "explanation must not be empty"),
  cuisine: z.enum(CUISINE_TAGS),
});

const moodListSchema = z
  .array(recommendationSchema)
  .length(
    RECOMMENDATIONS_PER_MOOD,
    `each mood needs exactly ${RECOMMENDATIONS_PER_MOOD} recommendations`,
  )
  .refine(
    (items) => new Set(items.map((item) => item.name.toLowerCase())).size === items.length,
    "recommendation names within a mood must be distinct",
  );

const mappingsSchema = z
  .strictObject(
    Object.fromEntries(MOODS.map((mood) => [mood, moodListSchema])) as Record<
      Mood,
      typeof moodListSchema
    >,
  )
  .refine((mappings) => {
    const ids = Object.values(mappings).flatMap((items) => items.map((item) => item.id));
    return new Set(ids).size === ids.length;
  }, "recommendation ids must be unique across all moods");

export type MoodMappings = Record<Mood, FoodRecommendation[]>;

/**
 * Checks that mapping data is complete and well-formed. Throws a readable
 * error if someone edits mood-mappings.json incorrectly.
 */
export function parseMappings(data: unknown): MoodMappings {
  const result = mappingsSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Invalid mood mappings:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

// Validated once at startup, so the server refuses to start with bad data.
const mappings = parseMappings(rawMappings);

/**
 * Returns the curated recommendations for a mood. The result is deterministic:
 * the same mood always produces the same three recommendations in the same order.
 */
export function getRecommendations(
  mood: Mood,
  source: MoodSource = "manual",
): RecommendationResponse {
  return {
    mood,
    source,
    // Copy so callers can't mutate the shared mapping data.
    recommendations: mappings[mood].map((item) => ({ ...item })),
  };
}
