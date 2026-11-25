import { isMood, type Mood } from "../../shared/moods";

export const SELECTED_MOOD_STORAGE_KEY = "tastesync:selected-mood";

/**
 * Returns the last mood the user picked, or null if none was saved, the saved
 * value isn't a supported mood, or storage is unavailable (e.g. blocked by
 * privacy settings). Storage problems never break mood selection.
 */
export function loadSelectedMood(): Mood | null {
  try {
    const saved = window.localStorage.getItem(SELECTED_MOOD_STORAGE_KEY);
    return isMood(saved) ? saved : null;
  } catch {
    return null;
  }
}

/** Remembers the selected mood. Fails silently if storage is unavailable or full. */
export function saveSelectedMood(mood: Mood): void {
  try {
    window.localStorage.setItem(SELECTED_MOOD_STORAGE_KEY, mood);
  } catch {
    // Ignore: remembering the mood is a convenience, not a requirement.
  }
}
