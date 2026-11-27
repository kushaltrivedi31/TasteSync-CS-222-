import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MOODS } from "../../shared/moods";
import { App } from "../src/App";
import { SELECTED_MOOD_STORAGE_KEY, loadSelectedMood } from "../src/moodStorage";

function checkedRadio() {
  return screen.getAllByRole("radio").find((radio) => (radio as HTMLInputElement).checked);
}

describe("remembering the selected mood", () => {
  it("restores a valid saved mood without fetching recommendations", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.setItem(SELECTED_MOOD_STORAGE_KEY, "stressed");

    render(<App />);

    expect(screen.getByRole("radio", { name: "Stressed" })).toBeChecked();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/choose a mood or finish the quiz above/i)).toBeInTheDocument();
  });

  it("saves the selection whenever it changes", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("radio", { name: "Calm" }));
    expect(window.localStorage.getItem(SELECTED_MOOD_STORAGE_KEY)).toBe("calm");

    await user.click(screen.getByRole("radio", { name: "Low-energy" }));
    expect(window.localStorage.getItem(SELECTED_MOOD_STORAGE_KEY)).toBe("low-energy");
  });

  it.each(["happy", "Calm", "", '"calm"'])("ignores invalid stored value %j", async (value) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.setItem(SELECTED_MOOD_STORAGE_KEY, value);
    const user = userEvent.setup();

    render(<App />);

    expect(loadSelectedMood()).toBeNull();
    expect(checkedRadio()).toBeUndefined();
    expect(screen.getAllByRole("radio")).toHaveLength(MOODS.length);

    // Behaves like a fresh visit: no mood is sent to the API.
    await user.click(screen.getByRole("button", { name: "Get recommendations" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/choose a mood first/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still lets the user pick a mood and get results when storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage disabled", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage disabled", "SecurityError");
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              mood: "adventurous",
              source: "manual",
              recommendations: [1, 2, 3].map((n) => ({
                id: `adventurous-${n}`,
                name: `Food ${n}`,
                explanation: `Reason ${n}.`,
                cuisine: "ethiopian",
              })),
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    const user = userEvent.setup();

    render(<App />);
    expect(checkedRadio()).toBeUndefined();

    await user.click(screen.getByRole("radio", { name: "Adventurous" }));
    expect(screen.getByRole("radio", { name: "Adventurous" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Get recommendations" }));
    expect(
      await screen.findByRole("heading", { name: /feeling adventurous/i }),
    ).toBeInTheDocument();
  });
});
