import request from "supertest";
import { describe, expect, it } from "vitest";
import { MOODS, type ApiErrorResponse, type RecommendationResponse } from "../../shared/moods.js";
import { createApp } from "../src/app.js";

const app = createApp();

function expectErrorShape(body: unknown, code: string): ApiErrorResponse {
  const error = body as ApiErrorResponse;
  expect(error.error.code).toBe(code);
  expect(typeof error.error.message).toBe("string");
  expect(error.error.message.length).toBeGreaterThan(0);
  return error;
}

describe("GET /api/health", () => {
  it("reports ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("POST /api/recommendations", () => {
  it.each(MOODS)("returns three manual recommendations for %s", async (mood) => {
    const res = await request(app).post("/api/recommendations").send({ mood });

    expect(res.status).toBe(200);
    expect(res.type).toBe("application/json");
    const body = res.body as RecommendationResponse;
    expect(body.mood).toBe(mood);
    expect(body.source).toBe("manual");
    expect(body.recommendations).toHaveLength(3);
    expect(new Set(body.recommendations.map((r) => r.id)).size).toBe(3);
    expect(new Set(body.recommendations.map((r) => r.name)).size).toBe(3);
    for (const r of body.recommendations) {
      expect(r.explanation.trim()).not.toBe("");
    }
  });

  it("returns the same results for repeated requests", async () => {
    const first = await request(app).post("/api/recommendations").send({ mood: "calm" });
    const second = await request(app).post("/api/recommendations").send({ mood: "calm" });
    expect(second.body).toEqual(first.body);
  });

  it("ignores extra fields", async () => {
    const res = await request(app)
      .post("/api/recommendations")
      .send({ mood: "stressed", extra: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ mood: "stressed" });
  });

  it("rejects a missing mood", async () => {
    const res = await request(app).post("/api/recommendations").send({});
    expect(res.status).toBe(400);
    const body = expectErrorShape(res.body, "INVALID_MOOD");
    expect(body.error.message).toBe("mood is required");
    expect(body.error.details).toEqual([{ field: "mood", message: "mood is required" }]);
  });

  it.each(["happy", "Upbeat", "low energy", "", 42, null, ["calm"]])(
    "rejects invalid mood %j",
    async (mood) => {
      const res = await request(app).post("/api/recommendations").send({ mood });
      expect(res.status).toBe(400);
      const body = expectErrorShape(res.body, "INVALID_MOOD");
      expect(body.error.message).toContain("upbeat, calm, stressed, low-energy, adventurous");
    },
  );

  it("rejects malformed JSON", async () => {
    const res = await request(app)
      .post("/api/recommendations")
      .set("Content-Type", "application/json")
      .send('{"mood": "calm"');
    expect(res.status).toBe(400);
    expectErrorShape(res.body, "INVALID_JSON");
  });

  it("rejects a request with no body", async () => {
    const res = await request(app).post("/api/recommendations");
    expect(res.status).toBe(400);
    expectErrorShape(res.body, "INVALID_REQUEST");
  });

  it("rejects a JSON body that is not an object", async () => {
    const res = await request(app).post("/api/recommendations").send(["calm"]);
    expect(res.status).toBe(400);
    expectErrorShape(res.body, "INVALID_REQUEST");
  });

  it("rejects a non-JSON body", async () => {
    const res = await request(app)
      .post("/api/recommendations")
      .set("Content-Type", "text/plain")
      .send("mood=calm");
    expect(res.status).toBe(400);
    expectErrorShape(res.body, "INVALID_REQUEST");
  });

  it("rejects oversized bodies", async () => {
    const res = await request(app)
      .post("/api/recommendations")
      .send({ mood: "calm", padding: "x".repeat(20_000) });
    expect(res.status).toBe(413);
    expectErrorShape(res.body, "PAYLOAD_TOO_LARGE");
  });
});

describe("unknown API routes", () => {
  it("returns a JSON 404", async () => {
    const res = await request(app).get("/api/nope");
    expect(res.status).toBe(404);
    expectErrorShape(res.body, "NOT_FOUND");
  });

  it("does not accept GET on the recommendations endpoint", async () => {
    const res = await request(app).get("/api/recommendations");
    expect(res.status).toBe(404);
    expectErrorShape(res.body, "NOT_FOUND");
  });
});
