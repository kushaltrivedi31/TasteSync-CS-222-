import { describe, expect, it } from "vitest";
import rawData from "../src/data/champaign-urbana-restaurants.json" with { type: "json" };
import { MOODS } from "../../shared/moods.js";
import { CUISINE_TAGS } from "../../shared/restaurants.js";
import { getRecommendations } from "../src/engine.js";
import {
  findRestaurants,
  isDemoAreaCity,
  normalizeCity,
  parseRestaurantData,
} from "../src/restaurants.js";

describe("isDemoAreaCity", () => {
  it.each([
    "Champaign",
    "Urbana",
    "Champaign-Urbana",
    "champaign urbana",
    "Urbana-Champaign",
    "  CHAMPAIGN  ",
    "Champaign, IL",
    "Urbana, Illinois",
    "Champaign, IL 61820",
    "C-U",
    "CU",
    "Chambana",
  ])("accepts %j", (city) => {
    expect(isDemoAreaCity(city)).toBe(true);
  });

  it.each(["Chicago", "Springfield", "Savoy", "Champaign County", "Champ", "New York"])(
    "rejects %j",
    (city) => {
      expect(isDemoAreaCity(city)).toBe(false);
    },
  );

  it("normalizes punctuation and state names", () => {
    expect(normalizeCity("Urbana–Champaign, IL.")).toBe("urbana champaign");
    expect(normalizeCity("Champaign-Urbana, Illinois")).toBe("champaign urbana");
  });
});

describe("findRestaurants", () => {
  it("returns only restaurants tagged with the exact cuisine, sorted by name", () => {
    const result = findRestaurants("ramen", "Champaign");

    expect(result.area.id).toBe("champaign-urbana");
    expect(result.cuisine).toBe("ramen");
    expect(result.cityQuery).toBe("Champaign");
    expect(result.dataset.kind).toBe("demo");
    expect(result.restaurants.map((r) => r.name)).toEqual(["Oozu Ramen Bar", "Susuru Ramen Bar"]);
    for (const restaurant of result.restaurants) {
      expect(restaurant.cuisines).toContain("ramen");
    }
  });

  it("does not loosely match related cuisines", () => {
    // Pho and ramen are both noodle soups but must not cross-match.
    const pho = findRestaurants("pho", "Urbana").restaurants.map((r) => r.id);
    expect(pho).not.toContain("oozu-ramen-bar");
    expect(pho).not.toContain("susuru-ramen-bar");
  });

  it("returns an empty list when the demo data has no match", () => {
    expect(findRestaurants("mac-and-cheese", "Champaign").restaurants).toEqual([]);
  });

  it("returns complete restaurant details with https sources", () => {
    for (const cuisine of CUISINE_TAGS) {
      for (const restaurant of findRestaurants(cuisine, "Champaign").restaurants) {
        expect(restaurant.name.trim()).not.toBe("");
        expect(restaurant.address).toMatch(/(Champaign|Urbana), IL/);
        expect(restaurant.address).toContain(restaurant.city);
        expect(restaurant.sources.length).toBeGreaterThan(0);
        for (const source of restaurant.sources) {
          expect(source.url).toMatch(/^https:\/\//);
        }
      }
    }
  });

  it("returns copies so callers cannot change the stored data", () => {
    findRestaurants("poke", "Champaign").restaurants[0]!.name = "Changed";
    expect(findRestaurants("poke", "Champaign").restaurants[0]!.name).toBe("Pokelab");
  });
});

describe("cuisine tags", () => {
  it("every recommendation uses a known cuisine tag, and each tag is used once", () => {
    const tags = MOODS.flatMap((mood) =>
      getRecommendations(mood).recommendations.map((r) => r.cuisine),
    );
    expect([...tags].sort()).toEqual([...CUISINE_TAGS].sort());
  });
});

describe("parseRestaurantData", () => {
  const valid = structuredClone(rawData);

  it("accepts the committed dataset", () => {
    expect(() => parseRestaurantData(valid)).not.toThrow();
  });

  it("rejects an unknown cuisine tag", () => {
    const data = structuredClone(valid);
    data.restaurants[0]!.cuisines = ["tacos"];
    expect(() => parseRestaurantData(data)).toThrow(/Invalid restaurant data/);
  });

  it("rejects a restaurant without sources", () => {
    const data = structuredClone(valid);
    data.restaurants[0]!.sources = [];
    expect(() => parseRestaurantData(data)).toThrow(/at least one source/);
  });

  it("rejects non-https source links", () => {
    const data = structuredClone(valid);
    data.restaurants[0]!.sources[0]!.url = "http://example.com";
    expect(() => parseRestaurantData(data)).toThrow(/https URL/);
  });

  it("rejects duplicate ids", () => {
    const data = structuredClone(valid);
    data.restaurants[1]!.id = data.restaurants[0]!.id;
    expect(() => parseRestaurantData(data)).toThrow(/unique/);
  });

  it("rejects a city outside the demo area", () => {
    const data = structuredClone(valid);
    data.restaurants[0]!.city = "Chicago";
    expect(() => parseRestaurantData(data)).toThrow(/Invalid restaurant data/);
  });
});
