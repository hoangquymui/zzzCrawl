import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://127.0.0.1:3000',
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            // Tránh văng AggregateError khi backend server chưa bật hoặc đang khởi động lại
            if ((err as { code?: string })?.code === 'ECONNREFUSED') {
              // Bỏ qua lỗi kết nối tạm thời khi backend chưa chạy
              return;
            }
            console.warn('[Proxy WS Error]:', (err as Error)?.message || err);
          });
        },
      },
    },
  },
});
