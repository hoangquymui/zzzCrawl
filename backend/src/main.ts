import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger("Bootstrap");

  // Bật CORS cho toàn bộ request từ Frontend Vite (cổng 5173, etc.)
  app.enableCors({
    origin: "*",
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
  });

  // Đặt tiền tố toàn cục /api cho tất cả REST endpoints
  app.setGlobalPrefix("api");

  // Kích hoạt Validation Pipe tự động kiểm tra DTO
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const PORT = Number(process.env.PORT) || 3000;
  await app.listen(PORT);

  logger.log(`\n======================================================`);
  logger.log(`🚀 NESTJS BACKEND ĐANG CHẠY TẠI:`);
  logger.log(`👉 http://localhost:${PORT} (hoặc http://127.0.0.1:${PORT})`);
  logger.log(`======================================================\n`);
}

bootstrap();
