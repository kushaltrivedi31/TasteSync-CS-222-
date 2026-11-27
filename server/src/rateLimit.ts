import type { RequestHandler } from "express";
import type { ApiErrorResponse } from "../../shared/moods.js";

export interface RateLimitOptions {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Requests allowed per client per window. */
  max: number;
  now?: () => number;
}

/**
 * A small in-memory, fixed-window rate limiter keyed by client IP. It is
 * enough to stop accidental request loops from burning Google quota on a
 * single local server; it is not a substitute for quotas set in Google Cloud.
 */
export function createRateLimiter({
  windowMs,
  max,
  now = Date.now,
}: RateLimitOptions): RequestHandler {
  const hits = new Map<string, { windowStart: number; count: number }>();

  return (req, res, next) => {
    const key = req.ip ?? "unknown";
    const time = now();
    const entry = hits.get(key);

    if (!entry || time - entry.windowStart >= windowMs) {
      hits.set(key, { windowStart: time, count: 1 });
      // Drop stale entries occasionally so the map can't grow without bound.
      if (hits.size > 1000) {
        for (const [ip, value] of hits) {
          if (time - value.windowStart >= windowMs) hits.delete(ip);
        }
      }
      next();
      return;
    }

    entry.count += 1;
    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.windowStart + windowMs - time) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      const body: ApiErrorResponse = {
        error: {
          code: "RATE_LIMITED",
          message: "Too many restaurant searches. Please wait a moment and try again.",
        },
      };
      res.status(429).json(body);
      return;
    }
    next();
  };
}
