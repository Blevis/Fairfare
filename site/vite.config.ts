import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves a project site from https://<owner>.github.io/<repo>/ .
// The repo is "Fairfare", so the default base is "/Fairfare/". Override with BASE_PATH=/ for a
// user/organisation site or a custom domain.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/Fairfare/",
  plugins: [react()],
  build: { outDir: "dist", sourcemap: false, chunkSizeWarningLimit: 800 },
});
