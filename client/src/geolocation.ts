export type LocationErrorKind = "unsupported" | "denied" | "unavailable" | "timeout";

export class LocationError extends Error {
  override name = "LocationError";
  constructor(
    readonly kind: LocationErrorKind,
    message: string,
  ) {
    super(message);
  }
}

const MESSAGES: Record<LocationErrorKind, string> = {
  unsupported: "This browser can't share your location. Enter a city instead.",
  denied:
    "Location access was blocked. Enter a city instead, or allow location in your browser settings.",
  unavailable: "Your location isn't available right now. Enter a city instead.",
  timeout: "Finding your location took too long. Try again or enter a city instead.",
};

export const LOCATION_TIMEOUT_MS = 10_000;

/**
 * Asks the browser for the current position. Only call this from an explicit
 * user action ("Use my location"). The position is returned to the caller and
 * never stored by TasteSync.
 */
export function getCurrentLocation(
  geolocation: Geolocation | undefined = typeof navigator !== "undefined"
    ? navigator.geolocation
    : undefined,
): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!geolocation) {
      reject(new LocationError("unsupported", MESSAGES.unsupported));
      return;
    }
    geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      (error) => {
        // GeolocationPositionError codes: 1 = denied, 2 = unavailable, 3 = timeout.
        const kind: LocationErrorKind =
          error.code === 1 ? "denied" : error.code === 3 ? "timeout" : "unavailable";
        reject(new LocationError(kind, MESSAGES[kind]));
      },
      { enableHighAccuracy: false, timeout: LOCATION_TIMEOUT_MS, maximumAge: 5 * 60_000 },
    );
  });
}
