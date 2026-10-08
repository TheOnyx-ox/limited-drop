import { Module } from '@nestjs/common';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { ExpiryService } from './expiry.service';

@Module({
  controllers: [ReservationsController],
  providers: [ReservationsService, ExpiryService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
