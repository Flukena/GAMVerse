import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    allowedHosts: [process.env.DEV_HOST ?? "localhost", "localhost"],
    watch: {
      // Docker Desktop on Windows does not always forward bind-mount file
      // notifications to Vite. Polling keeps dev UI updates in sync.
      usePolling: true,
      interval: 250,
    },
  },
});
