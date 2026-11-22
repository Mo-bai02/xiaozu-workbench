import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * 脚手架说明：
 * - 别名 @ 指向 src，避免 ../../../ 地狱
 * - /api 代理到本地 mock 服务，前端不需要处理 CORS
 * - manualChunks 把 react / antd / markdown 拆开：antd 体积大但很少变，
 *   单独分包后用户第二次访问命中缓存，业务代码更新不影响它
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      open: false,
      // 别去 watch 缓存目录：浏览器/构建工具会在里面写锁定文件，会导致 EBUSY 崩掉 dev server
      watch: {
        ignored: ['**/.cache/**', '**/dist/**', '**/coverage/**'],
      },
      proxy: {
        '/api': {
          target: env.VITE_PROXY_TARGET || 'http://127.0.0.1:8787',
          changeOrigin: true,
        },
      },
    },
    // 预览生产构建时同样把 /api 代理到本地服务，方便验证「构建产物 + 真接口」
    preview: {
      port: 4173,
      proxy: {
        '/api': {
          target: env.VITE_PROXY_TARGET || 'http://127.0.0.1:8787',
          changeOrigin: true,
        },
      },
    },
    build: {
      target: 'es2020',
      sourcemap: mode !== 'production',
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          // 只固定 react 运行时；antd 交给路由懒加载自然拆分，
          // 首屏只加载 shell + chat，另外两个页面按需拉取
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
          },
        },
      },
    },
  };
});
