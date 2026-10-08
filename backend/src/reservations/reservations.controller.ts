import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { UserId } from '../common/user-id.decorator';
import { CheckoutView, CreateReservationDto, ReservationView } from './dto';
import { ReservationsService } from './reservations.service';

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly service: ReservationsService) {}

  @Post()
  create(@Body() dto: CreateReservationDto, @UserId() userId: string): Promise<ReservationView> {
    return this.service.reserve(dto.productId, userId, dto.quantity ?? 1);
  }

  @Get('active')
  active(@UserId() userId: string): Promise<ReservationView[]> {
    return this.service.listActive(userId);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @UserId() userId: string): Promise<ReservationView> {
    return this.service.get(id, userId);
  }

  @Post(':id/checkout')
  @HttpCode(200)
  checkout(@Param('id', ParseUUIDPipe) id: string, @UserId() userId: string): Promise<CheckoutView> {
    return this.service.checkout(id, userId);
  }

  @Delete(':id')
  cancel(@Param('id', ParseUUIDPipe) id: string, @UserId() userId: string): Promise<ReservationView> {
    return this.service.cancel(id, userId);
  }
}