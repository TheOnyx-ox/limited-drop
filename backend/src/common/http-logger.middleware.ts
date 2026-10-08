import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const logger = new Logger('HTTP');


export function httpLogger(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const user = req.header('x-user-id') ?? '-';
    const line = `${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(0)}ms user=${user}`;

    if (res.statusCode >= 500) logger.error(line);
    else if (res.statusCode >= 400) logger.warn(line);
    else logger.log(line);
  });

  next();
}