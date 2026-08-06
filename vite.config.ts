import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Cloudflare Pages 배포 대상. 빌드 산출물은 dist/ 로 고정한다.
//   - Pages 프로젝트 설정: Build command `npm run build`, Output directory `dist`
//   - 로컬 배포: `npm run deploy` (wrangler pages deploy)
export default defineConfig({
  plugins: [
    // 오프라인 플레이 + 홈 화면 설치.
    // 교실 와이파이가 불안정해도 한 번 열었으면 계속 되게 하는 것이 목적이다.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png', '404.html'],
      manifest: {
        name: '수학 용사',
        short_name: '수학용사',
        description: '문제를 풀어 강해지는 10분 생존 수학 게임',
        lang: 'ko',
        start_url: './',
        scope: './',
        display: 'fullscreen',
        orientation: 'any',
        background_color: '#1b2416',
        theme_color: '#1b2416',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,woff2}'],
        // 랭킹 API 는 절대 캐시하지 않는다 — 오래된 순위를 보여 주면 안 된다
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'font-cdn', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
        ],
      },
    }),
  ],
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: {
        // 게임 본편
        main: 'index.html',
        // 퀴즈 어댑터 검수 페이지 (개발용, /poc.html)
        poc: 'poc.html',
      },
    },
  },
  server: {
    host: true, // 같은 네트워크의 실제 모바일/태블릿 기기에서 접속해 확인하기 위함
    port: 5173,
  },
});
