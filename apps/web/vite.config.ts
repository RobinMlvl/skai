import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Ports can move (e.g. to run a second copy): SKAI_PORT for the API, SKAI_WEB_PORT for this server.
const apiPort = Number(process.env.SKAI_PORT ?? 4317);
const webPort = Number(process.env.SKAI_WEB_PORT ?? 5173);

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: webPort,
    strictPort: true,
    // Keep the Host header (changeOrigin: false): the API only accepts known local hosts.
    proxy: { "/api": { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false } },
  },
});
