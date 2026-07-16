import express from "express";

import type { RequestThrottle } from "./request-throttle.js";
import type { TownSnapshotReader } from "./town-snapshot-service.js";
import { registerTownSnapshotRoute, townApiErrorHandler } from "./town-http.js";

export interface AppStatus {
  githubConfigured: boolean;
  databaseReady: boolean;
}

export interface AppServices {
  townSnapshots?: TownSnapshotReader | null;
  requestThrottle?: RequestThrottle;
  trustProxy?: number;
  /** Built Vite assets. Omit in API-only tests and while using the Vite dev server. */
  staticDirectory?: string;
}

export function createApp(status: AppStatus, services: AppServices = {}): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", services.trustProxy ?? false);
  app.use((_request, response, next) => {
    response.set({
      "Content-Security-Policy":
        "default-src 'self'; connect-src 'self'; img-src 'self' data: https://avatars.githubusercontent.com; script-src 'self'; style-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
      "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
    next();
  });
  app.use(express.json({ limit: "32kb" }));

  app.get("/api/health", (_request, response) => {
    response.json({
      status: "ok",
      github: status.githubConfigured ? "configured" : "token-required",
      database: status.databaseReady ? "ready" : "unavailable",
    });
  });

  registerTownSnapshotRoute(app, services.townSnapshots ?? null, services.requestThrottle);

  app.use("/api", (_request, response) => {
    response.status(404).json({ error: "not_found" });
  });

  if (services.staticDirectory) {
    app.use(express.static(services.staticDirectory, { index: "index.html" }));
  }

  app.use(townApiErrorHandler);

  return app;
}
