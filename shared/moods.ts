/**
 * Types and constants shared by the client and the server.
 *
 * This file must stay dependency-free so both sides can import it directly.
 */

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
 * Where the mood came from. Phase 1 only supports moods the user picks
 * themselves; a music-derived source may be added in Phase 2.
 */
export type MoodSource = "manual";

export interface FoodRecommendation {
  /** Stable identifier, unique across all moods (e.g. "upbeat-street-tacos"). */
  id: string;
  /** The food type or cuisine. */
  name: string;
  /** A short explanation of why it fits the mood. */
  explanation: string;
}

/** Body of POST /api/recommendations. */
export interface RecommendationRequest {
  mood: Mood;
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
