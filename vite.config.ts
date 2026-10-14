import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import { npcApiMiddleware } from "./scripts/npc-api-middleware.mjs";

export default defineConfig(({ mode }) => {
  // These unprefixed Azure settings stay in the Node server, outside Vite's
  // browser environment. No provider key or endpoint is placed in app bundles.
  const environment = loadEnv(mode, process.cwd(), "");
  const middleware = () => npcApiMiddleware(environment);
  return {
    plugins: [{
      name: "npc-brain-api",
      configureServer(server) { server.middlewares.use(middleware()); },
      configurePreviewServer(server) { server.middlewares.use(middleware()); },
    }],
    build: {
      rollupOptions: {
        input: {
          game: fileURLToPath(new URL("./index.html", import.meta.url)),
          preview: fileURLToPath(new URL("./3d.html", import.meta.url)),
        },
      },
    },
  };
});
