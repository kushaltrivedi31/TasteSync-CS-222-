/**
 * Types and constants shared by the client and the server.
 *
 * This file must stay dependency-free so both sides can import it directly.
 */

import type { CuisineTag } from "./restaurants.js";

/** The five moods TasteSync supports, in display order. */
export const MOODS = ["upbeat", "calm", "stressed", "low-energy", "adventurous"] as const;

export type Mood = (typeof MOODS)[number];

/** Human-friendly labels for each mood, used by the UI. */
export const MOOD_DETAILS: Record<Mood, { label: string; description: string }> = {
  upbeat: { label: "Upbeat", description: "Good energy, feeling social" },
  calm: { label: "Calm", description: "Relaxed and unhurried" },
  stressed: { label: "Stressed", description: "Busy, deadlines, head full" },
  "low-energy": { label: "Low-energy", description: "Tired, want minimal effort" },
  adventurous: { label: "Adventurous", description: "Ready to try something new" },
};

export function isMood(value: unknown): value is Mood {
  return typeof value === "string" && (MOODS as readonly string[]).includes(value);
}

/**
 * Where the mood came from: picked directly ("manual"), or suggested by the
 * food vibe quiz and confirmed unchanged ("quiz"). If someone changes the quiz
 * suggestion, the mood they pick counts as "manual".
 */
export const MOOD_SOURCES = ["manual", "quiz"] as const;

export type MoodSource = (typeof MOOD_SOURCES)[number];

export interface FoodRecommendation {
  /** Stable identifier, unique across all moods (e.g. "upbeat-street-tacos"). */
  id: string;
  /** The food type or cuisine. */
  name: string;
  /** A short explanation of why it fits the mood. */
  explanation: string;
  /** Tag used to look up matching restaurants. */
  cuisine: CuisineTag;
}

/** Body of POST /api/recommendations. */
export interface RecommendationRequest {
  mood: Mood;
  /** Defaults to "manual" when omitted. */
  source?: MoodSource;
}

/** Successful response from POST /api/recommendations. */
export interface RecommendationResponse {
  mood: Mood;
  source: MoodSource;
  recommendations: FoodRecommendation[];
}

/** Response from GET /api/health. */
export interface HealthResponse {
  status: "ok";
}

export type ApiErrorCode =
  | "INVALID_JSON"
  | "INVALID_REQUEST"
  | "INVALID_MOOD"
  | "INVALID_CUISINE"
  | "INVALID_CITY"
  | "UNSUPPORTED_CITY"
  | "INVALID_LOCATION"
  | "RATE_LIMITED"
  | "PLACES_NOT_CONFIGURED"
  | "PLACES_QUOTA_EXCEEDED"
  | "PLACES_TIMEOUT"
  | "PLACES_PROVIDER_ERROR"
  | "PAYLOAD_TOO_LARGE"
  | "NOT_FOUND"
  | "INTERNAL_ERROR";

/** Every API error uses this shape. */
export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Optional per-field problems, for validation errors. */
    details?: { field: string; message: string }[];
  };
}
