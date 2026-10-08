import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { config } from '../config';
import { ReservationsService } from './reservations.service';

@Injectable()
export class ExpiryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExpiryService.name);
  private timer?: NodeJS.Timeout;
  private stopped = false;

  constructor(private readonly reservations: ReservationsService) {}

  onModuleInit() {
    if (!config.sweeperEnabled) {
      this.logger.warn('Sweeper disabled (SWEEPER_ENABLED=false)');
      return;
    }
    this.logger.log(`Sweeper started: every ${config.sweepIntervalMs}ms`);
    this.schedule();
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule() {
    this.timer = setTimeout(async () => {
      try {
        this.logger.debug('sweep tick');
        await this.reservations.releaseExpired();
      } catch (err) {
        this.logger.error('Sweep failed', err as Error);
      } finally {
        if (!this.stopped) this.schedule();
      }
    }, config.sweepIntervalMs);
  }
}