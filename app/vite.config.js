import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '小克的世界',
        short_name: '小克',
        display: 'fullscreen',
        background_color: '#f7f8fa',
        theme_color: '#f7f8fa',
        icons: [
          { src: '/cats/white.png', sizes: '192x192', type: 'image/png' }
        ]
      }
    })
  ]
})
