import type { ApiErrorResponse, Mood, RecommendationResponse } from "../../shared/moods";

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

function isRecommendationResponse(value: unknown, mood: Mood): value is RecommendationResponse {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Partial<RecommendationResponse>;
  return (
    body.mood === mood &&
    body.source === "manual" &&
    Array.isArray(body.recommendations) &&
    body.recommendations.length === 3 &&
    body.recommendations.every(
      (r) =>
        typeof r?.id === "string" &&
        typeof r.name === "string" &&
        typeof r.explanation === "string",
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
): Promise<RecommendationResponse> {
  let response: Response;
  try {
    response = await fetch("/api/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mood }),
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

  if (!isRecommendationResponse(body, mood)) {
    throw new RecommendationError("The server sent back an unexpected response. Please try again.");
  }

  return body;
}
