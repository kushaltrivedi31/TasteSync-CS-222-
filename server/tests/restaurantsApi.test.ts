import request from "supertest";
import { describe, expect, it } from "vitest";
import type { ApiErrorResponse } from "../../shared/moods.js";
import type { RestaurantSearchResponse } from "../../shared/restaurants.js";
import { createApp } from "../src/app.js";

const app = createApp();

function errorOf(body: unknown): ApiErrorResponse["error"] {
  return (body as ApiErrorResponse).error;
}

describe("GET /api/restaurants", () => {
  it("returns demo restaurants for a cuisine in Champaign-Urbana", async () => {
    const res = await request(app)
      .get("/api/restaurants")
      .query({ cuisine: "sichuan", city: "Champaign-Urbana" });

    expect(res.status).toBe(200);
    const body = res.body as RestaurantSearchResponse;
    expect(body.area).toEqual({ id: "champaign-urbana", name: "Champaign-Urbana, IL" });
    expect(body.cuisine).toBe("sichuan");
    expect(body.cityQuery).toBe("Champaign-Urbana");
    expect(body.dataset).toEqual({ kind: "demo", lastVerified: "2026-11-25" });
    expect(body.restaurants.map((r) => r.name)).toEqual(["Shiquan"]);
    expect(body.restaurants[0]).toMatchObject({
      address: "212 E Green St, Ste 102, Champaign, IL 61820",
      sources: expect.arrayContaining([
        expect.objectContaining({ url: expect.stringMatching(/^https:/) }),
      ]),
    });
  });

  it.each(["Champaign", "urbana", " Urbana, IL ", "C-U"])("accepts city alias %j", async (city) => {
    const res = await request(app).get("/api/restaurants").query({ cuisine: "pho", city });
    expect(res.status).toBe(200);
    expect((res.body as RestaurantSearchResponse).restaurants.length).toBeGreaterThan(0);
    expect((res.body as RestaurantSearchResponse).cityQuery).toBe(city.trim());
  });

  it("returns an empty list (not an error) when nothing matches", async () => {
    const res = await request(app)
      .get("/api/restaurants")
      .query({ cuisine: "chicken-and-rice", city: "Champaign" });
    expect(res.status).toBe(200);
    expect((res.body as RestaurantSearchResponse).restaurants).toEqual([]);
  });

  it("explains that other cities are not covered", async () => {
    const res = await request(app)
      .get("/api/restaurants")
      .query({ cuisine: "ramen", city: "Chicago" });
    expect(res.status).toBe(422);
    const error = errorOf(res.body);
    expect(error.code).toBe("UNSUPPORTED_CITY");
    expect(error.message).toContain("only cover Champaign-Urbana");
    expect(res.body).not.toHaveProperty("restaurants");
  });

  it("rejects a missing cuisine", async () => {
    const res = await request(app).get("/api/restaurants").query({ city: "Champaign" });
    expect(res.status).toBe(400);
    expect(errorOf(res.body)).toMatchObject({
      code: "INVALID_CUISINE",
      message: "cuisine is required",
    });
  });

  it.each(["tacos", "Ramen", "ramen noodles", ""])(
    "rejects unknown cuisine %j",
    async (cuisine) => {
      const res = await request(app).get("/api/restaurants").query({ cuisine, city: "Champaign" });
      expect(res.status).toBe(400);
      expect(errorOf(res.body).code).toBe("INVALID_CUISINE");
    },
  );

  it.each([
    [{ cuisine: "ramen" }, "city is required"],
    [{ cuisine: "ramen", city: "   " }, "city is required"],
    [{ cuisine: "ramen", city: "x".repeat(101) }, "city must be 100 characters or fewer"],
  ])("rejects bad city input %#", async (query, message) => {
    const res = await request(app).get("/api/restaurants").query(query);
    expect(res.status).toBe(400);
    expect(errorOf(res.body)).toMatchObject({ code: "INVALID_CITY", message });
  });

  it("rejects repeated query parameters", async () => {
    const res = await request(app).get("/api/restaurants?cuisine=ramen&city=Champaign&city=Urbana");
    expect(res.status).toBe(400);
    expect(errorOf(res.body).code).toBe("INVALID_CITY");
  });
});
