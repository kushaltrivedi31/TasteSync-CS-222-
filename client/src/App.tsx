import { useEffect, useRef, useState, type FormEvent } from "react";
import { MOOD_DETAILS, type Mood, type RecommendationResponse } from "../../shared/moods";
import { RecommendationError, fetchRecommendations } from "./api";
import { MoodPicker } from "./components/MoodPicker";
import { RecommendationList } from "./components/RecommendationList";

/**
 * The state of the most recent request. Each state that shows results or a
 * message carries the mood it belongs to, so results are always labeled with
 * the mood that produced them, even if the user has since picked another one.
 */
type RequestState =
  | { status: "idle" }
  | { status: "loading"; mood: Mood }
  | { status: "success"; result: RecommendationResponse }
  | { status: "error"; mood: Mood; message: string };

const VALIDATION_ERROR_ID = "mood-error";

function moodLabel(mood: Mood): string {
  return MOOD_DETAILS[mood].label;
}

export function App() {
  const [selectedMood, setSelectedMood] = useState<Mood | null>(null);
  const [request, setRequest] = useState<RequestState>({ status: "idle" });
  const [showValidation, setShowValidation] = useState(false);

  const controllerRef = useRef<AbortController | null>(null);
  const pickerRef = useRef<HTMLFieldSetElement>(null);

  // Cancel any in-flight request if the app unmounts.
  useEffect(() => () => controllerRef.current?.abort(), []);

  async function loadRecommendations(mood: Mood) {
    // Only the latest request may update the screen; cancel older ones.
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setRequest({ status: "loading", mood });
    try {
      const result = await fetchRecommendations(mood, controller.signal);
      if (controllerRef.current !== controller) return;
      setRequest({ status: "success", result });
    } catch (error) {
      if (controllerRef.current !== controller) return;
      const message =
        error instanceof RecommendationError
          ? error.message
          : "Something went wrong while loading recommendations. Please try again.";
      setRequest({ status: "error", mood, message });
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
    void loadRecommendations(selectedMood);
  }

  function handleMoodChange(mood: Mood) {
    setSelectedMood(mood);
    setShowValidation(false);
  }

  const shownMood: Mood | null =
    request.status === "idle"
      ? null
      : request.status === "success"
        ? request.result.mood
        : request.mood;
  const selectionDiffers =
    shownMood !== null && selectedMood !== null && selectedMood !== shownMood;
  const isLoadingSelected = request.status === "loading" && request.mood === selectedMood;

  return (
    <div className="page">
      <header className="site-header">
        <p className="brand">
          Taste<span className="brand-accent">Sync</span>
        </p>
        <h1 className="headline">Not sure what to eat? Start with how you feel.</h1>
        <p className="intro">
          Pick your mood and TasteSync suggests three kinds of food that tend to fit it, with a
          quick reason for each. They&apos;re curated ideas to help you decide faster, not nutrition
          advice.
        </p>
      </header>

      <main className="content">
        <section className="panel" aria-labelledby="mood-step">
          <h2 id="mood-step" className="visually-hidden">
            Choose your mood
          </h2>
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
              <button type="submit" className="button button-primary" disabled={isLoadingSelected}>
                {isLoadingSelected ? "Finding food…" : "Get recommendations"}
              </button>
            </div>
          </form>
        </section>

        <section
          className="panel results"
          aria-labelledby="results-title"
          aria-busy={request.status === "loading"}
        >
          <h2 id="results-title" className="section-title">
            {request.status === "success"
              ? `Ideas for when you're feeling ${moodLabel(request.result.mood).toLowerCase()}`
              : "Your recommendations"}
          </h2>

          <div role="status" className="status-region">
            {request.status === "idle" && (
              <p className="placeholder">
                Choose a mood above and select “Get recommendations” to see three ideas.
              </p>
            )}

            {request.status === "loading" && (
              <p className="loading">
                <span className="spinner" aria-hidden="true" />
                Finding ideas for when you&apos;re feeling {moodLabel(request.mood).toLowerCase()}…
              </p>
            )}

            {request.status === "success" && (
              <p className="result-meta">
                <span className="mood-tag">{moodLabel(request.result.mood)}</span>
                <span className="source-tag">Mood chosen manually</span>
              </p>
            )}
          </div>

          {request.status === "error" && (
            <div className="error-box" role="alert">
              <p className="error-title">
                Couldn&apos;t load recommendations for “{moodLabel(request.mood)}”.
              </p>
              <p>{request.message}</p>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => void loadRecommendations(request.mood)}
              >
                Try again
              </button>
            </div>
          )}

          {request.status === "success" && (
            <RecommendationList items={request.result.recommendations} />
          )}

          {selectionDiffers && selectedMood && (
            <p className="selection-note">
              You&apos;ve selected <strong>{moodLabel(selectedMood)}</strong>. Select “Get
              recommendations” to update.
            </p>
          )}

          {request.status === "success" && (
            <div className="actions">
              <button type="button" className="button button-secondary" onClick={focusPicker}>
                Choose a different mood
              </button>
            </div>
          )}
        </section>
      </main>

      <footer className="site-footer">
        <p>
          TasteSync Phase 1 · Mood-to-food pairings are curated design choices, not scientific
          findings or medical or nutritional advice.
        </p>
      </footer>
    </div>
  );
}
