/**
 * Explains why TasteSync does not suggest a mood from Spotify listening data.
 * This is deliberately informational only: there is no connect button, because
 * the integration is not implemented (see "Spotify integration" in README.md).
 */
export function SpotifyUnavailableNotice() {
  return (
    <aside className="integration-note" aria-labelledby="spotify-note-title">
      <div className="integration-note-header">
        <h3 id="spotify-note-title" className="integration-note-title">
          Music-based mood suggestions
        </h3>
        <span className="status-pill">Not available</span>
      </div>
      <p>
        TasteSync doesn&apos;t guess your mood from Spotify. Spotify&apos;s Developer Policy
        doesn&apos;t allow apps to analyze listening data to build a picture of a user, and the
        audio details that could make a guess meaningful aren&apos;t available to new apps. Your
        mood always comes from what you choose above.
      </p>
      <p className="integration-note-source">
        Source:{" "}
        <a href="https://developer.spotify.com/policy" target="_blank" rel="noopener noreferrer">
          Spotify Developer Policy
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
      </p>
    </aside>
  );
}
