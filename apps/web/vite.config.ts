import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => ({
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
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ["react", "react-dom"] },
  optimizeDeps: { include: ["react", "react-dom", "react/jsx-runtime"] },
}));
