import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecommendationResponse } from "../../shared/moods";
import type { Place, PlaceSearchResponse } from "../../shared/places";
import { App } from "../src/App";
import { RestaurantMap } from "../src/components/RestaurantMap";
import type { MapsLibraries } from "../src/maps/googleMaps";

/** Minimal stand-ins for the Maps JavaScript API classes RestaurantMap uses. */
const created = {
  maps: [] as FakeMap[],
  markers: [] as FakeMarker[],
};

class FakeMap {
  fitBounds = vi.fn();
  setCenter = vi.fn();
  setZoom = vi.fn();
  panTo = vi.fn();
  constructor(
    readonly element: HTMLElement,
    readonly options: Record<string, unknown>,
  ) {
    created.maps.push(this);
  }
}

class FakeBounds {
  points: unknown[] = [];
  extend(point: unknown) {
    this.points.push(point);
  }
}

class FakePin {
  background?: string;
  glyphText?: string;
  scale?: number;
  constructor(options: Record<string, unknown>) {
    Object.assign(this, options);
  }
}

class FakeMarker {
  map: unknown;
  position?: { lat: number; lng: number };
  title?: string;
  content?: FakePin;
  zIndex?: number | null;
  listeners: Record<string, () => void> = {};
  constructor(options: Record<string, unknown>) {
    Object.assign(this, options);
    created.markers.push(this);
  }
  addListener(event: string, callback: () => void) {
    this.listeners[event] = callback;
  }
}

const fakeLibraries = {
  Map: FakeMap,
  LatLngBounds: FakeBounds,
  AdvancedMarkerElement: FakeMarker,
  PinElement: FakePin,
} as unknown as MapsLibraries;

let authFailure: (() => void) | undefined;

vi.mock("../src/maps/googleMaps", () => ({
  getMapsConfig: () => ({ apiKey: "browser-key", mapId: "DEMO_MAP_ID" }),
  loadMapsLibraries: vi.fn(async () => fakeLibraries),
  onMapsAuthFailure: (callback: () => void) => {
    authFailure = callback;
    return () => {
      authFailure = undefined;
    };
  },
}));

const PLACES: Place[] = [
  {
    id: "a",
    name: "Alpha Ramen",
    address: "1 A St",
    location: { lat: 41.9, lng: -87.6 },
    googleMapsUri: "https://maps.google.com/?cid=1",
  },
  {
    id: "b",
    name: "Beta Noodles",
    address: "2 B St",
    location: { lat: 41.8, lng: -87.7 },
    googleMapsUri: "https://maps.google.com/?cid=2",
  },
];

beforeEach(() => {
  created.maps = [];
  created.markers = [];
  authFailure = undefined;
});

describe("RestaurantMap", () => {
  it("adds a numbered, labeled marker per result and fits the map to them", async () => {
    render(<RestaurantMap places={PLACES} selectedId={null} onSelect={() => {}} />);

    expect(
      await screen.findByRole("region", { name: "Map of restaurant results" }),
    ).toHaveAttribute("data-status", "ready");
    await vi.waitFor(() => expect(created.markers).toHaveLength(2));
    expect(created.maps[0]!.options).toMatchObject({ mapId: "DEMO_MAP_ID" });
    expect(created.markers.map((m) => m.title)).toEqual(["1. Alpha Ramen", "2. Beta Noodles"]);
    expect(created.markers.map((m) => m.content?.glyphText)).toEqual(["1", "2"]);
    const [bounds] = created.maps[0]!.fitBounds.mock.calls[0]!;
    expect((bounds as FakeBounds).points).toEqual([PLACES[0]!.location, PLACES[1]!.location]);
  });

  it("centers on a single result instead of fitting bounds", async () => {
    render(<RestaurantMap places={[PLACES[0]!]} selectedId={null} onSelect={() => {}} />);
    await screen.findByRole("region", { name: "Map of restaurant results" });
    await vi.waitFor(() =>
      expect(created.maps[0]!.setCenter).toHaveBeenCalledWith(PLACES[0]!.location),
    );
    expect(created.maps[0]!.fitBounds).not.toHaveBeenCalled();
  });

  it("explains when the map fails to load", async () => {
    render(
      <RestaurantMap
        places={PLACES}
        selectedId={null}
        onSelect={() => {}}
        loadLibraries={() => Promise.reject(new Error("network"))}
      />,
    );
    expect(await screen.findByText(/map couldn't load/i)).toBeInTheDocument();
  });

  it("explains when Google rejects the browser key", async () => {
    render(<RestaurantMap places={PLACES} selectedId={null} onSelect={() => {}} />);
    await screen.findByRole("region", { name: "Map of restaurant results" });
    act(() => authFailure?.());
    expect(screen.getByText(/map couldn't load/i)).toBeInTheDocument();
  });

  it("explains when no browser key is configured", () => {
    render(<RestaurantMap places={PLACES} selectedId={null} onSelect={() => {}} apiKey={null} />);
    expect(screen.getByText(/map preview isn't set up/i)).toBeInTheDocument();
    expect(created.maps).toHaveLength(0);
  });
});

describe("map and list selection", () => {
  const CALM: RecommendationResponse = {
    mood: "calm",
    source: "manual",
    recommendations: [
      { id: "calm-ramen", name: "Ramen", explanation: "Warm.", cuisine: "ramen" },
      { id: "calm-mezze", name: "Mezze", explanation: "Plates.", cuisine: "mediterranean" },
      { id: "calm-cafe", name: "Café", explanation: "Lunch.", cuisine: "cafe-soup-sandwich" },
    ],
  };

  async function showGoogleResults() {
    const result: PlaceSearchResponse = {
      provider: "google",
      cuisine: "ramen",
      query: "ramen restaurant in Champaign-Urbana",
      location: { kind: "city", city: "Champaign-Urbana" },
      places: PLACES,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).startsWith("/api/recommendations")
          ? Response.json(CALM)
          : Response.json(result),
      ),
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("radio", { name: "Calm" }));
    await user.click(screen.getByRole("button", { name: "Get recommendations" }));
    await user.click(await screen.findByRole("button", { name: "Find restaurants for Ramen" }));
    await screen.findByText("Alpha Ramen");
    await vi.waitFor(() => expect(created.markers).toHaveLength(2));
    return user;
  }

  it("selecting a card highlights its marker and pans the map to it", async () => {
    const user = await showGoogleResults();
    const button = screen.getByRole("button", { name: "Show Beta Noodles on the map" });

    await user.click(button);

    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button.closest("li")).toHaveAttribute("aria-current", "true");
    const [alpha, beta] = created.markers;
    expect(beta!.content?.background).toBe("#1d4ed8");
    expect(beta!.zIndex).toBe(1000);
    expect(alpha!.content?.background).toBe("#c2410c");
    expect(created.maps[0]!.panTo).toHaveBeenCalledWith(PLACES[1]!.location);
  });

  it("selecting a marker identifies and focuses the matching card", async () => {
    await showGoogleResults();

    act(() => created.markers[0]!.listeners.click!());

    const button = screen.getByRole("button", { name: "Show Alpha Ramen on the map" });
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(within(button.closest("li")!).getByText("Alpha Ramen")).toBeInTheDocument();
    expect(screen.getByText("Selected Alpha Ramen on the map.")).toBeInTheDocument();
  });
});
