import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RecommendationResponse } from "../../shared/moods";
import { App } from "../src/App";
import { SELECTED_MOOD_STORAGE_KEY } from "../src/moodStorage";

function note() {
  return screen.getByRole("complementary", { name: "Music-based mood suggestions" });
}

const UPBEAT: RecommendationResponse = {
  mood: "upbeat",
  source: "manual",
  recommendations: [1, 2, 3].map((n) => ({
    id: `upbeat-${n}`,
    name: `Food ${n}`,
    explanation: `Reason ${n}.`,
    cuisine: "poke",
  })),
};

describe("Spotify mood suggestions (unavailable)", () => {
  it("explains honestly that music-based moods are not available", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<App />);

    expect(within(note()).getByText("Not available")).toBeInTheDocument();
    expect(note()).toHaveTextContent(/doesn't guess your mood from spotify/i);
    expect(note()).toHaveTextContent(/developer policy/i);
    const link = within(note()).getByRole("link", { name: /spotify developer policy/i });
    expect(link).toHaveAttribute("href", "https://developer.spotify.com/policy");
  });

  it("offers no connect action and makes no Spotify requests", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    expect(within(note()).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /spotify|connect/i })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps manual selection, the remembered mood, and recommendations working", async () => {
    window.localStorage.setItem(SELECTED_MOOD_STORAGE_KEY, "upbeat");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(UPBEAT)),
    );
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("radio", { name: "Upbeat" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Get recommendations" }));

    expect(await screen.findByRole("heading", { name: /feeling upbeat/i })).toBeInTheDocument();
    expect(screen.getByText("Mood chosen manually")).toBeInTheDocument();
    expect(window.localStorage.getItem(SELECTED_MOOD_STORAGE_KEY)).toBe("upbeat");
  });
});
