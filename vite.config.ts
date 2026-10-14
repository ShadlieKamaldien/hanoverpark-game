import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        game: fileURLToPath(new URL("./index.html", import.meta.url)),
        preview: fileURLToPath(new URL("./3d.html", import.meta.url)),
      },
    },
  },
});
