import express from "express";

import type { TownSnapshotReader } from "./town-snapshot-service.js";
import { registerTownSnapshotRoute, townApiErrorHandler } from "./town-http.js";

export interface AppStatus {
  githubConfigured: boolean;
  databaseReady: boolean;
}

export interface AppServices {
  townSnapshots?: TownSnapshotReader | null;
  /** Built Vite assets. Omit in API-only tests and while using the Vite dev server. */
  staticDirectory?: string;
}

export function createApp(status: AppStatus, services: AppServices = {}): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));

  app.get("/api/health", (_request, response) => {
    response.json({
      status: "ok",
      github: status.githubConfigured ? "configured" : "token-required",
      database: status.databaseReady ? "ready" : "unavailable",
    });
  });

  registerTownSnapshotRoute(app, services.townSnapshots ?? null);

  app.use("/api", (_request, response) => {
    response.status(404).json({ error: "not_found" });
  });

  if (services.staticDirectory) {
    app.use(express.static(services.staticDirectory, { index: "index.html" }));
  }

  app.use(townApiErrorHandler);

  return app;
}
