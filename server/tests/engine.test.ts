import { describe, expect, it } from "vitest";
import rawMappings from "../src/data/mood-mappings.json" with { type: "json" };
import { MOODS } from "../../shared/moods.js";
import { RECOMMENDATIONS_PER_MOOD, getRecommendations, parseMappings } from "../src/engine.js";

describe("getRecommendations", () => {
  it.each(MOODS)("returns exactly three distinct, explained recommendations for %s", (mood) => {
    const result = getRecommendations(mood);

    expect(result.mood).toBe(mood);
    expect(result.source).toBe("manual");
    expect(result.recommendations).toHaveLength(RECOMMENDATIONS_PER_MOOD);

    const ids = result.recommendations.map((item) => item.id);
    const names = result.recommendations.map((item) => item.name.toLowerCase());
    expect(new Set(ids).size).toBe(3);
    expect(new Set(names).size).toBe(3);

    for (const item of result.recommendations) {
      expect(item.id).toMatch(/^[a-z0-9-]+$/);
      expect(item.name.trim()).not.toBe("");
      expect(item.explanation.trim().length).toBeGreaterThan(20);
    }
  });

  it("is deterministic", () => {
    for (const mood of MOODS) {
      expect(getRecommendations(mood)).toEqual(getRecommendations(mood));
    }
  });

  it("uses ids that are unique across all moods", () => {
    const ids = MOODS.flatMap((mood) => getRecommendations(mood).recommendations.map((r) => r.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns copies so callers cannot change the stored mappings", () => {
    const first = getRecommendations("calm");
    first.recommendations[0]!.name = "Changed";
    expect(getRecommendations("calm").recommendations[0]!.name).not.toBe("Changed");
  });
});

describe("parseMappings", () => {
  const valid = structuredClone(rawMappings);

  it("accepts the committed mapping file", () => {
    expect(() => parseMappings(valid)).not.toThrow();
  });

  it("rejects a missing mood", () => {
    const { calm: _calm, ...rest } = structuredClone(valid);
    expect(() => parseMappings(rest)).toThrow(/Invalid mood mappings/);
  });

  it("rejects an unknown mood", () => {
    expect(() => parseMappings({ ...structuredClone(valid), sleepy: valid.calm })).toThrow(
      /Invalid mood mappings/,
    );
  });

  it("rejects a mood without exactly three recommendations", () => {
    const data = structuredClone(valid);
    data.upbeat.pop();
    expect(() => parseMappings(data)).toThrow(/exactly 3/);
  });

  it("rejects an empty explanation", () => {
    const data = structuredClone(valid);
    data.stressed[1]!.explanation = "   ";
    expect(() => parseMappings(data)).toThrow(/explanation must not be empty/);
  });

  it("rejects duplicate names within a mood", () => {
    const data = structuredClone(valid);
    data.calm[1]!.name = data.calm[0]!.name;
    expect(() => parseMappings(data)).toThrow(/distinct/);
  });

  it("rejects ids reused across moods", () => {
    const data = structuredClone(valid);
    data.adventurous[0]!.id = data.upbeat[0]!.id;
    expect(() => parseMappings(data)).toThrow(/unique across all moods/);
  });
});
