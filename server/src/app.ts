import express, { type ErrorRequestHandler, type Response } from "express";
import { z } from "zod";
import {
  MOODS,
  type ApiErrorCode,
  type ApiErrorResponse,
  type HealthResponse,
  type RecommendationResponse,
} from "../../shared/moods.js";
import { getRecommendations } from "./engine.js";

const moodList = MOODS.join(", ");

const recommendationRequestSchema = z.object(
  {
    mood: z.enum(MOODS, {
      error: (issue) =>
        issue.input === undefined ? "mood is required" : `mood must be one of: ${moodList}`,
    }),
  },
  { error: "Request body must be a JSON object" },
);

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
export function createApp(): express.Express {
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

    const body: RecommendationResponse = getRecommendations(result.data.mood);
    res.json(body);
  });

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
