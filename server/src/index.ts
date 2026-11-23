import { createApp } from "./app.js";

const DEFAULT_PORT = 3001;

function readPort(value: string | undefined): number {
  if (value === undefined || value === "") return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535 (got "${value}")`);
  }
  return port;
}

const port = readPort(process.env.PORT);

createApp().listen(port, (error) => {
  if (error) {
    console.error(`TasteSync API failed to start on port ${port}:`, error.message);
    process.exit(1);
  }
  console.log(`TasteSync API listening on http://localhost:${port}`);
});
