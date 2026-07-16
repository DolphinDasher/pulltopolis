import path from "node:path";

import { loadConfig } from "./config.js";
import { createRuntime } from "./runtime.js";
import { TOWN_SNAPSHOT_RUNTIME_OPTIONS } from "./town-runtime.js";

const config = loadConfig();
const runtime = createRuntime(config, {
  townSnapshots: TOWN_SNAPSHOT_RUNTIME_OPTIONS,
  staticDirectory: path.resolve("dist/client"),
});
const server = runtime.app.listen(config.port, config.host, () => {
  console.log(`PullTopolis server listening at http://${config.host}:${config.port}`);
});

let closing = false;
function close(signal: string): void {
  if (closing) return;
  closing = true;
  console.log(`${signal} received; closing PullTopolis`);
  server.close((error) => {
    runtime.close();
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", () => close("SIGINT"));
process.on("SIGTERM", () => close("SIGTERM"));
