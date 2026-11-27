import { describe, expect, it } from "vitest";
import { MOODS } from "../../shared/moods";
import {
  QUIZ_QUESTIONS,
  isQuizComplete,
  joinReasons,
  scoreQuiz,
  type QuizAnswers,
  type QuizQuestion,
} from "../src/quiz/foodVibeQuiz";

function answers(
  music: string,
  energy: string,
  familiarity: string,
  occasion: string,
  experience: string,
): QuizAnswers {
  return { music, energy, familiarity, occasion, experience };
}

describe("quiz content", () => {
  it("has five questions covering the required topics", () => {
    expect(QUIZ_QUESTIONS.map((q) => q.topic)).toEqual([
      "Music preferences",
      "Preferred energy",
      "Familiar favorites vs discovery",
      "Listening occasion",
      "What you want right now",
    ]);
  });

  it("uses unique ids, valid moods, and 0–2 points per answer", () => {
    expect(new Set(QUIZ_QUESTIONS.map((q) => q.id)).size).toBe(5);
    for (const question of QUIZ_QUESTIONS) {
      expect(new Set(question.options.map((o) => o.id)).size).toBe(question.options.length);
      for (const option of question.options) {
        for (const [mood, points] of Object.entries(option.points)) {
          expect(MOODS).toContain(mood);
          expect(points).toBeGreaterThanOrEqual(0);
          expect(points).toBeLessThanOrEqual(2);
        }
        expect(option.reason.trim()).not.toBe("");
      }
    }
  });

  it("makes every mood reachable", () => {
    const reached = new Set<string>();
    const [q1, q2, q3, q4, q5] = QUIZ_QUESTIONS as [
      QuizQuestion,
      QuizQuestion,
      QuizQuestion,
      QuizQuestion,
      QuizQuestion,
    ];
    for (const a of q1.options)
      for (const b of q2.options)
        for (const c of q3.options)
          for (const d of q4.options)
            for (const e of q5.options)
              reached.add(scoreQuiz(answers(a.id, b.id, c.id, d.id, e.id)).mood);
    expect([...reached].sort()).toEqual([...MOODS].sort());
  });
});

describe("scoreQuiz", () => {
  it("adds up points and picks the highest-scoring mood", () => {
    const result = scoreQuiz(answers("new-genre", "high", "new", "exploring", "new-to-me"));
    expect(result.mood).toBe("adventurous");
    expect(result.scores).toEqual({
      upbeat: 2,
      calm: 0,
      stressed: 0,
      "low-energy": 0,
      adventurous: 9,
    });
    expect(result.tieBreak).toBeUndefined();
  });

  it("is deterministic", () => {
    const a = answers("lofi-acoustic", "low", "favorites", "winding-down", "slow-down");
    expect(scoreQuiz(a)).toEqual(scoreQuiz({ ...a }));
  });

  it("explains the result using the answers that pointed to it, strongest first", () => {
    const result = scoreQuiz(answers("focus", "steady", "favorites", "studying", "quick"));
    expect(result.mood).toBe("stressed");
    expect(result.reasons).toEqual([
      "wanted background music to help you focus",
      "are studying or working on a deadline",
      "want food that's fast and easy",
    ]);
  });

  it("breaks a tie using the most recent question first", () => {
    // upbeat: 2 (high) + 2 (going-out) = 4; calm: 2 (lo-fi) + 2 (slow-down) = 4.
    const result = scoreQuiz(
      answers("lofi-acoustic", "high", "favorites", "going-out", "slow-down"),
    );
    expect(result.scores).toEqual({
      upbeat: 4,
      calm: 4,
      stressed: 1,
      "low-energy": 2,
      adventurous: 1,
    });
    // Q5 ("slow-down") gives calm 2 and upbeat 0, so calm wins.
    expect(result.mood).toBe("calm");
    expect(result.tieBreak).toEqual({ tiedMoods: ["upbeat", "calm"], decidedBy: "experience" });
  });

  it("falls back to an earlier question when the last one doesn't separate the tie", () => {
    // upbeat: 2 (going-out) + 2 (share)... use answers where Q5 favors neither tied mood.
    const result = scoreQuiz(answers("quiet", "high", "new", "recharging", "share"));
    // upbeat: 2 (high) + 2 (share) = 4; adventurous: 1 (high) + 2 (new) = 3;
    // low-energy: 2 (quiet) + 2 (recharging) = 4 -> upbeat vs low-energy tie.
    expect(result.scores.upbeat).toBe(4);
    expect(result.scores["low-energy"]).toBe(4);
    // Q5 "share" gives upbeat 2, low-energy 0 -> upbeat.
    expect(result.mood).toBe("upbeat");
    expect(result.tieBreak?.decidedBy).toBe("experience");

    const custom: QuizQuestion[] = [
      {
        id: "a",
        topic: "A",
        prompt: "A",
        options: [{ id: "x", label: "x", points: { calm: 2 }, reason: "r1" }],
      },
      {
        id: "b",
        topic: "B",
        prompt: "B",
        options: [{ id: "y", label: "y", points: { upbeat: 2 }, reason: "r2" }],
      },
      {
        id: "c",
        topic: "C",
        prompt: "C",
        options: [{ id: "z", label: "z", points: {}, reason: "r3" }],
      },
    ];
    const fallback = scoreQuiz({ a: "x", b: "y", c: "z" }, custom);
    // Tied 2–2; question c gives neither points; question b favors upbeat.
    expect(fallback.mood).toBe("upbeat");
    expect(fallback.tieBreak).toEqual({ tiedMoods: ["upbeat", "calm"], decidedBy: "b" });
  });

  it("uses the fixed mood order when no question separates the tie", () => {
    const custom: QuizQuestion[] = [
      {
        id: "only",
        topic: "Only",
        prompt: "Only",
        options: [{ id: "both", label: "both", points: { adventurous: 1, calm: 1 }, reason: "r" }],
      },
    ];
    const result = scoreQuiz({ only: "both" }, custom);
    expect(result.mood).toBe("calm");
    expect(result.tieBreak).toEqual({ tiedMoods: ["calm", "adventurous"], decidedBy: "order" });
  });

  it("refuses to score an incomplete quiz", () => {
    const partial = { music: "pop-dance", energy: "high" };
    expect(isQuizComplete(partial)).toBe(false);
    expect(() => scoreQuiz(partial)).toThrow(/has not been answered/);
    expect(() =>
      scoreQuiz({ ...answers("pop-dance", "high", "mix", "going-out", "share"), music: "bogus" }),
    ).toThrow();
  });
});

describe("joinReasons", () => {
  it("joins reasons as readable English", () => {
    expect(joinReasons([])).toBe("");
    expect(joinReasons(["a"])).toBe("a");
    expect(joinReasons(["a", "b"])).toBe("a and b");
    expect(joinReasons(["a", "b", "c"])).toBe("a, b, and c");
  });
});
