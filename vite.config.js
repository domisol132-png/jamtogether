import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'JamTogether',
        short_name: '잼투게더',
        description: '1초만에 합주실 예약하기',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone', // 🌟 브라우저 주소창을 없애고 진짜 앱처럼 보이게 함
        icons: [
          {
            src: 'icon.png', // 🚨 중요: public 폴더에 이 이름의 이미지가 있어야 함!
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ]
})