import { defineConfig } from 'vite';

// Cloudflare Pages 배포 대상. 빌드 산출물은 dist/ 로 고정한다.
//   - Pages 프로젝트 설정: Build command `npm run build`, Output directory `dist`
//   - 로컬 배포: `npm run deploy` (wrangler pages deploy)
export default defineConfig({
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    host: true, // 같은 네트워크의 실제 모바일/태블릿 기기에서 접속해 확인하기 위함
    port: 5173,
  },
});
