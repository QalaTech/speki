import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@features": path.resolve(__dirname, "./src/features"),
      "@shared": path.resolve(__dirname, "./src/shared"),
      "@test": path.resolve(__dirname, "./src/test"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: [],
    include: ["src/**/*.perf.test.ts", "src/**/*.perf.test.tsx"],
  },
});
