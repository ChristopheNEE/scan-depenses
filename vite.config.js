import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// L'app est servie sur https://christophenee.github.io/scan-depenses/
export default defineConfig({
  base: "/scan-depenses/",
  plugins: [react()],
});
