import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import { fileURLToPath, URL } from "node:url"

// The embedded frontend is served separately from the Express backend.
// During local dev we proxy API + auth + webhook routes to the backend
// so the browser stays on a single origin (required for App Bridge).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const backend = env.VITE_BACKEND_URL || "http://localhost:3000"

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./", import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": { target: backend, changeOrigin: true },
        "/auth": { target: backend, changeOrigin: true },
        "/webhooks": { target: backend, changeOrigin: true },
      },
    },
    build: {
      outDir: "dist",
      sourcemap: true,
    },
  }
})
