import express, { type ErrorRequestHandler, type Response } from "express";
import { z } from "zod";
import {
  MOOD_SOURCES,
  MOODS,
  type ApiErrorCode,
  type ApiErrorResponse,
  type HealthResponse,
  type RecommendationResponse,
} from "../../shared/moods.js";
import {
  CUISINE_TAGS,
  DEMO_AREA,
  type RestaurantSearchResponse,
} from "../../shared/restaurants.js";
import { getRecommendations } from "./engine.js";
import { PlacesError, searchPlaces, type PlaceSearchArea, type PlacesConfig } from "./places.js";
import { createRateLimiter, type RateLimitOptions } from "./rateLimit.js";
import { findRestaurants, isDemoAreaCity } from "./restaurants.js";

const moodList = MOODS.join(", ");

const recommendationRequestSchema = z.object(
  {
    mood: z.enum(MOODS, {
      error: (issue) =>
        issue.input === undefined ? "mood is required" : `mood must be one of: ${moodList}`,
    }),
    source: z
      .enum(MOOD_SOURCES, { error: `source must be one of: ${MOOD_SOURCES.join(", ")}` })
      .default("manual"),
  },
  { error: "Request body must be a JSON object" },
);

const restaurantQuerySchema = z.object({
  cuisine: z.enum(CUISINE_TAGS, {
    error: (issue) =>
      issue.input === undefined
        ? "cuisine is required"
        : "cuisine must be one of the supported cuisine tags",
  }),
  city: z
    .string({ error: "city is required" })
    .trim()
    .min(1, "city is required")
    .max(100, "city must be 100 characters or fewer"),
});

/** A required numeric query value; rejects blanks instead of coercing them to 0. */
function coordinate(name: string, limit: number) {
  return z
    .string({ error: `${name} must be a number` })
    .trim()
    .min(1, `${name} must be a number`)
    .transform(Number)
    .pipe(
      z
        .number({ error: `${name} must be a number` })
        .min(-limit, `${name} must be between -${limit} and ${limit}`)
        .max(limit, `${name} must be between -${limit} and ${limit}`),
    );
}

const placesQuerySchema = z
  .object({
    cuisine: z.enum(CUISINE_TAGS, {
      error: (issue) =>
        issue.input === undefined
          ? "cuisine is required"
          : "cuisine must be one of the supported cuisine tags",
    }),
    city: z
      .string({ error: "city must be text" })
      .trim()
      .min(2, "city must be at least 2 characters")
      .max(100, "city must be 100 characters or fewer")
      .regex(/^[\p{L}\p{M}\p{N} .,'’()-]+$/u, "city contains characters that aren't allowed")
      .optional(),
    lat: coordinate("lat", 90).optional(),
    lng: coordinate("lng", 180).optional(),
  })
  .superRefine((query, ctx) => {
    const hasCity = query.city !== undefined;
    const hasLat = query.lat !== undefined;
    const hasLng = query.lng !== undefined;
    if (hasLat !== hasLng) {
      ctx.addIssue({
        code: "custom",
        path: ["location"],
        message: "lat and lng must be sent together",
      });
    } else if (hasCity === hasLat) {
      ctx.addIssue({
        code: "custom",
        path: ["location"],
        message: "Send either a city or lat and lng, not both or neither",
      });
    }
  });

export interface AppOptions {
  /** Google Places API (New) settings. Omit to run without Google search. */
  places?: Omit<PlacesConfig, "apiKey"> & { apiKey?: string };
  /** Limits for /api/places requests. Defaults to 20 per minute per client. */
  placesRateLimit?: RateLimitOptions;
}

function sendError(
  res: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: ApiErrorResponse["error"]["details"],
): void {
  const body: ApiErrorResponse = { error: { code, message, ...(details ? { details } : {}) } };
  res.status(status).json(body);
}

/**
 * Builds the Express app without starting a server, so tests can use it
 * directly with Supertest.
 */
export function createApp(options: AppOptions = {}): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "10kb" }));

  app.get("/api/health", (_req, res) => {
    const body: HealthResponse = { status: "ok" };
    res.json(body);
  });

  app.post("/api/recommendations", (req, res) => {
    // req.body is undefined when no JSON body was sent.
    const result = recommendationRequestSchema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.length > 0 ? issue.path.join(".") : "body",
        message: issue.message,
      }));
      const moodIssue = result.error.issues.some((issue) => issue.path[0] === "mood");
      const first = details[0]?.message ?? "Invalid request";
      sendError(res, 400, moodIssue ? "INVALID_MOOD" : "INVALID_REQUEST", first, details);
      return;
    }

    const body: RecommendationResponse = getRecommendations(result.data.mood, result.data.source);
    res.json(body);
  });

  // Demo restaurant lookup: GET /api/restaurants?cuisine=ramen&city=Champaign
  app.get("/api/restaurants", (req, res) => {
    const result = restaurantQuerySchema.safeParse(req.query);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join(".") || "query",
        message: issue.message,
      }));
      const cuisineIssue = result.error.issues.some((issue) => issue.path[0] === "cuisine");
      const first = details[0]?.message ?? "Invalid request";
      sendError(res, 400, cuisineIssue ? "INVALID_CUISINE" : "INVALID_CITY", first, details);
      return;
    }

    const { cuisine, city } = result.data;
    if (!isDemoAreaCity(city)) {
      sendError(
        res,
        422,
        "UNSUPPORTED_CITY",
        `Restaurant suggestions are demo data that only cover ${DEMO_AREA.name}.`,
        [{ field: "city", message: "Try Champaign, Urbana, or Champaign-Urbana." }],
      );
      return;
    }

    const body: RestaurantSearchResponse = findRestaurants(cuisine, city);
    res.json(body);
  });

  // Google restaurant search: GET /api/places/search?cuisine=ramen&city=Chicago, IL
  // or GET /api/places/search?cuisine=ramen&lat=40.11&lng=-88.24
  app.get(
    "/api/places/search",
    createRateLimiter(options.placesRateLimit ?? { windowMs: 60_000, max: 20 }),
    async (req, res, next) => {
      const result = placesQuerySchema.safeParse(req.query);
      if (!result.success) {
        const details = result.error.issues.map((issue) => ({
          field: issue.path.join(".") || "query",
          message: issue.message,
        }));
        const cuisineIssue = result.error.issues.some((issue) => issue.path[0] === "cuisine");
        const first = details[0]?.message ?? "Invalid request";
        sendError(res, 400, cuisineIssue ? "INVALID_CUISINE" : "INVALID_LOCATION", first, details);
        return;
      }

      const apiKey = options.places?.apiKey;
      if (!apiKey) {
        sendError(
          res,
          503,
          "PLACES_NOT_CONFIGURED",
          "Google restaurant search isn't configured on this server.",
        );
        return;
      }

      const { cuisine, city, lat, lng } = result.data;
      const area: PlaceSearchArea =
        city !== undefined
          ? { kind: "city", city }
          : { kind: "coordinates", lat: lat as number, lng: lng as number };

      try {
        const body = await searchPlaces({ ...options.places, apiKey }, cuisine, area);
        // Places content must not be cached by browsers or proxies.
        res.setHeader("Cache-Control", "no-store");
        res.json(body);
      } catch (error) {
        if (error instanceof PlacesError) {
          sendError(res, error.status, error.code, error.message);
          return;
        }
        next(error);
      }
    },
  );

  app.use("/api", (_req, res) => {
    sendError(res, 404, "NOT_FOUND", "API route not found");
  });

  const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const type = typeof err === "object" && err !== null && "type" in err ? err.type : undefined;
    if (type === "entity.parse.failed") {
      sendError(res, 400, "INVALID_JSON", "Request body is not valid JSON");
      return;
    }
    if (type === "entity.too.large") {
      sendError(res, 413, "PAYLOAD_TOO_LARGE", "Request body is too large");
      return;
    }
    console.error(err);
    sendError(res, 500, "INTERNAL_ERROR", "Something went wrong on the server");
  };
  app.use(errorHandler);

  return app;
}
