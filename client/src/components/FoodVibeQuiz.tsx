import { useEffect, useRef, useState } from "react";
import { MOOD_DETAILS, type Mood, type MoodSource } from "../../../shared/moods";
import {
  QUIZ_QUESTIONS,
  joinReasons,
  scoreQuiz,
  type QuizAnswers,
  type QuizResult,
} from "../quiz/foodVibeQuiz";
import { MoodPicker } from "./MoodPicker";

export interface QuizConfirmation {
  mood: Mood;
  /** "quiz" if the suggestion was confirmed as-is, "manual" if the user changed it. */
  source: MoodSource;
  suggestedMood: Mood;
}

interface FoodVibeQuizProps {
  onConfirm: (confirmation: QuizConfirmation) => void;
  /** True while recommendations for this quiz are loading. */
  isLoading?: boolean;
}

const TOTAL = QUIZ_QUESTIONS.length;

function label(mood: Mood): string {
  return MOOD_DETAILS[mood].label;
}

/**
 * A five-question quiz that suggests a food vibe (one of the five moods). The
 * user must confirm or change the suggestion before recommendations load.
 * Results are never saved; only the manual mood picker remembers a mood.
 */
export function FoodVibeQuiz({ onConfirm, isLoading = false }: FoodVibeQuizProps) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [showAnswerError, setShowAnswerError] = useState(false);
  const [changing, setChanging] = useState(false);
  const [chosenMood, setChosenMood] = useState<Mood | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const hasInteracted = useRef(false);

  // Move focus to the new heading when the step changes (not on first render).
  useEffect(() => {
    if (hasInteracted.current) headingRef.current?.focus();
  }, [step, result]);

  const question = QUIZ_QUESTIONS[step]!;
  const selected = answers[question.id];
  const answeredCount = QUIZ_QUESTIONS.filter((q) => answers[q.id]).length;
  const errorId = `quiz-${question.id}-error`;

  function go(next: () => void) {
    hasInteracted.current = true;
    next();
  }

  function handleNext() {
    if (!selected) {
      setShowAnswerError(true);
      return;
    }
    setShowAnswerError(false);
    go(() => {
      if (step < TOTAL - 1) {
        setStep(step + 1);
      } else {
        const scored = scoreQuiz(answers);
        setResult(scored);
        setChosenMood(scored.mood);
        setChanging(false);
      }
    });
  }

  function handleBack() {
    setShowAnswerError(false);
    go(() => {
      if (result) {
        setResult(null);
        setStep(TOTAL - 1);
      } else if (step > 0) {
        setStep(step - 1);
      }
    });
  }

  function handleRestart() {
    go(() => {
      setAnswers({});
      setResult(null);
      setStep(0);
      setShowAnswerError(false);
      setChanging(false);
      setChosenMood(null);
    });
  }

  if (result) {
    const finalMood = chosenMood ?? result.mood;
    const changed = finalMood !== result.mood;
    const decidingQuestion = QUIZ_QUESTIONS.find((q) => q.id === result.tieBreak?.decidedBy);

    return (
      <div className="quiz">
        <p className="quiz-progress-text">Quiz complete</p>
        <h3 ref={headingRef} tabIndex={-1} className="quiz-heading">
          Your food vibe: {label(result.mood)}
        </h3>
        <p className="quiz-explanation">
          We matched you to <strong>{label(result.mood)}</strong> because you{" "}
          {joinReasons(result.reasons)}.
        </p>
        {result.tieBreak && (
          <p className="quiz-tiebreak">
            {result.tieBreak.tiedMoods.map(label).join(" and ")} scored the same.{" "}
            {decidingQuestion
              ? `Your answer to “${decidingQuestion.prompt}” settled it.`
              : "We used TasteSync's standard mood order to settle it."}
          </p>
        )}
        <p className="quiz-disclaimer">
          This is a playful food match based on your answers, not a read on how you actually feel.
          Change it if it doesn&apos;t fit.
        </p>

        {changing && (
          <MoodPicker
            idPrefix="quiz-mood"
            legend="Pick a different vibe"
            selectedMood={finalMood}
            onChange={setChosenMood}
          />
        )}

        {changed && (
          <p className="selection-note">
            Suggested: <strong>{label(result.mood)}</strong> · You picked:{" "}
            <strong>{label(finalMood)}</strong>
          </p>
        )}

        <div className="actions">
          <button
            type="button"
            className="button button-primary"
            disabled={isLoading}
            onClick={() =>
              onConfirm({
                mood: finalMood,
                source: changed ? "manual" : "quiz",
                suggestedMood: result.mood,
              })
            }
          >
            {isLoading ? "Finding food…" : `Get ${label(finalMood)} food ideas`}
          </button>
          {!changing && (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setChanging(true)}
            >
              Choose a different vibe
            </button>
          )}
          <button type="button" className="button button-secondary" onClick={handleBack}>
            Back to my answers
          </button>
          <button type="button" className="button button-text" onClick={handleRestart}>
            Restart quiz
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="quiz">
      <div className="quiz-progress">
        <p className="quiz-progress-text" id="quiz-progress-label">
          Question {step + 1} of {TOTAL}
          <span className="visually-hidden">
            {" "}
            ({answeredCount} of {TOTAL} answered)
          </span>
        </p>
        <div
          className="quiz-progress-bar"
          role="progressbar"
          aria-labelledby="quiz-progress-label"
          aria-valuemin={1}
          aria-valuemax={TOTAL}
          aria-valuenow={step + 1}
        >
          <span style={{ width: `${((step + 1) / TOTAL) * 100}%` }} />
        </div>
      </div>

      <fieldset
        className="quiz-question"
        aria-describedby={showAnswerError ? errorId : undefined}
        aria-invalid={showAnswerError || undefined}
      >
        <legend className="quiz-legend">
          <span className="quiz-topic">{question.topic}</span>
          <span ref={headingRef} tabIndex={-1} className="quiz-heading">
            {question.prompt}
          </span>
        </legend>
        <div className="quiz-options">
          {question.options.map((option) => (
            <label key={option.id} className="quiz-option">
              <input
                className="quiz-input"
                type="radio"
                name={`quiz-${question.id}`}
                value={option.id}
                checked={selected === option.id}
                onChange={() => {
                  setAnswers((current) => ({ ...current, [question.id]: option.id }));
                  setShowAnswerError(false);
                }}
              />
              <span className="quiz-option-card">{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {showAnswerError && (
        <p id={errorId} className="field-error" role="alert">
          Choose an answer to continue.
        </p>
      )}

      <div className="actions">
        <button
          type="button"
          className="button button-secondary"
          onClick={handleBack}
          disabled={step === 0}
        >
          Back
        </button>
        <button type="button" className="button button-primary" onClick={handleNext}>
          {step === TOTAL - 1 ? "See my food vibe" : "Next"}
        </button>
        {answeredCount > 0 && (
          <button type="button" className="button button-text" onClick={handleRestart}>
            Restart quiz
          </button>
        )}
      </div>
    </div>
  );
}
