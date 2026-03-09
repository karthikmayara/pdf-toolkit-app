import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import sitemap from "vite-plugin-sitemap"

export default defineConfig({
  base: '/pdf-toolkit-app/',

  plugins: [
    react(),
    sitemap({
      hostname: "https://karthikmayara.github.io",
      dynamicRoutes: [
        "/pdf-toolkit-app/"
      ]
    })
  ],

  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  }
})