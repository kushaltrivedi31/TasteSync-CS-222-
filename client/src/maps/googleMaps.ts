import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

/** The pieces of the Maps JavaScript API that RestaurantMap uses. */
export interface MapsLibraries {
  Map: typeof google.maps.Map;
  LatLngBounds: typeof google.maps.LatLngBounds;
  AdvancedMarkerElement: typeof google.maps.marker.AdvancedMarkerElement;
  PinElement: typeof google.maps.marker.PinElement;
}

export type LoadMapsLibraries = (apiKey: string) => Promise<MapsLibraries>;

/**
 * Browser map settings from Vite env vars. The browser key is public by
 * design: restrict it to the Maps JavaScript API and your site's referrers.
 * The server's Places key is never exposed to the browser.
 */
export function getMapsConfig(): { apiKey?: string; mapId: string } {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() || undefined;
  // DEMO_MAP_ID is Google's documented testing map ID for Advanced Markers.
  const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID?.trim() || "DEMO_MAP_ID";
  return { apiKey, mapId };
}

let configuredKey: string | null = null;

/** Loads the Maps JavaScript API with the documented dynamic library import. */
export const loadMapsLibraries: LoadMapsLibraries = async (apiKey) => {
  if (configuredKey === null) {
    setOptions({ key: apiKey, v: "weekly" });
    configuredKey = apiKey;
  }
  const [maps, core, marker] = await Promise.all([
    importLibrary("maps"),
    importLibrary("core"),
    importLibrary("marker"),
  ]);
  return {
    Map: maps.Map,
    LatLngBounds: core.LatLngBounds,
    AdvancedMarkerElement: marker.AdvancedMarkerElement,
    PinElement: marker.PinElement,
  };
};

declare global {
  interface Window {
    gm_authFailure?: () => void;
  }
}

/**
 * Google calls window.gm_authFailure when the browser key is invalid, not
 * allowed for this site, or billing isn't enabled. Returns an unsubscribe.
 */
export function onMapsAuthFailure(callback: () => void): () => void {
  window.gm_authFailure = callback;
  return () => {
    if (window.gm_authFailure === callback) delete window.gm_authFailure;
  };
}
