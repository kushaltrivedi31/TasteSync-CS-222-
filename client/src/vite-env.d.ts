/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public, referrer-restricted browser key for the Maps JavaScript API. */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  /** Map ID for Advanced Markers. Defaults to Google's DEMO_MAP_ID. */
  readonly VITE_GOOGLE_MAPS_MAP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
