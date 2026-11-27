import { useRef, useState, type Ref } from "react";
import type { PlaceSearchResponse } from "../../../shared/places";
import { DEMO_AREA, type RestaurantSearchResponse } from "../../../shared/restaurants";
import {
  sameWhere,
  type RestaurantSearchState,
  type RestaurantWhere,
} from "../useRestaurantSearch";
import { RestaurantMap } from "./RestaurantMap";

interface RestaurantPanelProps {
  id: string;
  state: Exclude<RestaurantSearchState, { status: "idle" }>;
  /** Where the user would search if they asked again right now. */
  currentWhere: RestaurantWhere;
  onRetry: () => void;
  /** Re-run the search in the demo list for Champaign-Urbana. */
  onUseDemoArea: () => void;
  ref?: Ref<HTMLElement>;
}

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function areaLabel(where: RestaurantWhere): string {
  if (where.source === "demo") return `“${where.city}”`;
  return where.area.kind === "city" ? `“${where.area.city}”` : "your current location";
}

function changeNote(target: RestaurantWhere, current: RestaurantWhere): string | null {
  if (sameWhere(target, current)) return null;
  if (target.source !== current.source) {
    return current.source === "demo"
      ? `You switched to the ${DEMO_AREA.name} demo list.`
      : "You switched to Google Maps search.";
  }
  const targetCity =
    target.source === "demo" ? target.city : target.area.kind === "city" ? target.area.city : null;
  const currentCity =
    current.source === "demo"
      ? current.city
      : current.area.kind === "city"
        ? current.area.city
        : null;
  if (targetCity !== null && currentCity !== null) {
    return `You changed the city to “${currentCity || "(empty)"}”.`;
  }
  return currentCity === null
    ? "You chose to search near your current location."
    : `You changed the city to “${currentCity || "(empty)"}”.`;
}

/** The "Google Maps" attribution text required when showing Places results. */
function GoogleMapsAttribution() {
  return (
    <p className="google-attribution">
      <span className="visually-hidden">Results from </span>
      <span className="google-attribution-mark" translate="no" aria-label="Google Maps">
        Google Maps
      </span>
    </p>
  );
}

function DemoResults({ data }: { data: RestaurantSearchResponse }) {
  if (data.restaurants.length === 0) return null;
  return (
    <>
      <ul className="restaurant-list">
        {data.restaurants.map((restaurant) => (
          <li key={restaurant.id} className="restaurant-item">
            <p className="restaurant-name">{restaurant.name}</p>
            <p className="restaurant-address">{restaurant.address}</p>
            <p className="restaurant-sources">
              <span className="visually-hidden">Sources for {restaurant.name}: </span>
              {restaurant.sources.map((source, index) => (
                <span key={source.url}>
                  {index > 0 && " · "}
                  <a href={source.url} target="_blank" rel="noopener noreferrer">
                    {source.label}
                    <span className="visually-hidden"> (opens in a new tab)</span>
                  </a>
                </span>
              ))}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

function GoogleResults({ data, foodName }: { data: PlaceSearchResponse; foodName: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const selected = data.places.find((place) => place.id === selectedId);

  function selectFromMap(placeId: string) {
    setSelectedId(placeId);
    const button = buttonRefs.current.get(placeId);
    button?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    button?.focus({ preventScroll: true });
  }

  if (data.places.length === 0) return null;

  return (
    <>
      <RestaurantMap places={data.places} selectedId={selectedId} onSelect={selectFromMap} />
      <p className="visually-hidden" aria-live="polite">
        {selected ? `Selected ${selected.name} on the map.` : ""}
      </p>
      <ol className="restaurant-list place-list">
        {data.places.map((place, index) => {
          const isSelected = place.id === selectedId;
          return (
            <li
              key={place.id}
              className="restaurant-item place-item"
              data-selected={isSelected ? "true" : undefined}
              aria-current={isSelected ? "true" : undefined}
            >
              <span className="place-number" aria-hidden="true">
                {index + 1}
              </span>
              <p className="restaurant-name">{place.name}</p>
              <p className="restaurant-address">{place.address}</p>
              <div className="place-actions">
                <a
                  className="place-link"
                  href={place.googleMapsUri}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open in Google Maps
                  <span className="visually-hidden"> (opens in a new tab)</span>
                </a>
                <button
                  type="button"
                  className="button button-secondary button-small"
                  aria-pressed={isSelected}
                  aria-label={`Show ${place.name} on the map`}
                  ref={(element) => {
                    if (element) buttonRefs.current.set(place.id, element);
                    else buttonRefs.current.delete(place.id);
                  }}
                  onClick={() => setSelectedId(place.id)}
                >
                  Show on map
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="restaurant-footnote">
        These places matched a Google Maps search for “{data.query}”. A match doesn&apos;t guarantee
        they serve {foodName.toLowerCase()}, so check the menu before you go.
      </p>
      <GoogleMapsAttribution />
    </>
  );
}

/** Shows restaurant lookup results for one recommendation. */
export function RestaurantPanel({
  id,
  state,
  currentWhere,
  onRetry,
  onUseDemoArea,
  ref,
}: RestaurantPanelProps) {
  const { recommendation, where } = state.target;
  const food = recommendation.name.toLowerCase();
  const titleId = `${id}-title`;
  const note = state.status === "loading" ? null : changeNote(where, currentWhere);
  const result = state.status === "success" ? state.result : null;
  const count = result
    ? result.source === "demo"
      ? result.data.restaurants.length
      : result.data.places.length
    : 0;

  return (
    <section
      id={id}
      ref={ref}
      className="restaurant-panel"
      aria-labelledby={titleId}
      aria-busy={state.status === "loading"}
    >
      <div className="restaurant-header">
        <h3 id={titleId} className="restaurant-title">
          Places for {food}
        </h3>
        {where.source === "demo" ? (
          <span className="demo-tag">Demo data · {DEMO_AREA.name} only</span>
        ) : (
          <span className="demo-tag live-tag">Google Maps search</span>
        )}
      </div>

      <div role="status" className="status-region">
        {state.status === "loading" && (
          <p className="loading">
            <span className="spinner" aria-hidden="true" />
            Looking up {food} near {areaLabel(where)}…
          </p>
        )}
        {result && count > 0 && (
          <p className="restaurant-summary">
            {count === 1 ? "1 place" : `${count} places`}{" "}
            {result.source === "demo"
              ? `in our ${DEMO_AREA.name} demo list for ${areaLabel(where)}.`
              : `from Google Maps near ${areaLabel(where)}.`}
          </p>
        )}
        {result?.source === "demo" && count === 0 && (
          <p className="restaurant-empty">
            No {food} spots are in our {DEMO_AREA.name} demo list yet. Try another recommendation.
          </p>
        )}
        {result?.source === "google" && count === 0 && (
          <p className="restaurant-empty">
            Google Maps didn&apos;t find any matches for “{result.data.query}”. Try a nearby city or
            another recommendation.
          </p>
        )}
      </div>

      {result?.source === "demo" && <DemoResults data={result.data} />}
      {result?.source === "google" && (
        <GoogleResults
          key={`${result.data.query}|${result.data.cuisine}`}
          data={result.data}
          foodName={recommendation.name}
        />
      )}

      {state.status === "unsupported-city" && (
        <div className="notice-box" role="alert">
          <p className="notice-title">{areaLabel(where)} isn&apos;t covered yet.</p>
          <p>
            {state.message} This demo doesn&apos;t search live listings, so it can&apos;t suggest
            places in other cities. Switch to Google Maps search for other areas.
          </p>
          <button type="button" className="button button-secondary" onClick={onUseDemoArea}>
            Search {DEMO_AREA.name} instead
          </button>
        </div>
      )}

      {state.status === "not-configured" && (
        <div className="notice-box" role="alert">
          <p className="notice-title">Google restaurant search isn&apos;t available.</p>
          <p>
            {state.message} You can still browse the {DEMO_AREA.name} demo list, which is
            hand-checked and clearly labeled, but only covers Champaign and Urbana.
          </p>
          <button type="button" className="button button-secondary" onClick={onUseDemoArea}>
            Use the {DEMO_AREA.name} demo list
          </button>
        </div>
      )}

      {state.status === "invalid-city" && (
        <p className="field-error" role="alert">
          {state.message}
        </p>
      )}

      {(state.status === "error" || state.status === "quota") && (
        <div className="error-box" role="alert">
          <p className="error-title">Couldn&apos;t look up places for {food}.</p>
          <p>{state.message} Your food recommendations above are still available.</p>
          <div className="actions">
            <button type="button" className="button button-secondary" onClick={onRetry}>
              Try again
            </button>
            {where.source === "google" && (
              <button type="button" className="button button-secondary" onClick={onUseDemoArea}>
                Use the {DEMO_AREA.name} demo list
              </button>
            )}
          </div>
        </div>
      )}

      {note && <p className="selection-note">{note} Select “Find restaurants” again to update.</p>}

      {result?.source === "demo" && (
        <p className="restaurant-footnote">
          Curated from public listings, last checked {formatDate(result.data.dataset.lastVerified)}.
          This is not a live search; details may have changed, so confirm hours before you go.
        </p>
      )}
    </section>
  );
}
