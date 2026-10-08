import type { LogLevel } from '@nestjs/common';

export function logLevels(name = process.env.LOG_LEVEL ?? 'info'): LogLevel[] {
  switch (name.toLowerCase()) {
    case 'debug':
      return ['debug', 'log', 'warn', 'error', 'fatal'];
    case 'warn':
      return ['warn', 'error', 'fatal'];
    case 'error':
      return ['error', 'fatal'];
    default:
      return ['log', 'warn', 'error', 'fatal'];
  }
}