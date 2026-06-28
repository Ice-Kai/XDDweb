// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  security: {
    // Nginx 反代到 localhost 会让 Astro 的 multipart origin check 误判。
    // 后台接口仍由 src/middleware.ts 的 ALLOWED_ORIGINS 白名单保护。
    checkOrigin: false,
  },
  vite: {
    server: {
      allowedHosts: [
        'belongstoai.com',
        'www.belongstoai.com',
        '.trycloudflare.com',
      ],
    },
    plugins: [tailwindcss()]
  }
});
