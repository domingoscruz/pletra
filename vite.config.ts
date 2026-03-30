// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * We use 'as any' here because VITE+ requires the custom 'staged' property,
 * which is not part of the standard Vite UserConfig type.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // @ts-ignore - Required by VITE+ pre-commit script
  staged: {
    "*": "vp check --fix",
  },
} as any);
