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
      // notifications to Vite. Poll source files without scanning imported
      // 3D asset packs every 250ms; those large directories are static during
      // a dev session and make the server unresponsive when polled recursively.
      usePolling: true,
      interval: 1500,
      ignored: ["**/packages/client/assets/**"],
    },
  },
});
