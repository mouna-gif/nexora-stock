import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Frontend Vite — Nexora Smart Stock AI.
// L'API FastAPI est joignable via VITE_API_BASE_URL (ex. http://127.0.0.1:8000).
// En développement, le proxy intégré évite tout problème de CORS :
// les appels relatifs "/api/v1/..." sont transférés vers le backend local.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET ?? "http://127.0.0.1:8000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
