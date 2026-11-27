import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Mood, MoodSource, RecommendationResponse } from "../../shared/moods";
import { App } from "../src/App";
import { SELECTED_MOOD_STORAGE_KEY } from "../src/moodStorage";

function recommendationsFor(mood: Mood, source: MoodSource): RecommendationResponse {
  return {
    mood,
    source,
    recommendations: [1, 2, 3].map((n) => ({
      id: `${mood}-${n}`,
      name: `${mood} food ${n}`,
      explanation: `Reason ${n}.`,
      cuisine: "ramen",
    })),
  };
}

/** Answers echo the requested mood and source, like the real API. */
function mockRecommendations() {
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { mood: Mood; source: MoodSource };
    return Response.json(recommendationsFor(body.mood, body.source));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sentBodies(fetchMock: ReturnType<typeof mockRecommendations>) {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
}

const CALM_ANSWERS = [
  "Lo-fi, acoustic, or ambient",
  "Low: slow and soft",
  "A mix of both",
  "Winding down at home",
  "Something cozy to slow down with",
];

async function startQuiz() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("button", { name: /find your food vibe/i }));
  return user;
}

async function answerAll(user: ReturnType<typeof userEvent.setup>, labels: string[]) {
  for (const [index, label] of labels.entries()) {
    await user.click(screen.getByRole("radio", { name: label }));
    await user.click(
      screen.getByRole("button", {
        name: index === labels.length - 1 ? "See my food vibe" : "Next",
      }),
    );
  }
}

describe("food vibe quiz", () => {
  it("offers two clear starting choices and keeps manual mode as the default", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const user = userEvent.setup();
    render(<App />);

    const manual = screen.getByRole("button", { name: /pick your mood/i });
    const quiz = screen.getByRole("button", { name: /find your food vibe/i });
    expect(manual).toHaveAttribute("aria-pressed", "true");
    expect(quiz).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("radio", { name: "Upbeat" })).toBeVisible();

    await user.click(quiz);
    expect(quiz).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Question 1 of 5")).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Upbeat" })).not.toBeInTheDocument();
  });

  it("shows progress, requires an answer, and supports going back without losing answers", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const user = await startQuiz();

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose an answer to continue.");
    expect(screen.getByText("Question 1 of 5")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Big pop or dance tracks" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Question 2 of 5")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
    expect(screen.getByText("Preferred energy")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Low: slow and soft" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Question 1 of 5")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Big pop or dance tracks" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("radio", { name: "Low: slow and soft" })).toBeChecked();
  });

  it("can be restarted, clearing every answer", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const user = await startQuiz();

    await user.click(screen.getByRole("radio", { name: "Big pop or dance tracks" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Restart quiz" }));

    expect(screen.getByText("Question 1 of 5")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Big pop or dance tracks" })).not.toBeChecked();
  });

  it("suggests a vibe with an explanation tied to the answers, then confirms it", async () => {
    const fetchMock = mockRecommendations();
    const user = await startQuiz();
    await answerAll(user, CALM_ANSWERS);

    expect(screen.getByRole("heading", { name: "Your food vibe: Calm" })).toHaveFocus();
    expect(screen.getByText(/we matched you to/i)).toHaveTextContent(
      "We matched you to Calm because you went for lo-fi, acoustic, or ambient sounds, are winding down at home, and want something cozy to slow down with.",
    );
    expect(screen.getByText(/playful food match/i)).toBeInTheDocument();
    // Nothing is requested until the user confirms.
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Get Calm food ideas" }));

    expect(await screen.findByRole("heading", { name: /feeling calm/i })).toBeInTheDocument();
    expect(sentBodies(fetchMock)).toEqual([{ mood: "calm", source: "quiz" }]);
    expect(screen.getByText("Mood from the food vibe quiz")).toBeInTheDocument();
    expect(screen.queryByText("Mood chosen manually")).not.toBeInTheDocument();
  });

  it("lets the user change the suggestion before requesting recommendations", async () => {
    const fetchMock = mockRecommendations();
    const user = await startQuiz();
    await answerAll(user, CALM_ANSWERS);

    await user.click(screen.getByRole("button", { name: "Choose a different vibe" }));
    const picker = screen.getByRole("group", { name: "Pick a different vibe" });
    expect(within(picker).getByRole("radio", { name: "Calm" })).toBeChecked();
    await user.click(within(picker).getByRole("radio", { name: "Adventurous" }));

    expect(screen.getByText(/suggested:/i)).toHaveTextContent(
      "Suggested: Calm · You picked: Adventurous",
    );
    await user.click(screen.getByRole("button", { name: "Get Adventurous food ideas" }));

    expect(
      await screen.findByRole("heading", { name: /feeling adventurous/i }),
    ).toBeInTheDocument();
    expect(sentBodies(fetchMock)).toEqual([{ mood: "adventurous", source: "manual" }]);
    expect(screen.getByText("Mood chosen manually (quiz suggested Calm)")).toBeInTheDocument();
  });

  it("explains how a tie was settled", async () => {
    mockRecommendations();
    const user = await startQuiz();
    await answerAll(user, [
      "Lo-fi, acoustic, or ambient",
      "High: loud and fast",
      "My favorites on repeat",
      "Getting ready to go out with friends",
      "Something cozy to slow down with",
    ]);

    expect(screen.getByRole("heading", { name: "Your food vibe: Calm" })).toBeInTheDocument();
    expect(screen.getByText(/scored the same/i)).toHaveTextContent(
      "Upbeat and Calm scored the same. Your answer to “What do you want from your next meal?” settled it.",
    );
  });

  it("goes back from the result to the last question with answers kept", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const user = await startQuiz();
    await answerAll(user, CALM_ANSWERS);

    await user.click(screen.getByRole("button", { name: "Back to my answers" }));
    expect(screen.getByText("Question 5 of 5")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Something cozy to slow down with" })).toBeChecked();
  });

  it("never overwrites the remembered manual mood with a quiz result", async () => {
    window.localStorage.setItem(SELECTED_MOOD_STORAGE_KEY, "stressed");
    mockRecommendations();
    const user = await startQuiz();
    await answerAll(user, CALM_ANSWERS);
    await user.click(screen.getByRole("button", { name: "Get Calm food ideas" }));
    await screen.findByRole("heading", { name: /feeling calm/i });

    expect(window.localStorage.getItem(SELECTED_MOOD_STORAGE_KEY)).toBe("stressed");
    await user.click(screen.getByRole("button", { name: /pick your mood/i }));
    expect(screen.getByRole("radio", { name: "Stressed" })).toBeChecked();
  });

  it("keeps quiz answers when switching to manual mode and back", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const user = await startQuiz();
    await user.click(screen.getByRole("radio", { name: "Big pop or dance tracks" }));
    await user.click(screen.getByRole("button", { name: /pick your mood/i }));
    await user.click(screen.getByRole("button", { name: /find your food vibe/i }));
    expect(screen.getByRole("radio", { name: "Big pop or dance tracks" })).toBeChecked();
  });
});
