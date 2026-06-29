import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import { fileURLToPath, URL } from "node:url"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const backend = env.VITE_BACKEND_URL ?? "http://localhost:3000"

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
        "/api": {
          target: backend,
          changeOrigin: true,
        },
        "/auth": {
          target: backend,
          changeOrigin: true,
        },
        "/webhooks": {
          target: backend,
          changeOrigin: true,
        },
      },
    },

    build: {
      outDir: "dist",
      sourcemap: true,
    },
  }
})
