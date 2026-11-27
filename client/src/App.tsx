import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  MOOD_DETAILS,
  type FoodRecommendation,
  type Mood,
  type MoodSource,
  type RecommendationResponse,
} from "../../shared/moods";
import { DEFAULT_CITY_INPUT, DEMO_AREA } from "../../shared/restaurants";
import { RecommendationError, fetchRecommendations } from "./api";
import { FoodVibeQuiz, type QuizConfirmation } from "./components/FoodVibeQuiz";
import { MoodPicker } from "./components/MoodPicker";
import { RecommendationList } from "./components/RecommendationList";
import { RestaurantPanel } from "./components/RestaurantPanel";
import { SpotifyUnavailableNotice } from "./components/SpotifyUnavailableNotice";
import { LocationError, getCurrentLocation } from "./geolocation";
import { loadSelectedMood, saveSelectedMood } from "./moodStorage";
import { useRestaurantSearch, type RestaurantWhere } from "./useRestaurantSearch";

/** How the mood for a request was chosen. */
interface MoodChoice {
  mood: Mood;
  source: MoodSource;
  /** Set when the choice came from the quiz (confirmed or changed). */
  quizSuggestion?: Mood;
}

/**
 * The state of the most recent request. Each state that shows results or a
 * message carries the choice it belongs to, so results are always labeled with
 * the mood (and source) that produced them.
 */
type RequestState =
  | { status: "idle" }
  | { status: "loading"; choice: MoodChoice }
  | { status: "success"; choice: MoodChoice; result: RecommendationResponse }
  | { status: "error"; choice: MoodChoice; message: string };

type StartMode = "manual" | "quiz";
type RestaurantSource = "google" | "demo";

const VALIDATION_ERROR_ID = "mood-error";
const RESTAURANT_PANEL_ID = "restaurant-panel";

function moodLabel(mood: Mood): string {
  return MOOD_DETAILS[mood].label;
}

function sourceTag(choice: MoodChoice): string {
  if (choice.source === "quiz") return "Mood from the food vibe quiz";
  if (choice.quizSuggestion) {
    return `Mood chosen manually (quiz suggested ${moodLabel(choice.quizSuggestion)})`;
  }
  return "Mood chosen manually";
}

export function App() {
  const [mode, setMode] = useState<StartMode>("manual");
  // Restore only the last manual selection; recommendations are fetched when the user asks.
  const [selectedMood, setSelectedMood] = useState<Mood | null>(loadSelectedMood);
  const [request, setRequest] = useState<RequestState>({ status: "idle" });
  const [showValidation, setShowValidation] = useState(false);

  const [restaurantSource, setRestaurantSource] = useState<RestaurantSource>("google");
  const [city, setCity] = useState(DEFAULT_CITY_INPUT);
  // The browser position is kept in memory only, and only after "Use my location".
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [searchNearMe, setSearchNearMe] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const restaurants = useRestaurantSearch();

  const controllerRef = useRef<AbortController | null>(null);
  const pickerRef = useRef<HTMLFieldSetElement>(null);
  const restaurantPanelRef = useRef<HTMLElement>(null);

  // Cancel any in-flight request if the app unmounts.
  useEffect(() => () => controllerRef.current?.abort(), []);

  async function loadRecommendations(choice: MoodChoice) {
    // Only the latest request may update the screen; cancel older ones.
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    // Restaurant results belong to the old recommendations.
    restaurants.reset();

    setRequest({ status: "loading", choice });
    try {
      const result = await fetchRecommendations(choice.mood, controller.signal, choice.source);
      if (controllerRef.current !== controller) return;
      setRequest({ status: "success", choice, result });
    } catch (error) {
      if (controllerRef.current !== controller) return;
      const message =
        error instanceof RecommendationError
          ? error.message
          : "Something went wrong while loading recommendations. Please try again.";
      setRequest({ status: "error", choice, message });
    }
  }

  function focusPicker() {
    const fieldset = pickerRef.current;
    const radio =
      fieldset?.querySelector<HTMLInputElement>("input[type=radio]:checked") ??
      fieldset?.querySelector<HTMLInputElement>("input[type=radio]");
    radio?.focus();
    fieldset?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMood) {
      setShowValidation(true);
      focusPicker();
      return;
    }
    void loadRecommendations({ mood: selectedMood, source: "manual" });
  }

  function handleMoodChange(mood: Mood) {
    setSelectedMood(mood);
    saveSelectedMood(mood);
    setShowValidation(false);
  }

  function handleQuizConfirm({ mood, source, suggestedMood }: QuizConfirmation) {
    // Quiz choices are never saved as the remembered manual mood.
    void loadRecommendations({ mood, source, quizSuggestion: suggestedMood });
  }

  function chooseDifferentMood() {
    if (mode === "manual") {
      focusPicker();
      return;
    }
    // Wait for the manual panel to be shown before focusing it.
    setMode("manual");
    requestAnimationFrame(focusPicker);
  }

  function currentWhere(
    overrides: Partial<{ source: RestaurantSource; city: string }> = {},
  ): RestaurantWhere {
    const source = overrides.source ?? restaurantSource;
    const cityText = overrides.city ?? city;
    if (source === "demo") return { source: "demo", city: cityText };
    if (searchNearMe && position && overrides.city === undefined) {
      return { source: "google", area: { kind: "coordinates", ...position } };
    }
    return { source: "google", area: { kind: "city", city: cityText } };
  }

  function findRestaurants(recommendation: FoodRecommendation, where = currentWhere()) {
    void restaurants.search(recommendation, where);
    // Bring the results into view (they appear below the cards on small screens).
    requestAnimationFrame(() =>
      restaurantPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    );
  }

  function handleCitySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const restaurantState = restaurants.state;
    if (restaurantState.status !== "idle") {
      findRestaurants(restaurantState.target.recommendation);
    }
  }

  async function handleUseMyLocation() {
    setLocating(true);
    setLocationError(null);
    try {
      const coords = await getCurrentLocation();
      setPosition(coords);
      setSearchNearMe(true);
      const restaurantState = restaurants.state;
      if (restaurantState.status !== "idle") {
        findRestaurants(restaurantState.target.recommendation, {
          source: "google",
          area: { kind: "coordinates", ...coords },
        });
      }
    } catch (error) {
      setSearchNearMe(false);
      setLocationError(
        error instanceof LocationError
          ? error.message
          : "Your location isn't available right now. Enter a city instead.",
      );
    } finally {
      setLocating(false);
    }
  }

  function switchToDemoArea(recommendation: FoodRecommendation) {
    setRestaurantSource("demo");
    setCity(DEFAULT_CITY_INPUT);
    setSearchNearMe(false);
    findRestaurants(recommendation, { source: "demo", city: DEFAULT_CITY_INPUT });
  }

  const restaurantState = restaurants.state;
  const activeChoice = request.status === "idle" ? null : request.choice;
  const selectionDiffers =
    mode === "manual" &&
    activeChoice !== null &&
    selectedMood !== null &&
    selectedMood !== activeChoice.mood;
  const isLoading = request.status === "loading";
  const isLoadingSelected =
    isLoading && request.choice.source === "manual" && request.choice.mood === selectedMood;
  const nearMeActive = restaurantSource === "google" && searchNearMe && position !== null;

  return (
    <div className="page">
      <header className="site-header">
        <p className="brand">
          Taste<span className="brand-accent">Sync</span>
        </p>
        <h1 className="headline">Not sure what to eat? Start with how you feel.</h1>
        <p className="intro">
          Pick your mood, or take a quick music quiz to find your food vibe. TasteSync suggests
          three kinds of food that fit, with a quick reason for each. They&apos;re curated ideas to
          help you decide faster, not nutrition advice.
        </p>
      </header>

      <main className="content">
        <section className="panel" aria-labelledby="start-title">
          <h2 id="start-title" className="section-title">
            How do you want to start?
          </h2>
          <div className="start-choices" role="group" aria-labelledby="start-title">
            <button
              type="button"
              className="start-choice"
              aria-pressed={mode === "manual"}
              onClick={() => setMode("manual")}
            >
              <span className="start-choice-title">Pick your mood</span>
              <span className="start-choice-text">Choose one of five moods yourself.</span>
            </button>
            <button
              type="button"
              className="start-choice"
              aria-pressed={mode === "quiz"}
              onClick={() => setMode("quiz")}
            >
              <span className="start-choice-title">Find your food vibe</span>
              <span className="start-choice-text">
                Answer five quick music questions and we&apos;ll suggest one.
              </span>
            </button>
          </div>

          <div className="start-panel" hidden={mode !== "manual"}>
            <form onSubmit={handleSubmit} noValidate>
              <MoodPicker
                ref={pickerRef}
                selectedMood={selectedMood}
                onChange={handleMoodChange}
                errorId={showValidation ? VALIDATION_ERROR_ID : undefined}
              />
              {showValidation && (
                <p id={VALIDATION_ERROR_ID} className="field-error" role="alert">
                  Choose a mood first, then ask for recommendations.
                </p>
              )}
              <div className="actions">
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={isLoadingSelected}
                >
                  {isLoadingSelected ? "Finding food…" : "Get recommendations"}
                </button>
              </div>
            </form>
            <SpotifyUnavailableNotice />
          </div>

          <div className="start-panel" hidden={mode !== "quiz"}>
            <h3 className="visually-hidden">Food vibe quiz</h3>
            <FoodVibeQuiz
              onConfirm={handleQuizConfirm}
              isLoading={isLoading && request.choice.quizSuggestion !== undefined}
            />
          </div>
        </section>

        <section className="panel results" aria-labelledby="results-title" aria-busy={isLoading}>
          <h2 id="results-title" className="section-title">
            {request.status === "success"
              ? `Ideas for when you're feeling ${moodLabel(request.result.mood).toLowerCase()}`
              : "Your recommendations"}
          </h2>

          <div role="status" className="status-region">
            {request.status === "idle" && (
              <p className="placeholder">
                Choose a mood or finish the quiz above to see three food ideas.
              </p>
            )}

            {request.status === "loading" && (
              <p className="loading">
                <span className="spinner" aria-hidden="true" />
                Finding ideas for when you&apos;re feeling{" "}
                {moodLabel(request.choice.mood).toLowerCase()}…
              </p>
            )}

            {request.status === "success" && (
              <p className="result-meta">
                <span className="mood-tag">{moodLabel(request.result.mood)}</span>
                <span className="source-tag">{sourceTag(request.choice)}</span>
              </p>
            )}
          </div>

          {request.status === "error" && (
            <div className="error-box" role="alert">
              <p className="error-title">
                Couldn&apos;t load recommendations for “{moodLabel(request.choice.mood)}”.
              </p>
              <p>{request.message}</p>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => void loadRecommendations(request.choice)}
              >
                Try again
              </button>
            </div>
          )}

          {request.status === "success" && (
            <>
              <form className="where-form" onSubmit={handleCitySubmit}>
                <fieldset className="source-choice">
                  <legend className="city-label">Restaurant results from</legend>
                  <label className="inline-radio">
                    <input
                      type="radio"
                      name="restaurant-source"
                      checked={restaurantSource === "google"}
                      onChange={() => setRestaurantSource("google")}
                    />
                    Google Maps search
                  </label>
                  <label className="inline-radio">
                    <input
                      type="radio"
                      name="restaurant-source"
                      checked={restaurantSource === "demo"}
                      onChange={() => setRestaurantSource("demo")}
                    />
                    {DEMO_AREA.name} demo list
                  </label>
                </fieldset>

                <div className="city-field">
                  <label htmlFor="restaurant-city" className="city-label">
                    City for restaurant ideas
                  </label>
                  <div className="city-row">
                    <input
                      id="restaurant-city"
                      className="text-input"
                      type="text"
                      value={city}
                      onChange={(event) => {
                        setCity(event.target.value);
                        setSearchNearMe(false);
                      }}
                      autoComplete="address-level2"
                      maxLength={100}
                      aria-describedby="restaurant-city-hint"
                    />
                    {restaurantSource === "google" && (
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => void handleUseMyLocation()}
                        disabled={locating}
                      >
                        {locating ? "Finding you…" : "Use my location"}
                      </button>
                    )}
                  </div>
                  <p id="restaurant-city-hint" className="city-hint">
                    {restaurantSource === "google"
                      ? "Searches Google Maps for the selected food in this city. “Use my location” asks your browser once and isn't saved."
                      : `Uses a small, hand-checked demo list for ${DEMO_AREA.name} (Champaign or Urbana). It isn't a live nearby search.`}
                  </p>
                  {nearMeActive && (
                    <p className="near-me-note">
                      Searching near <strong>your current location</strong>.{" "}
                      <button
                        type="button"
                        className="button-text"
                        onClick={() => setSearchNearMe(false)}
                      >
                        Use the city instead
                      </button>
                    </p>
                  )}
                  {locationError && restaurantSource === "google" && (
                    <p className="field-error" role="alert">
                      {locationError}
                    </p>
                  )}
                </div>
              </form>

              <RecommendationList
                items={request.result.recommendations}
                activeId={
                  restaurantState.status === "idle"
                    ? undefined
                    : restaurantState.target.recommendation.id
                }
                restaurantPanelId={RESTAURANT_PANEL_ID}
                onFindRestaurants={(item) => findRestaurants(item)}
              />

              {restaurantState.status !== "idle" && (
                <RestaurantPanel
                  id={RESTAURANT_PANEL_ID}
                  ref={restaurantPanelRef}
                  state={restaurantState}
                  currentWhere={currentWhere()}
                  onRetry={() =>
                    findRestaurants(
                      restaurantState.target.recommendation,
                      restaurantState.target.where,
                    )
                  }
                  onUseDemoArea={() => switchToDemoArea(restaurantState.target.recommendation)}
                />
              )}
            </>
          )}

          {selectionDiffers && selectedMood && (
            <p className="selection-note">
              You&apos;ve selected <strong>{moodLabel(selectedMood)}</strong>. Select “Get
              recommendations” to update.
            </p>
          )}

          {request.status === "success" && (
            <div className="actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={chooseDifferentMood}
              >
                Choose a different mood
              </button>
            </div>
          )}
        </section>
      </main>

      <footer className="site-footer">
        <p>
          Mood-to-food pairings and the food vibe quiz are curated, playful design choices, not
          scientific findings or medical, nutritional, or psychological advice. Restaurant results
          come from Google Maps when it&apos;s set up, or from a labeled {DEMO_AREA.name} demo list
          that may be out of date.
        </p>
      </footer>
    </div>
  );
}
