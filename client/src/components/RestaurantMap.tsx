import { useEffect, useRef, useState } from "react";
import type { Place } from "../../../shared/places";
import {
  getMapsConfig,
  loadMapsLibraries,
  onMapsAuthFailure,
  type LoadMapsLibraries,
  type MapsLibraries,
} from "../maps/googleMaps";

interface RestaurantMapProps {
  places: Place[];
  selectedId: string | null;
  onSelect: (placeId: string) => void;
  /** Overrides for tests. */
  apiKey?: string | null;
  mapId?: string;
  loadLibraries?: LoadMapsLibraries;
}

type MapStatus = "unconfigured" | "loading" | "ready" | "failed";

const PIN = { background: "#c2410c", borderColor: "#7c2d12", glyphColor: "#ffffff" };
const PIN_SELECTED = { background: "#1d4ed8", borderColor: "#1e3a8a", glyphColor: "#ffffff" };

interface MarkerEntry {
  marker: google.maps.marker.AdvancedMarkerElement;
  pin: google.maps.marker.PinElement;
}

/** Applies the selected or default look to a marker's pin. */
function styleMarker({ marker, pin }: MarkerEntry, selected: boolean) {
  Object.assign(pin, selected ? { ...PIN_SELECTED, scale: 1.25 } : { ...PIN, scale: 1 });
  marker.zIndex = selected ? 1000 : null;
}

/**
 * Shows Google Places results as markers on a Google Map. The list next to it
 * always has the same results, so the page stays usable if the map can't load.
 */
export function RestaurantMap({
  places,
  selectedId,
  onSelect,
  apiKey: apiKeyOverride,
  mapId: mapIdOverride,
  loadLibraries = loadMapsLibraries,
}: RestaurantMapProps) {
  const config = getMapsConfig();
  const apiKey = apiKeyOverride === undefined ? config.apiKey : apiKeyOverride || undefined;
  const mapId = mapIdOverride ?? config.mapId;

  const containerRef = useRef<HTMLDivElement>(null);
  const librariesRef = useRef<MapsLibraries | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef(
    new Map<
      string,
      { marker: google.maps.marker.AdvancedMarkerElement; pin: google.maps.marker.PinElement }
    >(),
  );
  const onSelectRef = useRef(onSelect);
  const [status, setStatus] = useState<MapStatus>(apiKey ? "loading" : "unconfigured");

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Load the Maps JavaScript API once.
  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    const unsubscribe = onMapsAuthFailure(() => setStatus("failed"));
    loadLibraries(apiKey)
      .then((libraries) => {
        if (cancelled || !containerRef.current) return;
        librariesRef.current = libraries;
        mapRef.current = new libraries.Map(containerRef.current, {
          mapId,
          center: { lat: 40.1106, lng: -88.2073 },
          zoom: 13,
          clickableIcons: false,
          streetViewControl: false,
        });
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [apiKey, mapId, loadLibraries]);

  // Replace markers and fit the map whenever the results change.
  useEffect(() => {
    const libraries = librariesRef.current;
    const map = mapRef.current;
    if (status !== "ready" || !libraries || !map) return;

    const markers = markersRef.current;
    for (const { marker } of markers.values()) marker.map = null;
    markers.clear();
    if (places.length === 0) return;

    const bounds = new libraries.LatLngBounds();
    places.forEach((place, index) => {
      const pin = new libraries.PinElement({ ...PIN, glyphText: String(index + 1) });
      const marker = new libraries.AdvancedMarkerElement({
        map,
        position: place.location,
        title: `${index + 1}. ${place.name}`,
        content: pin,
        gmpClickable: true,
      });
      marker.addListener("click", () => onSelectRef.current(place.id));
      markers.set(place.id, { marker, pin });
      bounds.extend(place.location);
    });

    if (places.length === 1) {
      map.setCenter(places[0]!.location);
      map.setZoom(15);
    } else {
      map.fitBounds(bounds, 48);
    }
  }, [places, status]);

  // Highlight the selected marker and bring it into view.
  useEffect(() => {
    if (status !== "ready") return;
    for (const [id, entry] of markersRef.current) {
      const selected = id === selectedId;
      styleMarker(entry, selected);
      if (selected && entry.marker.position) mapRef.current?.panTo(entry.marker.position);
    }
  }, [selectedId, status, places]);

  if (status === "unconfigured") {
    return (
      <p className="map-message">
        The map preview isn&apos;t set up on this site (no browser Maps key). Every result is in the
        list below.
      </p>
    );
  }

  return (
    <div className="map-wrapper">
      <div
        ref={containerRef}
        className="restaurant-map"
        role="region"
        aria-label="Map of restaurant results"
        hidden={status === "failed"}
        data-status={status}
      />
      {status === "loading" && <p className="map-message">Loading map…</p>}
      {status === "failed" && (
        <p className="map-message" role="status">
          The map couldn&apos;t load. Every result is still in the list below.
        </p>
      )}
    </div>
  );
}
