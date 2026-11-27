import type { Ref } from "react";
import { MOODS, MOOD_DETAILS, type Mood } from "../../../shared/moods";

interface MoodPickerProps {
  selectedMood: Mood | null;
  onChange: (mood: Mood) => void;
  errorId?: string;
  ref?: Ref<HTMLFieldSetElement>;
  legend?: string;
  /** Prefix for element ids and the radio group name, so two pickers can coexist. */
  idPrefix?: string;
}

/**
 * A group of native radio buttons styled as cards. Native radios give us
 * keyboard support (Tab into the group, arrow keys to move) for free.
 */
export function MoodPicker({
  selectedMood,
  onChange,
  errorId,
  ref,
  legend = "How are you feeling?",
  idPrefix = "mood",
}: MoodPickerProps) {
  return (
    <fieldset
      ref={ref}
      className="mood-picker"
      aria-describedby={errorId}
      aria-invalid={errorId ? true : undefined}
    >
      <legend className="section-title">{legend}</legend>
      <div className="mood-grid">
        {MOODS.map((mood) => {
          const { label, description } = MOOD_DETAILS[mood];
          const labelId = `${idPrefix}-${mood}-label`;
          const descriptionId = `${idPrefix}-${mood}-description`;
          return (
            <label key={mood} className="mood-option">
              <input
                className="mood-input"
                type="radio"
                name={idPrefix}
                value={mood}
                checked={selectedMood === mood}
                onChange={() => onChange(mood)}
                aria-labelledby={labelId}
                aria-describedby={descriptionId}
              />
              <span className="mood-card">
                <span className="mood-label" id={labelId}>
                  {label}
                </span>
                <span className="mood-description" id={descriptionId}>
                  {description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
