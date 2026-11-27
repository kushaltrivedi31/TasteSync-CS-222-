/**
 * A tiny stand-in for Google Places API (New) Text Search, used only by the
 * Playwright suite. The TasteSync server is pointed at it with
 * GOOGLE_PLACES_API_BASE_URL, so browser tests exercise the real server code
 * (validation, field mask, normalization) without a Google account.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_GOOGLE_PORT ?? 3199);
export const MOCK_KEY = "e2e-test-key";

interface TextSearchBody {
  textQuery?: string;
  locationBias?: unknown;
}

function placesFor(body: TextSearchBody) {
  const query = (body.textQuery ?? "").toLowerCase();
  const area = query.includes("chicago") ? "Chicago" : body.locationBias ? "Nearby" : "Champaign";
  const lat = area === "Chicago" ? 41.88 : 40.11;
  const lng = area === "Chicago" ? -87.63 : -88.23;
  if (query.includes("peruvian")) return [];
  return [1, 2, 3].map((n) => ({
    id: `mock-${area.toLowerCase()}-${n}`,
    displayName: { text: `${area} Mock Spot ${n}`, languageCode: "en" },
    formattedAddress: `${n}00 Main St, ${area}, IL, USA`,
    location: { latitude: lat + n / 200, longitude: lng },
    googleMapsUri: `https://maps.google.com/?cid=${area.length}${n}`,
  }));
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200).end("ok");
    return;
  }
  if (req.method !== "POST" || req.url !== "/v1/places:searchText") {
    res.writeHead(404).end();
    return;
  }
  if (req.headers["x-goog-api-key"] !== MOCK_KEY || !req.headers["x-goog-fieldmask"]) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { code: 403, status: "PERMISSION_DENIED" } }));
    return;
  }
  let raw = "";
  req.on("data", (chunk: Buffer) => (raw += chunk.toString()));
  req.on("end", () => {
    const body = JSON.parse(raw || "{}") as TextSearchBody;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ places: placesFor(body) }));
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Mock Google Places listening on http://127.0.0.1:${PORT}`);
});
