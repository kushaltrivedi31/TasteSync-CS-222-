import { useCallback, useEffect, useRef, useState } from "react";
import type { FoodRecommendation } from "../../shared/moods";
import type { PlaceSearchResponse } from "../../shared/places";
import type { RestaurantSearchResponse } from "../../shared/restaurants";
import {
  PlacesLookupError,
  RestaurantLookupError,
  fetchGooglePlaces,
  fetchRestaurants,
  type GoogleSearchArea,
} from "./api";

/** Where to look, and with which data source. */
export type RestaurantWhere =
  { source: "demo"; city: string } | { source: "google"; area: GoogleSearchArea };

/** What a restaurant search was for. Every non-idle state carries it. */
export interface RestaurantTarget {
  recommendation: FoodRecommendation;
  where: RestaurantWhere;
}

export type RestaurantResult =
  | { source: "demo"; data: RestaurantSearchResponse }
  | { source: "google"; data: PlaceSearchResponse };

export type RestaurantErrorStatus =
  "unsupported-city" | "invalid-city" | "not-configured" | "quota" | "error";

export type RestaurantSearchState =
  | { status: "idle" }
  | { status: "loading"; target: RestaurantTarget }
  | { status: "success"; target: RestaurantTarget; result: RestaurantResult }
  | { status: RestaurantErrorStatus; target: RestaurantTarget; message: string };

/** Trims city text so targets compare equal regardless of stray spaces. */
export function normalizeWhere(where: RestaurantWhere): RestaurantWhere {
  if (where.source === "demo") return { source: "demo", city: where.city.trim() };
  if (where.area.kind === "city") {
    return { source: "google", area: { kind: "city", city: where.area.city.trim() } };
  }
  return where;
}

export function sameWhere(a: RestaurantWhere, b: RestaurantWhere): boolean {
  if (a.source === "demo" || b.source === "demo") {
    return a.source === b.source && (a as { city: string }).city === (b as { city: string }).city;
  }
  if (a.area.kind === "city" || b.area.kind === "city") {
    return (
      a.area.kind === b.area.kind &&
      (a.area as { city: string }).city === (b.area as { city: string }).city
    );
  }
  return a.area.lat === b.area.lat && a.area.lng === b.area.lng;
}

function cityOf(where: RestaurantWhere): string | null {
  if (where.source === "demo") return where.city;
  return where.area.kind === "city" ? where.area.city : null;
}

/**
 * Restaurant lookup state for the recommendation cards. Only the most recent
 * search can update the state, so results are never shown for an earlier
 * food, location, or data source.
 */
export function useRestaurantSearch() {
  const [state, setState] = useState<RestaurantSearchState>({ status: "idle" });
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState({ status: "idle" });
  }, []);

  const search = useCallback(async (recommendation: FoodRecommendation, where: RestaurantWhere) => {
    controllerRef.current?.abort();
    const target: RestaurantTarget = { recommendation, where: normalizeWhere(where) };

    const city = cityOf(target.where);
    if (city !== null && city === "") {
      controllerRef.current = null;
      setState({ status: "invalid-city", target, message: "Enter a city to look up restaurants." });
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: "loading", target });

    try {
      const result: RestaurantResult =
        target.where.source === "demo"
          ? {
              source: "demo",
              data: await fetchRestaurants(
                recommendation.cuisine,
                target.where.city,
                controller.signal,
              ),
            }
          : {
              source: "google",
              data: await fetchGooglePlaces(
                recommendation.cuisine,
                target.where.area,
                controller.signal,
              ),
            };
      if (controllerRef.current !== controller) return;
      setState({ status: "success", target, result });
    } catch (error) {
      if (controllerRef.current !== controller) return;
      if (error instanceof RestaurantLookupError && error.kind !== "failed") {
        setState({ status: error.kind, target, message: error.message });
      } else if (error instanceof PlacesLookupError && error.kind === "not-configured") {
        setState({ status: "not-configured", target, message: error.message });
      } else if (error instanceof PlacesLookupError && error.kind === "quota") {
        setState({ status: "quota", target, message: error.message });
      } else if (error instanceof PlacesLookupError && error.kind === "invalid-location") {
        setState({ status: "invalid-city", target, message: error.message });
      } else {
        const message =
          error instanceof RestaurantLookupError || error instanceof PlacesLookupError
            ? error.message
            : "Something went wrong while looking up restaurants. Please try again.";
        setState({ status: "error", target, message });
      }
    }
  }, []);

  return { state, search, reset };
}
