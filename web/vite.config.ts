import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/auth": {
        target: process.env.VITE_API_TARGET ?? "http://127.0.0.1:3000",
        changeOrigin: true,
        secure: false,
      },
      "/me": {
        target: process.env.VITE_API_TARGET ?? "http://127.0.0.1:3000",
        changeOrigin: true,
        secure: false,
      },
      "/workspaces": {
        target: process.env.VITE_API_TARGET ?? "http://127.0.0.1:3000",
        changeOrigin: true,
        secure: false,
      },
      "/health": {
        target: process.env.VITE_API_TARGET ?? "http://127.0.0.1:3000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
