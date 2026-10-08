import { INestApplication, ValidationPipe } from '@nestjs/common';
import { config } from './config';

export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableCors({
    origin: config.corsOrigins,
    allowedHeaders: ['Content-Type', 'x-user-id'],
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  });
}