import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  // Relative base: the same build runs on Vercel, on a sub-path, from file://,
  // and inside a Capacitor WebView.
  base: "./",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 3000,
    host: true,
  },
  build: {
    outDir: "dist",
    target: "es2020",
    // MediaPipe ships a multi-megabyte wasm bundle; leave it as its own chunk.
    chunkSizeWarningLimit: 1600,
  },
  // MediaPipe Tasks Vision uses a wasm fileset loaded at runtime, so it must not
  // be pre-bundled into the dependency graph.
  optimizeDeps: {
    exclude: ["@mediapipe/tasks-vision"],
  },
});
