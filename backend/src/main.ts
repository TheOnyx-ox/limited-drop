import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { httpLogger } from './common/http-logger.middleware';
import { logLevels } from './common/log-levels';
import { config } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: logLevels() });
  app.use(httpLogger);
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(config.port);

  const db = new URL(config.databaseUrl);
  Logger.log(
    `Listening on :${config.port} | db=${db.hostname}:${db.port || 5432}${db.pathname} | ` +
      `ttl=${config.reservationTtlMs}ms | sweeper=${config.sweeperEnabled ? `every ${config.sweepIntervalMs}ms` : 'off'}`,
    'Bootstrap',
  );
}
bootstrap();