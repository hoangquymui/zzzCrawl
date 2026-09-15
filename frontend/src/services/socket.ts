import { io, Socket } from 'socket.io-client';

// Khởi tạo socket.io client. Khi chạy Vite dev, proxy sẽ chuyển tiếp /socket.io sang cổng 3000
export const socket: Socket = io({
  autoConnect: true,
  transports: ['websocket', 'polling'],
});
