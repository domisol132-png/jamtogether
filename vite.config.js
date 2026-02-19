import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['vite.svg'], // 🌟 기본 아이콘 사용
      manifest: {
        name: '잼투게더',
        short_name: 'JamTogether',
        description: '합주실 빈 방을 1초 만에 찾아보세요.',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'vite.svg', // 🌟 피크 대신 기본 아이콘 연결
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: 'vite.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ],
})