import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { msw } from "msw/vite";
import { defineConfig, loadEnv } from "vite";

import { browserGatePlugin } from "./build/browser-gate";

export default defineConfig(({ mode, command }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(
      loadEnv(mode, ".", "APP_").APP_VERSION || "0.0.0",
    ),
  },
  server: {
    proxy: {
      "/health": "http://127.0.0.1:3000",
      "/api": "http://127.0.0.1:3000",
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    browserGatePlugin(),
    ...(command === "serve" ? [msw({ mode: "worker-only" })] : []),
  ],
  build: { target: ["chrome111", "edge111", "firefox128", "safari16.4"] },
  resolve: { dedupe: ["react", "react-dom"] },
  optimizeDeps: { include: ["react", "react-dom", "react/jsx-runtime"] },
}));
