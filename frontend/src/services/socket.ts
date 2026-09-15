import { io, Socket } from 'socket.io-client';

const backendUrl = import.meta.env.VITE_BACKEND_URL || undefined;

// Khởi tạo socket.io client. Nếu có VITE_BACKEND_URL (deploy Vercel + Cloudflare Tunnel), sẽ kết nối trực tiếp đến backend URL.
export const socket: Socket = io(backendUrl, {
  autoConnect: true,
  transports: ['websocket', 'polling'],
});

