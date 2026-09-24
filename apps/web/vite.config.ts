import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    // Keep the Host header (changeOrigin: false): the API only accepts known local hosts.
    proxy: { "/api": { target: "http://127.0.0.1:4317", changeOrigin: false } },
  },
});
