import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // Vite only needs the backend port. Never load GITHUB_TOKEN into this process.
  const env = loadEnv(mode, process.cwd(), "PORT");
  const backendPort = env.PORT || "3000";

  return {
    build: {
      outDir: "dist/client",
    },
    server: {
      proxy: {
        "/api": `http://127.0.0.1:${backendPort}`,
      },
    },
  };
});
