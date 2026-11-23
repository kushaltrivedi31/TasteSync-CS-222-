import type { Ref } from "react";
import { MOODS, MOOD_DETAILS, type Mood } from "../../../shared/moods";

interface MoodPickerProps {
  selectedMood: Mood | null;
  onChange: (mood: Mood) => void;
  errorId?: string;
  ref?: Ref<HTMLFieldSetElement>;
}

/**
 * A group of native radio buttons styled as cards. Native radios give us
 * keyboard support (Tab into the group, arrow keys to move) for free.
 */
export function MoodPicker({ selectedMood, onChange, errorId, ref }: MoodPickerProps) {
  return (
    <fieldset
      ref={ref}
      className="mood-picker"
      aria-describedby={errorId}
      aria-invalid={errorId ? true : undefined}
    >
      <legend className="section-title">How are you feeling?</legend>
      <div className="mood-grid">
        {MOODS.map((mood) => {
          const { label, description } = MOOD_DETAILS[mood];
          const labelId = `mood-${mood}-label`;
          const descriptionId = `mood-${mood}-description`;
          return (
            <label key={mood} className="mood-option">
              <input
                className="mood-input"
                type="radio"
                name="mood"
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
