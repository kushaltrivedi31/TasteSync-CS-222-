import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MOODS, type Mood, type RecommendationResponse } from "../../shared/moods";
import { App } from "../src/App";

const FAKE_CUISINES = ["ramen", "pho", "sichuan"] as const;

// Frontend tests mock HTTP. The real engine is covered by the server tests.
function fakeResult(mood: Mood): RecommendationResponse {
  return {
    mood,
    source: "manual",
    recommendations: [1, 2, 3].map((n) => ({
      id: `${mood}-food-${n}`,
      name: `${mood} food ${n}`,
      explanation: `Reason ${n} this fits a ${mood} mood.`,
      cuisine: FAKE_CUISINES[n - 1]!,
    })),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requestedMood(init: RequestInit | undefined): Mood {
  return (JSON.parse(String(init?.body)) as { mood: Mood }).mood;
}

/** A fetch mock that answers every request with the fake result for its mood. */
function mockSuccessfulFetch() {
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
    jsonResponse(fakeResult(requestedMood(init))),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Lets a test decide exactly when each pending request resolves. */
function mockDeferredFetch() {
  const pending: { mood: Mood; resolve: (response: Response) => void }[] = [];
  const fetchMock = vi.fn(
    (_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
        pending.push({ mood: requestedMood(init), resolve });
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, pending };
}

function getButton() {
  return screen.getByRole("button", { name: /get recommendations|finding food/i });
}

function resultCards() {
  return within(screen.getByRole("list")).getAllByRole("listitem");
}

describe("App", () => {
  it("shows branding, all five moods, and an initial prompt", () => {
    render(<App />);

    expect(screen.getByRole("banner")).toHaveTextContent("TasteSync");
    expect(screen.getByRole("group", { name: /how are you feeling/i })).toBeInTheDocument();
    for (const label of ["Upbeat", "Calm", "Stressed", "Low-energy", "Adventurous"]) {
      expect(screen.getByRole("radio", { name: label })).not.toBeChecked();
    }
    expect(screen.getAllByRole("radio")).toHaveLength(MOODS.length);
    expect(screen.getByText(/choose a mood or finish the quiz above/i)).toBeInTheDocument();
  });

  it("asks for a mood instead of calling the API when none is selected", async () => {
    const fetchMock = mockSuccessfulFetch();
    const user = userEvent.setup();
    render(<App />);

    await user.click(getButton());

    expect(screen.getByRole("alert")).toHaveTextContent(/choose a mood first/i);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: "Upbeat" })).toHaveFocus();

    await user.click(screen.getByRole("radio", { name: "Calm" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("calls the backend and shows three recommendations for the selected mood", async () => {
    const fetchMock = mockSuccessfulFetch();
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("radio", { name: "Stressed" }));
    await user.click(getButton());

    expect(await screen.findByRole("heading", { name: /feeling stressed/i })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/recommendations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ mood: "stressed", source: "manual" }),
      }),
    );

    const cards = resultCards();
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveTextContent("stressed food 1");
    expect(cards[0]).toHaveTextContent("Reason 1 this fits a stressed mood.");
    expect(screen.getByText("Mood chosen manually")).toBeInTheDocument();
  });

  it("supports choosing a mood with the keyboard", async () => {
    mockSuccessfulFetch();
    const user = userEvent.setup();
    render(<App />);

    // Tab past the two "How do you want to start?" choices into the mood group.
    await user.tab();
    expect(screen.getByRole("button", { name: /pick your mood/i })).toHaveFocus();
    await user.tab();
    await user.tab();
    expect(screen.getByRole("radio", { name: "Upbeat" })).toHaveFocus();
    await user.keyboard("[Space]");
    await user.keyboard("[ArrowDown]");
    expect(screen.getByRole("radio", { name: "Calm" })).toBeChecked();
    await user.tab();
    expect(getButton()).toHaveFocus();
    await user.keyboard("[Enter]");

    expect(await screen.findByRole("heading", { name: /feeling calm/i })).toBeInTheDocument();
  });

  it("updates results after changing the mood", async () => {
    mockSuccessfulFetch();
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("radio", { name: "Upbeat" }));
    await user.click(getButton());
    await screen.findByRole("heading", { name: /feeling upbeat/i });

    await user.click(screen.getByRole("button", { name: /choose a different mood/i }));
    expect(screen.getByRole("radio", { name: "Upbeat" })).toHaveFocus();

    await user.click(screen.getByRole("radio", { name: "Adventurous" }));
    // Old results stay labeled with their own mood until the user asks again.
    expect(screen.getByRole("heading", { name: /feeling upbeat/i })).toBeInTheDocument();
    expect(screen.getByText(/you've selected/i)).toHaveTextContent("Adventurous");

    await user.click(getButton());
    expect(
      await screen.findByRole("heading", { name: /feeling adventurous/i }),
    ).toBeInTheDocument();
    expect(resultCards()[0]).toHaveTextContent("adventurous food 1");
    expect(screen.queryByText(/you've selected/i)).not.toBeInTheDocument();
  });

  it("shows a loading state while the request is in flight", async () => {
    const { pending } = mockDeferredFetch();
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("radio", { name: "Low-energy" }));
    await user.click(getButton());

    expect(screen.getByText(/finding ideas for when you're feeling low-energy/i)).toBeVisible();
    expect(getButton()).toBeDisabled();
    expect(getButton()).toHaveTextContent(/finding food/i);

    pending[0]!.resolve(jsonResponse(fakeResult("low-energy")));
    expect(await screen.findByRole("heading", { name: /feeling low-energy/i })).toBeInTheDocument();
    expect(getButton()).toBeEnabled();
  });

  it("never labels results with the wrong mood when requests overlap", async () => {
    const { pending } = mockDeferredFetch();
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("radio", { name: "Upbeat" }));
    await user.click(getButton());
    await user.click(screen.getByRole("radio", { name: "Calm" }));
    await user.click(getButton());

    expect(pending.map((p) => p.mood)).toEqual(["upbeat", "calm"]);
    // The older request answers late; it must be ignored.
    pending[1]!.resolve(jsonResponse(fakeResult("calm")));
    pending[0]!.resolve(jsonResponse(fakeResult("upbeat")));

    expect(await screen.findByRole("heading", { name: /feeling calm/i })).toBeInTheDocument();
    await waitFor(() => expect(resultCards()[0]).toHaveTextContent("calm food 1"));
    expect(screen.queryByText(/upbeat food/i)).not.toBeInTheDocument();
  });

  it("shows the in-flight mood, not the newly selected one, while loading", async () => {
    const { pending } = mockDeferredFetch();
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("radio", { name: "Upbeat" }));
    await user.click(getButton());
    await user.click(screen.getByRole("radio", { name: "Stressed" }));

    expect(screen.getByText(/feeling upbeat…/i)).toBeInTheDocument();
    expect(screen.getByText(/you've selected/i)).toHaveTextContent("Stressed");

    pending[0]!.resolve(jsonResponse(fakeResult("upbeat")));
    expect(await screen.findByRole("heading", { name: /feeling upbeat/i })).toBeInTheDocument();
  });

  it("shows a server error and recovers with Try again", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: "INTERNAL_ERROR", message: "Something broke" } }, 500),
      )
      .mockResolvedValueOnce(jsonResponse(fakeResult("calm")));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("radio", { name: "Calm" }));
    await user.click(getButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't load recommendations for “calm”/i);
    expect(alert).toHaveTextContent("Something broke");

    await user.click(within(alert).getByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("heading", { name: /feeling calm/i })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains when the backend cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("radio", { name: "Upbeat" }));
    await user.click(getButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /couldn't reach the tastesync server/i,
    );
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("rejects a response for a different mood than requested", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(fakeResult("calm"))));
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("radio", { name: "Upbeat" }));
    await user.click(getButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(/unexpected response/i);
    expect(screen.queryByRole("heading", { name: /feeling calm/i })).not.toBeInTheDocument();
  });
});
