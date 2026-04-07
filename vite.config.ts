import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Vite configuration for the Pletra project.
 * Includes support for React, Tailwind CSS, and Vitest.
 *
 * The 'staged' property is used by the Vite Plus (Vite+)
 * pre-commit tool to validate code quality.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./setupTests.ts",
    include: [
      "./*.{test,spec}.{ts,tsx}",
      "./app/**/*.{test,spec}.{ts,tsx}",
      "./components/**/*.{test,spec}.{ts,tsx}",
      "./lib/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: ["**/node_modules/**", "**/.git/**"],
  },
  // @ts-ignore - Required by VITE+ pre-commit script
  staged: {
    "*": "vp check --fix",
  },
} as any);
