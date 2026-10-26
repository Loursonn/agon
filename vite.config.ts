import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(() => ({
  server: {
    host: "localhost",
    port: 5173,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  test: {
    environment: "jsdom",
    // Requis par @testing-library/jest-dom, qui appelle expect.extend au chargement.
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Les worktrees Claude contiennent une copie du repo : sans exclusion,
    // chaque test tourne deux fois.
    exclude: ["**/node_modules/**", "**/dist/**", ".claude/**"],
  },
}));
